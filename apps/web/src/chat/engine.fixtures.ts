import { AsyncLocalStorage } from "node:async_hooks";
import type {
  CreateChatRecoveryKey,
  ChatConversation,
  ChatDevice,
  ChatDeviceDescription,
  ChatDirectory,
  ChatInboxItem,
  DeviceCertificateWire,
  DeviceRevocationWire,
} from "@lanbort/contracts";
import type { chatApi as realChatApi } from "./api";
import { fromBase64, toBase64 } from "./bytes";
import type { ChatStore } from "./store";

/**
 * A delivery service in memory for engine tests: it behaves like the real
 * one (`packages/domain/src/chat`) where the engine relies on it, and lets
 * a test act as a malicious server by changing what it stores and serves.
 * Each call runs as the device whose context `on` set, so background work
 * an operation starts stays with its device.
 */

export interface DeviceContext {
  /** Which browser's storage the device uses. */
  browser: string;
  userId: string;
  session: string;
}

const context = new AsyncLocalStorage<DeviceContext>();

/** Runs `operation` as one device: its session, its browser. */
export const on = <T>(device: DeviceContext, operation: () => Promise<T>) =>
  context.run(device, operation);

const current = () => {
  const found = context.getStore();
  if (!found) throw new Error("no device context");
  return found;
};

// Storage: one in-memory store per browser and account.

const stores = new Map<string, Map<string, Uint8Array<ArrayBuffer>>>();
const storeName = (userId: string) => `${current().browser}:${userId}`;

export const memoryStores = {
  async openChatStore(userId: string): Promise<ChatStore> {
    const name = storeName(userId);
    let records = stores.get(name);
    if (!records) {
      records = new Map();
      stores.set(name, records);
    }
    const own = records;
    const store: ChatStore = {
      get: async (record) => {
        const value = own.get(record);
        return value && new Uint8Array(value);
      },
      put: async (record, value) => {
        own.set(record, new Uint8Array(value));
      },
      putAll: async (entries) => {
        for (const [record, value] of entries) {
          own.set(record, new Uint8Array(value));
        }
      },
      getJson: async <T>(record: string) => {
        const value = own.get(record);
        return value && (JSON.parse(new TextDecoder().decode(value)) as T);
      },
      putJson: async (record, value) => {
        own.set(record, new TextEncoder().encode(JSON.stringify(value)));
      },
      delete: async (record) => {
        own.delete(record);
      },
      names: async (prefix) =>
        [...own.keys()].filter((key) => key.startsWith(prefix)).sort(),
      destroy: async () => {
        own.clear();
        stores.delete(name);
      },
    };
    return store;
  },
  async deleteChatStore(userId: string): Promise<void> {
    stores.get(storeName(userId))?.clear();
    stores.delete(storeName(userId));
  },
};

/** A record of a device's store, for a test to look into. */
export const storedRecord = (device: DeviceContext, record: string) =>
  stores.get(`${device.browser}:${device.userId}`)?.get(record);

/** The names of a device's records that start with `prefix`. */
export const storedNames = (device: DeviceContext, prefix: string) =>
  [...(stores.get(`${device.browser}:${device.userId}`)?.keys() ?? [])].filter(
    (name) => name.startsWith(prefix),
  );

/** A record of a device's store as JSON, read or replaced by a test. */
export const storedJson = {
  get: <T>(device: DeviceContext, record: string) => {
    const value = storedRecord(device, record);
    return value && (JSON.parse(new TextDecoder().decode(value)) as T);
  },
  set: (device: DeviceContext, record: string, value: unknown) => {
    stores
      .get(`${device.browser}:${device.userId}`)!
      .set(record, new TextEncoder().encode(JSON.stringify(value)));
  },
};

/** The epoch of an MLS private message (RFC 9420 §6.3.1). */
export function epochOf(message: Uint8Array): bigint {
  let offset = 4; // version, wireformat
  const first = message[offset]!;
  const prefix = first >> 6;
  let length = first & 0x3f;
  offset += 1;
  for (let i = 0; i < (prefix === 0 ? 0 : prefix === 1 ? 1 : 3); i++) {
    length = length * 256 + message[offset++]!;
  }
  offset += length;
  let epoch = 0n;
  for (let i = 0; i < 8; i++)
    epoch = (epoch << 8n) | BigInt(message[offset++]!);
  return epoch;
}

interface DeviceRow extends ChatDevice {
  userId: string;
  session: string | null;
  keyPackages: string[];
  lastResort: string | null;
}

/** A history archive, with the life the real server gives it. */
interface ArchiveRow {
  userId: string;
  deviceId: string;
  purpose: "link" | "backup";
  linkRequestId: string | null;
  parts: (string | undefined)[];
  expiresAt: number;
}

interface ConversationRow {
  id: string;
  participants: [string, string];
  generation: number;
  epoch: number;
  members: Set<string>;
  startedAt: string;
}

interface LinkRow {
  linkRequestId: string;
  userId: string;
  session: string;
  deviceId: string;
  deviceKey: string;
  linkKey: string;
  commitment: string;
  description: ChatDeviceDescription;
  package: string | null;
}

type Failure =
  "conflict" | "network" | "not_found" | "forbidden" | "invalid_input";

/** The real `ChatApiError`, handed in by the test's mock of `./api`. */
let errorClass: new (code: Failure) => Error = class extends Error {};
export const useErrorClass = (value: typeof errorClass) => {
  errorClass = value;
};
const fail = (code: Failure): never => {
  throw new errorClass(code);
};

let clock = Date.parse("2026-10-01T10:00:00Z");
const now = () => new Date((clock += 1000)).toISOString();
/** chatRetention.archiveMs: an archive no backup points to, is gone after. */
const archiveMs = 60 * 60_000;

export class FakeChatServer {
  readonly accountKeys = new Map<string, string | null>();
  readonly devices = new Map<string, DeviceRow>();
  readonly conversations = new Map<string, ConversationRow>();
  readonly inboxes = new Map<string, ChatInboxItem[]>();
  readonly links = new Map<string, LinkRow>();
  readonly archives = new Map<string, ArchiveRow>();
  readonly recovery = new Map<
    string,
    { keyId: string; backup: string; archiveId: string | null }
  >();
  /** Every commit and message the server took, in order. */
  readonly log: {
    conversationId: string;
    deviceId: string;
    type: "commit" | "application";
    ciphertext: string;
    epoch: number;
  }[] = [];
  readonly #answers = new Map<string, unknown>();
  #position = 0;

  // What a malicious server may do; an honest one does none of it.
  /** Always hands out a device's last-resort key package. */
  lastResortOnly = false;
  /** Leaves revoked devices in their groups and their revocations out. */
  hideRevocations = false;
  /** Takes the next commit, then acts as if the answer was lost. */
  loseNextCommitAnswer = false;
  /** Takes the next new recovery key, then acts as if the answer was lost. */
  loseNextRecoveryAnswer = false;
  /**
   * Answers the next new recovery key as if the connection was lost, but
   * takes it only when the test runs `heldRecoveryKey`: a request still on
   * its way when the device tries again.
   */
  holdNextRecoveryKey = false;
  heldRecoveryKey: (() => Promise<void>) | null = null;
  /** Runs once after the next read of the backup, which it does not change. */
  afterBackupRead: (() => Promise<void>) | null = null;
  /** Says the backup has no history archive, whatever it points to. */
  hideBackupArchive = false;
  /** Overrides what the directory says, after the server built it. */
  directoryFilter: ((directory: ChatDirectory) => ChatDirectory) | null = null;
  /** Overrides what a conversation's page is told, likewise. */
  conversationFilter:
    ((conversation: ChatConversation) => ChatConversation) | null = null;

  /** Runs once before the next backup is taken: another device's turn. */
  beforeBackUp: (() => Promise<void>) | null = null;
  /** The backup cannot be read, for this reason. */
  failBackupRead: Failure | null = null;
  /** No new archive can be made: the connection is lost. */
  failArchives = false;
  /** No archive can be fetched: the connection is lost. */
  failArchiveReads = false;

  #complete = (archive: ArchiveRow) =>
    archive.parts.every((part) => part !== undefined);

  #attached = (archiveId: string) =>
    [...this.recovery.values()].some((r) => r.archiveId === archiveId);

  /** The caller's account's archive, still there and `usable`. */
  #ownArchive(id: string, usable: (archive: ArchiveRow) => boolean) {
    const archive = this.archives.get(id);
    if (
      !archive ||
      archive.userId !== current().userId ||
      (!this.#attached(id) && archive.expiresAt <= clock) ||
      !usable(archive)
    ) {
      fail("not_found");
    }
    return archive!;
  }

  #dropArchives(drop: (id: string, archive: ArchiveRow) => boolean) {
    for (const [id, archive] of this.archives) {
      if (!this.#attached(id) && drop(id, archive)) this.archives.delete(id);
    }
  }

  /**
   * The backup now. As the real server does, the archive it pointed to
   * goes, with the device's own unfinished ones; another device's stays
   * until it is attached or expires.
   */
  #attach(
    backup: { keyId: string; backup: string; archiveId: string | null },
    deviceId: string,
  ) {
    const { userId } = current();
    const previous = this.recovery.get(userId)?.archiveId ?? null;
    this.recovery.set(userId, backup);
    this.#dropBackups(userId, deviceId, previous);
  }

  #dropBackups(userId: string, deviceId: string, previous: string | null) {
    this.#dropArchives(
      (id, archive) =>
        archive.userId === userId &&
        archive.purpose === "backup" &&
        (archive.deviceId === deviceId || id === previous),
    );
  }

  /** A complete, live backup archive of the caller's, for a backup. */
  #backupArchive(archiveId: string) {
    this.#ownArchive(
      archiveId,
      (a) => a.purpose === "backup" && this.#complete(a),
    );
  }

  async #createRecoveryKey({
    keyId,
    backup,
    archiveId,
    replaces,
  }: CreateChatRecoveryKey) {
    const device = this.#device();
    if (archiveId !== null) this.#backupArchive(archiveId);
    await this.#checkReplaces(replaces);
    this.#attach({ keyId, backup, archiveId }, device.deviceId);
  }

  /** Time passes: archives no backup points to expire. */
  expireArchives() {
    clock += archiveMs;
    this.#dropArchives((_id, archive) => archive.expiresAt <= clock);
  }

  /** Only the backup the caller read is replaced, as the real server does. */
  async #checkReplaces(replaces: string | null) {
    const recovery = this.recovery.get(current().userId);
    const digest = recovery
      ? toBase64(
          new Uint8Array(
            await crypto.subtle.digest("SHA-256", fromBase64(recovery.backup)),
          ),
        )
      : null;
    if (digest !== replaces) fail("conflict");
  }

  #sessionDevice() {
    const { userId, session } = current();
    return [...this.devices.values()].find(
      (d) => d.userId === userId && d.session === session && !d.revokedAt,
    );
  }

  #device() {
    return this.#sessionDevice() ?? fail("forbidden");
  }

  #deliver(
    conversationId: string,
    generation: number,
    type: ChatInboxItem["type"],
    ciphertext: string,
    to: Iterable<string>,
  ) {
    const sentAt = now();
    let delivered = false;
    for (const deviceId of to) {
      const item: ChatInboxItem = {
        position: String(++this.#position),
        conversationId,
        generation,
        type,
        ciphertext,
        sentAt,
      };
      this.inboxOf(deviceId).push(item);
      delivered = true;
    }
    return { sentAt, delivered };
  }

  inboxOf(deviceId: string): ChatInboxItem[] {
    let inbox = this.inboxes.get(deviceId);
    if (!inbox) {
      inbox = [];
      this.inboxes.set(deviceId, inbox);
    }
    return inbox;
  }

  /** Puts an item in a device's inbox, as a malicious server may. */
  inject(deviceId: string, item: Omit<ChatInboxItem, "position" | "sentAt">) {
    this.inboxOf(deviceId).push({
      ...item,
      position: String(++this.#position),
      sentAt: now(),
    });
  }

  /** Every welcome the server ever delivered to a device. */
  readonly welcomes: (Omit<ChatInboxItem, "position" | "sentAt"> & {
    to: string;
  })[] = [];

  startConversation(a: string, b: string): string {
    const id = crypto.randomUUID();
    this.conversations.set(id, {
      id,
      participants: [a, b],
      generation: 1,
      epoch: 0,
      members: new Set(),
      startedAt: now(),
    });
    return id;
  }

  #conversation(id: string) {
    const conversation = this.conversations.get(id) ?? fail("not_found");
    if (!conversation.participants.includes(current().userId)) {
      fail("not_found");
    }
    return conversation;
  }

  #shutOut(row: DeviceRow, revocation: DeviceRevocationWire | null) {
    row.revokedAt = now();
    row.revocation = revocation;
    row.keyPackages = [];
    row.lastResort = null;
    row.session = null;
    if (this.hideRevocations) return;
    for (const conversation of this.conversations.values()) {
      conversation.members.delete(row.deviceId);
    }
    this.inboxes.delete(row.deviceId);
  }

  #insertDevice(
    userId: string,
    certificate: DeviceCertificateWire,
    session: string,
  ) {
    this.devices.set(certificate.deviceId, {
      userId,
      session,
      deviceId: certificate.deviceId,
      certificate,
      createdAt: now(),
      revokedAt: null,
      revocation: null,
      keyPackages: [],
      lastResort: null,
    });
  }

  #presented(row: DeviceRow): ChatDevice {
    const hidden =
      this.hideRevocations &&
      (row.revokedAt !== null || row.revocation !== null);
    return {
      deviceId: row.deviceId,
      certificate: row.certificate,
      createdAt: row.createdAt,
      revokedAt: hidden ? null : row.revokedAt,
      revocation: hidden ? null : row.revocation,
    };
  }

  /**
   * Lets a shut-out device use the server again, its revocation still
   * hidden: a malicious server's accomplice.
   */
  revive(deviceId: string, session: string) {
    const row = this.devices.get(deviceId)!;
    row.session = session;
    row.revokedAt = null;
  }

  #devicesOf(userId: string) {
    return [...this.devices.values()].filter((d) => d.userId === userId);
  }

  readonly api: typeof realChatApi = {
    devices: async () => {
      const { userId } = current();
      const recovery = this.recovery.get(userId);
      return {
        accountKey: this.accountKeys.get(userId) ?? null,
        currentDeviceId: this.#sessionDevice()?.deviceId ?? null,
        devices: this.#devicesOf(userId).map((row) => ({
          ...this.#presented(row),
          label: null,
        })),
        recovery: recovery ? { createdAt: now(), backedUpAt: now() } : null,
        recoveryReminder: false,
      };
    },
    register: async ({ accountKey, certificate }, reset = false) => {
      const { userId, session } = current();
      if (reset) {
        for (const row of this.#devicesOf(userId)) {
          if (!row.revokedAt) this.#shutOut(row, null);
        }
        this.recovery.delete(userId);
      } else if (this.accountKeys.get(userId)) {
        fail("conflict");
      }
      this.accountKeys.set(userId, accountKey);
      this.#insertDevice(userId, certificate, session);
      return { deviceId: certificate.deviceId };
    },
    labelDevice: async () => ({}),
    describeDevice: async () => ({}),
    revoke: async (revocation) => {
      const row = this.devices.get(revocation.deviceId) ?? fail("not_found");
      this.#shutOut(row, revocation);
      return {};
    },
    publishKeyPackages: async ({ keyPackages, lastResort }) => {
      const device = this.#device();
      device.keyPackages.push(...keyPackages);
      if (lastResort) device.lastResort = lastResort;
      return {
        available: device.keyPackages.length,
        lastResort: device.lastResort !== null,
      };
    },

    requestLink: async (body) => {
      const { userId, session } = current();
      const linkRequestId = crypto.randomUUID();
      this.links.set(linkRequestId, {
        ...body,
        linkRequestId,
        userId,
        session,
        package: null,
      });
      return {
        linkRequestId,
        expiresAt: now(),
        package: null,
        declined: false,
      };
    },
    linkStatus: async (id) => {
      const link = this.links.get(id) ?? fail("not_found");
      return {
        linkRequestId: id,
        expiresAt: now(),
        package: link.package,
        declined: false,
      };
    },
    finishLink: async (id) => {
      this.links.delete(id);
      return {};
    },
    linkRequests: async () => ({
      requests: [...this.links.values()]
        .filter((link) => link.userId === current().userId && !link.package)
        .map((link) => ({
          linkRequestId: link.linkRequestId,
          deviceId: link.deviceId,
          deviceKey: link.deviceKey,
          linkKey: link.linkKey,
          commitment: link.commitment,
          description: link.description,
          createdAt: now(),
          expiresAt: now(),
        })),
    }),
    approveLink: async (id, { certificate, package: sealed }) => {
      this.#device();
      const link = this.links.get(id) ?? fail("not_found");
      link.package = sealed;
      this.#insertDevice(link.userId, certificate, link.session);
      return {};
    },
    declineLink: async () => ({}),

    createArchive: async (body) => {
      if (this.failArchives) fail("network");
      const device = this.#device();
      const { userId } = current();
      const linkRequestId = body.purpose === "link" ? body.linkRequestId : null;
      if (body.purpose === "backup" && !this.recovery.has(userId)) {
        fail("conflict");
      }
      if (linkRequestId === null) {
        this.#dropBackups(userId, device.deviceId, null);
      } else {
        this.#dropArchives(
          (_id, archive) => archive.linkRequestId === linkRequestId,
        );
      }
      const archiveId = crypto.randomUUID();
      now();
      this.archives.set(archiveId, {
        userId,
        deviceId: device.deviceId,
        purpose: body.purpose,
        linkRequestId,
        parts: Array.from({ length: body.partCount }, () => undefined),
        expiresAt: clock + archiveMs,
      });
      return {
        archiveId,
        expiresAt: new Date(clock + archiveMs).toISOString(),
      };
    },
    putArchivePart: async (id, part, data) => {
      const archive = this.#ownArchive(id, (a) => !this.#complete(a));
      archive.parts[part] = data;
      return { complete: this.#complete(archive) };
    },
    archivePart: async (id, part) => {
      if (this.failArchiveReads) fail("network");
      const archive = this.#ownArchive(id, (a) => this.#complete(a));
      return { data: archive.parts[part] ?? fail("not_found") };
    },
    deleteArchive: async (id) => {
      this.#ownArchive(id, () => true);
      if (!this.#attached(id)) this.archives.delete(id);
      return {};
    },

    acknowledgeNotice: async () => ({}),

    createRecoveryKey: async (body) => {
      if (this.holdNextRecoveryKey) {
        this.holdNextRecoveryKey = false;
        const caller = current();
        this.heldRecoveryKey = () =>
          on(caller, () => this.#createRecoveryKey(body));
        fail("network");
      }
      await this.#createRecoveryKey(body);
      if (this.loseNextRecoveryAnswer) {
        this.loseNextRecoveryAnswer = false;
        fail("network");
      }
      return {};
    },
    backUp: async ({ keyId, backup, archiveId, replaces }) => {
      const device = this.#device();
      const before = this.beforeBackUp;
      this.beforeBackUp = null;
      await before?.();
      this.#backupArchive(archiveId);
      const recovery = this.recovery.get(current().userId);
      if (!recovery || recovery.keyId !== keyId) fail("conflict");
      await this.#checkReplaces(replaces);
      this.#attach({ keyId, backup, archiveId }, device.deviceId);
      return {};
    },
    recoveryBackup: async () => {
      if (this.failBackupRead) fail(this.failBackupRead);
      const recovery = this.recovery.get(current().userId) ?? fail("not_found");
      const archive =
        recovery.archiveId !== null
          ? this.archives.get(recovery.archiveId)
          : undefined;
      const read = {
        keyId: recovery.keyId,
        backup: recovery.backup,
        archive:
          archive && recovery.archiveId && !this.hideBackupArchive
            ? { archiveId: recovery.archiveId, parts: archive.parts.length }
            : null,
      };
      const after = this.afterBackupRead;
      this.afterBackupRead = null;
      await after?.();
      return read;
    },
    restore: async ({ certificate, revocations }) => {
      const { userId, session } = current();
      for (const row of this.#devicesOf(userId)) {
        if (row.revokedAt) continue;
        const revocation = revocations.find((r) => r.deviceId === row.deviceId);
        if (!revocation) fail("invalid_input");
        this.#shutOut(row, revocation!);
      }
      this.#insertDevice(userId, certificate, session);
      return { deviceId: certificate.deviceId };
    },
    answerRecoveryPrompt: async () => ({}),

    conversations: async () => ({ conversations: [] }),
    start: async () => fail("forbidden"),
    startLoanLogistics: async () => fail("forbidden"),
    conversation: async (id): Promise<ChatConversation> => {
      const conversation = this.#conversation(id);
      const device = this.#sessionDevice();
      const shown: ChatConversation = {
        conversationId: id,
        kind: "private",
        generation: conversation.generation,
        epoch: conversation.epoch,
        others: conversation.participants
          .filter((userId) => userId !== current().userId)
          .map((userId) => ({
            userId,
            realName: userId,
            profileId: null,
            pictureId: null,
          })) as unknown as ChatConversation["others"],
        loanId: null,
        open: true,
        joined: device ? conversation.members.has(device.deviceId) : false,
        waiting: false,
        muted: false,
        startedAt: conversation.startedAt,
        lastActivityAt: conversation.startedAt,
      };
      return this.conversationFilter ? this.conversationFilter(shown) : shown;
    },
    directory: async (id) => {
      const conversation = this.#conversation(id);
      const directory: ChatDirectory = {
        accounts: conversation.participants.map((userId) => ({
          userId,
          accountKey: this.accountKeys.get(userId) ?? null,
          devices: this.#devicesOf(userId).map((row) => this.#presented(row)),
        })),
        members: [...conversation.members],
      };
      return this.directoryFilter ? this.directoryFilter(directory) : directory;
    },
    hide: async () => ({}),
    mute: async () => ({}),
    readNotifications: async () => ({}),
    claimKeyPackages: async (id) => {
      const conversation = this.#conversation(id);
      const caller = this.#device();
      const keyPackages = [];
      for (const userId of conversation.participants) {
        for (const row of this.#devicesOf(userId)) {
          if (
            row.revokedAt ||
            row.deviceId === caller.deviceId ||
            conversation.members.has(row.deviceId)
          ) {
            continue;
          }
          const keyPackage =
            (this.lastResortOnly ? undefined : row.keyPackages.shift()) ??
            row.lastResort;
          if (keyPackage)
            keyPackages.push({ deviceId: row.deviceId, keyPackage });
        }
      }
      return { keyPackages };
    },
    commit: async (id, body, idempotencyKey) => {
      const answered = this.#answers.get(idempotencyKey);
      if (answered) return answered as { generation: number; epoch: number };
      const conversation = this.#conversation(id);
      const device = this.#device();
      let { generation, epoch } = conversation;
      if (
        conversation.members.size === 0 &&
        body.generation === generation + 1
      ) {
        generation = body.generation;
        epoch = 0;
      } else if (body.generation !== generation) {
        fail("conflict");
      }
      const commit = fromBase64(body.commit);
      if (epochOf(commit) !== BigInt(epoch)) fail("conflict");
      const starting = conversation.members.size === 0;
      if (!starting && !conversation.members.has(device.deviceId)) {
        fail("forbidden");
      }
      const live = new Set(
        conversation.participants.flatMap((userId) =>
          this.#devicesOf(userId)
            .filter(
              (row) =>
                (!row.revokedAt && !row.revocation) || this.hideRevocations,
            )
            .map((row) => row.deviceId),
        ),
      );
      if (body.removedDeviceIds.some((removed) => live.has(removed))) {
        fail("invalid_input");
      }
      const others = [...conversation.members].filter(
        (member) =>
          member !== device.deviceId && !body.removedDeviceIds.includes(member),
      );
      this.#deliver(id, generation, "commit", body.commit, others);
      if (body.welcome) {
        this.#deliver(
          id,
          generation,
          "welcome",
          body.welcome,
          body.addedDeviceIds,
        );
        for (const to of body.addedDeviceIds) {
          this.welcomes.push({
            conversationId: id,
            generation,
            type: "welcome",
            ciphertext: body.welcome,
            to,
          });
        }
      }
      if (starting) {
        conversation.members = new Set([device.deviceId]);
      }
      for (const added of body.addedDeviceIds) conversation.members.add(added);
      for (const removed of body.removedDeviceIds) {
        conversation.members.delete(removed);
      }
      conversation.generation = generation;
      conversation.epoch = epoch + 1;
      this.log.push({
        conversationId: id,
        deviceId: device.deviceId,
        type: "commit",
        ciphertext: body.commit,
        epoch,
      });
      const answer = { generation, epoch: epoch + 1 };
      this.#answers.set(idempotencyKey, answer);
      if (this.loseNextCommitAnswer) {
        this.loseNextCommitAnswer = false;
        fail("network");
      }
      return answer;
    },
    send: async (id, { generation, ciphertext }) => {
      const conversation = this.#conversation(id);
      const device = this.#device();
      if (
        generation !== conversation.generation ||
        epochOf(fromBase64(ciphertext)) !== BigInt(conversation.epoch)
      ) {
        fail("conflict");
      }
      this.log.push({
        conversationId: id,
        deviceId: device.deviceId,
        type: "application",
        ciphertext,
        epoch: conversation.epoch,
      });
      const { sentAt, delivered } = this.#deliver(
        id,
        generation,
        "application",
        ciphertext,
        [...conversation.members].filter((m) => m !== device.deviceId),
      );
      return { position: delivered ? String(this.#position) : null, sentAt };
    },

    inbox: async () => {
      const device = this.#device();
      return { items: [...this.inboxOf(device.deviceId)], more: false };
    },
    acknowledge: async (positions) => {
      const device = this.#device();
      const handled = new Set(positions);
      this.inboxes.set(
        device.deviceId,
        this.inboxOf(device.deviceId).filter(
          (item) => !handled.has(item.position),
        ),
      );
      return {};
    },
  };
}

/** The one server the mocked `chatApi` talks to; a test replaces it. */
export const fake: { server: FakeChatServer } = {
  server: new FakeChatServer(),
};

/** The mocked `chatApi`: each call goes to the current fake server. */
export const fakeChatApi = new Proxy({} as typeof realChatApi, {
  get:
    (_target, name: keyof typeof realChatApi) =>
    (...args: unknown[]) =>
      (fake.server.api[name] as (...a: unknown[]) => unknown)(...args),
});
