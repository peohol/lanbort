"use client";

import type {
  ChatDirectory,
  ChatInboxItem,
  ChatLinkRequest,
  ChatLinkStatus,
  DeviceCertificateWire,
  DeviceRevocationWire,
} from "@lanbort/contracts";
import {
  type AccountKey,
  type Device,
  type DeviceCertificate,
  type DeviceRevocation,
  type KeyPackageBundle,
  type MemoryTrustStore,
  type PendingCommit,
  type PendingLink,
  type TrustSnapshot,
  Conversation,
  KEY_PACKAGE_LIFETIME_SECONDS,
  acceptChangedAccountKey,
  applyRevocation,
  approveLink,
  createAccountKey,
  createDevice,
  createKeyPackage,
  createMemoryTrustStore,
  currentlyTrusted,
  decodeCertificate,
  decodeRevocation,
  encodeCertificate,
  encodeRevocation,
  exportAccountKey,
  exportDevice,
  exportKeyPackage,
  importAccountKey,
  importDevice,
  importKeyPackage,
  matchLinkRequest,
  observeAccountKey,
  revokeDevice,
  SHORT_MESSAGE_BYTES,
  securityCode,
  startLink,
  wipe,
} from "@lanbort/e2ee";
import { ChatApiError, chatApi } from "./api";
import { fromBase64, fromUtf8, toBase64, utf8 } from "./bytes";
import { type ChatStore, deleteChatStore, openChatStore } from "./store";

/** How the device keeps its chat going, set once here (ADR-0010 §6). */
export const chatTuning = {
  /** Unused key packages the device keeps on the server. */
  keyPackageTarget: 10,
  /** Below this many, the device publishes more. */
  keyPackageLow: 5,
  /** A device replaces its keys in a group at least this often. */
  rotateAfterMs: 7 * 24 * 60 * 60 * 1000,
  /** As long as a case entry, so a message can be submitted to a case. */
  maxTextLength: 4000,
  /** Tries when another device's commit wins the epoch first. */
  conflictRetries: 3,
} as const;

/** The MLS group id of a conversation's generation (server: `groupIdOf`). */
export const groupIdOf = (conversationId: string, generation: number) =>
  `${conversationId}:${generation}`;

/**
 * - `new`: the account has no chat yet; this device can start it.
 * - `link`: the account has chat on another device, which must approve this one.
 * - `lost`: this session's device has lost its keys (the browser's data was
 *   cleared); it can only sign out and link again, or reset.
 * - `ready`: this device can chat.
 */
export type ChatSetup = "new" | "link" | "lost" | "ready";

/** One message in the device's own history. */
export interface HistoryEntry {
  /** From the message itself; the same on every device. */
  id: string;
  senderUserId: string | null;
  own: boolean;
  /** Null when the message could not be read on this device. */
  text: string | null;
  /** When the server took it; null while it is being sent. */
  sentAt: string | null;
  /** An own message that has not reached the server yet. */
  unsent?: boolean;
}

/** Why a conversation does not work on this device. */
export type ConversationProblem = "no_key_package" | "out_of_sync";

interface ConversationRecord {
  generation: number;
  participants: string[];
  lastCommitAt: number | null;
  problem: ConversationProblem | null;
}

interface StoredKeyPackage {
  data: string;
  lastResort: boolean;
  createdAt: number;
}

const records = {
  account: "account",
  device: "device",
  trust: "trust",
  keyPackages: "key-packages",
  group: (id: string) => `group:${id}`,
  conversation: (id: string) => `conversation:${id}`,
  history: (id: string) => `history:${id}`,
  seen: (id: string) => `seen:${id}`,
};

const certificateWire = (c: DeviceCertificate): DeviceCertificateWire =>
  JSON.parse(fromUtf8(encodeCertificate(c))) as DeviceCertificateWire;
const revocationWire = (r: DeviceRevocation): DeviceRevocationWire =>
  JSON.parse(fromUtf8(encodeRevocation(r))) as DeviceRevocationWire;
const certificateOf = (wire: DeviceCertificateWire) =>
  decodeCertificate(utf8(JSON.stringify(wire)));
const revocationOf = (wire: DeviceRevocationWire) =>
  decodeRevocation(utf8(JSON.stringify(wire)));

const isConflict = (error: unknown) =>
  error instanceof ChatApiError && error.code === "conflict";

/** What is inside every encrypted message. */
interface MessageBody {
  v: 1;
  id: string;
  text: string;
}

const encodeBody = (id: string, text: string) =>
  utf8(JSON.stringify({ v: 1, id, text } satisfies MessageBody));

/**
 * Whether `text` fits in one padding block once encrypted: a loan logistics
 * conversation takes nothing longer (WP-44), and the server refuses it.
 */
export const fitsShortMessage = (text: string) => shortMessageRoom(text) >= 0;

/** How many bytes are left in that block after `text`; below zero, too long. */
export const shortMessageRoom = (text: string) =>
  SHORT_MESSAGE_BYTES - encodeBody(crypto.randomUUID(), text).length;

function readBody(plaintext: Uint8Array): MessageBody | undefined {
  try {
    const body = JSON.parse(fromUtf8(plaintext)) as Partial<MessageBody>;
    return body.v === 1 &&
      typeof body.id === "string" &&
      typeof body.text === "string" &&
      body.text.length <= chatTuning.maxTextLength
      ? (body as MessageBody)
      : undefined;
  } catch {
    return undefined;
  }
}

/** Writes secret bytes to the store and wipes them from memory. */
async function putSecret(
  store: ChatStore,
  name: string,
  secret: { reveal(): Uint8Array },
) {
  const bytes = secret.reveal();
  try {
    await store.put(name, new Uint8Array(bytes));
  } finally {
    wipe(bytes);
  }
}

/**
 * Where the device stands, from the server's view of the account and what
 * the browser holds. Anything left from another session or an older
 * account key is deleted.
 */
export async function loadChat(
  userId: string,
): Promise<
  | { setup: "ready"; engine: ChatEngine }
  | { setup: Exclude<ChatSetup, "ready"> }
> {
  const devices = await chatApi.devices();
  const store = await openChatStore(userId);
  const [account, device] = await Promise.all([
    store.get(records.account),
    store.get(records.device),
  ]);

  if (account && device) {
    const accountKey = importAccountKey(account);
    const ownDevice = importDevice(device);
    wipe(account, device);

    if (
      devices.currentDeviceId === ownDevice.certificate.deviceId &&
      devices.accountKey === toBase64(accountKey.publicKey)
    ) {
      const trust = createMemoryTrustStore(
        await store.getJson<TrustSnapshot>(records.trust),
      );
      return {
        setup: "ready",
        engine: new ChatEngine(userId, store, accountKey, ownDevice, trust),
      };
    }
  }

  await store.destroy();

  if (devices.currentDeviceId) return { setup: "lost" };
  return { setup: devices.accountKey ? "link" : "new" };
}

/**
 * Starts chat on this device with a new account key: the account's first
 * device, or a reset that shuts out every other device (ADR-0010 §8).
 */
export async function createChat(
  userId: string,
  reset: boolean,
): Promise<ChatEngine> {
  const account = await createAccountKey(userId);
  const device = await createDevice(account);
  await chatApi.register(
    {
      accountKey: toBase64(account.publicKey),
      certificate: certificateWire(device.certificate),
    },
    reset,
  );
  await deleteChatStore(userId);
  return ChatEngine.begin(userId, account, device);
}

/** On a new device: asks to be linked, and shows the code (ADR-0010 §5). */
export async function requestDeviceLink(): Promise<{
  link: PendingLink;
  status: ChatLinkStatus;
}> {
  const link = await startLink();
  const status = await chatApi.requestLink({
    deviceId: link.keys.deviceId,
    deviceKey: toBase64(link.keys.deviceKey),
    linkKey: toBase64(link.keys.linkKey),
  });
  return { link, status };
}

/** On the new device, once an existing device has approved. */
export async function completeDeviceLink(
  userId: string,
  link: PendingLink,
  status: ChatLinkStatus & { package: string },
): Promise<ChatEngine> {
  const { account, device } = await link.open(fromBase64(status.package));
  const engine = await ChatEngine.begin(userId, account, device);
  await chatApi.finishLink(status.linkRequestId);
  return engine;
}

/**
 * One device's private chat: its keys, what it trusts, its groups and its
 * history. All state changes run here, and are stored before anything they
 * produced reaches the server, so a key is never used twice.
 */
export class ChatEngine {
  readonly #groups = new Map<string, Conversation>();
  readonly #records = new Map<string, ConversationRecord>();
  /** Contacts whose account key changed, until the user accepts it. */
  readonly #keyChanges = new Map<string, Uint8Array>();
  /** Commits whose answer was lost; sent again with the same key. */
  readonly #outstanding = new Map<
    string,
    {
      pending: PendingCommit;
      group: Conversation;
      send: () => Promise<{ generation: number }>;
    }
  >();
  readonly #listeners = new Set<() => void>();
  #queue: Promise<unknown> = Promise.resolve();

  constructor(
    readonly userId: string,
    private readonly store: ChatStore,
    private readonly account: AccountKey,
    private readonly device: Device,
    private readonly trust: MemoryTrustStore,
  ) {}

  /** A device with fresh keys: stores them and publishes key packages. */
  static async begin(
    userId: string,
    account: AccountKey,
    device: Device,
  ): Promise<ChatEngine> {
    const store = await openChatStore(userId);
    const trust = createMemoryTrustStore();
    trust.setAccountKey(userId, account.publicKey);
    await putSecret(store, records.account, exportAccountKey(account));
    await putSecret(store, records.device, exportDevice(device));
    await store.putJson(records.trust, trust.snapshot());
    const engine = new ChatEngine(userId, store, account, device, trust);
    await engine.replenishKeyPackages();
    return engine;
  }

  get deviceId(): string {
    return this.device.certificate.deviceId;
  }

  /** Something the pages show has changed. */
  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #changed() {
    for (const listener of this.#listeners) listener();
  }

  /**
   * Runs one operation at a time, so two never start from the same group
   * state or handle the same inbox item. Operations do not call each other
   * through here; inside, they use the private steps.
   */
  #exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.#queue.then(operation);
    this.#queue = run.catch(() => undefined);
    return run.finally(() => this.#changed());
  }

  // Keys and devices

  /** Keeps enough one-time key packages on the server for others to add us. */
  replenishKeyPackages(): Promise<void> {
    return this.#exclusive(() => this.#replenish());
  }

  async #replenish(): Promise<void> {
    const oldest = Date.now() - (KEY_PACKAGE_LIFETIME_SECONDS - 86_400) * 1000;
    const kept = (await this.#storedKeyPackages()).filter(
      (entry) => entry.createdAt > oldest,
    );
    const stock = await chatApi.publishKeyPackages({ keyPackages: [] });
    const count =
      stock.available < chatTuning.keyPackageLow
        ? chatTuning.keyPackageTarget - stock.available
        : 0;
    const needsLastResort =
      !stock.lastResort || !kept.some((entry) => entry.lastResort);

    if (count === 0 && !needsLastResort) return;

    const fresh = await Promise.all(
      Array.from({ length: count }, () => createKeyPackage(this.device)),
    );
    const lastResort = needsLastResort
      ? await createKeyPackage(this.device)
      : undefined;
    const now = Date.now();
    const stored = (bundle: KeyPackageBundle, last: boolean) => {
      const bytes = exportKeyPackage(bundle).reveal();
      const data = fromUtf8(bytes);
      wipe(bytes);
      return { data, lastResort: last, createdAt: now };
    };

    // Stored first: a welcome for a package this device lost could never
    // be opened.
    await this.store.putJson(records.keyPackages, [
      ...kept.filter((entry) => !(lastResort && entry.lastResort)),
      ...fresh.map((bundle) => stored(bundle, false)),
      ...(lastResort ? [stored(lastResort, true)] : []),
    ]);
    await chatApi.publishKeyPackages({
      keyPackages: fresh.map((bundle) => toBase64(bundle.published)),
      ...(lastResort ? { lastResort: toBase64(lastResort.published) } : {}),
    });
  }

  async #storedKeyPackages(): Promise<StoredKeyPackage[]> {
    return (
      (await this.store.getJson<StoredKeyPackage[]>(records.keyPackages)) ?? []
    );
  }

  /** The account's pending link requests the user's code points to. */
  async findLinkRequest(
    requests: readonly ChatLinkRequest[],
    shown: { code: string; linkKey?: Uint8Array },
  ): Promise<ChatLinkRequest | undefined> {
    const keyed = requests.map((request) => ({
      request,
      deviceId: request.deviceId,
      deviceKey: fromBase64(request.deviceKey),
      linkKey: fromBase64(request.linkKey),
    }));
    return (await matchLinkRequest(keyed, shown))?.request;
  }

  /** Certifies the new device and seals the account key to it. */
  async approveLink(request: ChatLinkRequest): Promise<void> {
    const { certificate, sealed } = await approveLink(this.account, {
      deviceId: request.deviceId,
      deviceKey: fromBase64(request.deviceKey),
      linkKey: fromBase64(request.linkKey),
    });
    await chatApi.approveLink(request.linkRequestId, {
      certificate: certificateWire(certificate),
      package: toBase64(sealed),
    });
  }

  /**
   * Shuts one of the account's devices out (ADR-0010 §7). For this device
   * itself, its chat is deleted from the browser too.
   */
  revokeDevice(deviceId: string): Promise<void> {
    return this.#exclusive(async () => {
      const revocation = await revokeDevice(this.account, deviceId);
      await applyRevocation(this.trust, revocation);
      await this.#saveTrust();
      await chatApi.revoke(revocationWire(revocation));

      if (deviceId === this.deviceId) {
        await this.store.destroy();
      }
    });
  }

  // Trust

  async #saveTrust() {
    await this.store.putJson(records.trust, this.trust.snapshot());
  }

  /** Pins first-seen account keys, records revocations and key changes. */
  async #applyDirectory(conversationId: string, directory: ChatDirectory) {
    for (const account of directory.accounts) {
      if (account.accountKey) {
        const key = fromBase64(account.accountKey);
        if (observeAccountKey(this.trust, account.userId, key) === "changed") {
          this.#keyChanges.set(account.userId, key);
        } else {
          this.#keyChanges.delete(account.userId);
        }
      }

      for (const device of account.devices) {
        const revocation = device.revocation && revocationOf(device.revocation);
        if (revocation) await applyRevocation(this.trust, revocation);
      }
    }
    await this.#saveTrust();

    const record = await this.#record(conversationId);
    const participants = directory.accounts.map(({ userId }) => userId);
    if (participants.join() !== record.participants.join()) {
      // In place: the groups' policies hold this very list.
      record.participants.splice(0, Infinity, ...participants);
      await this.store.putJson(records.conversation(conversationId), record);
    }
  }

  /** The contact's account key changed and the user has not accepted it. */
  keyChanged(userId: string): boolean {
    return this.#keyChanges.has(userId);
  }

  /**
   * Only after the user has seen that the security code changed. The
   * conversations with the contact are brought in line at once: their old
   * devices out, the ones under the new key in.
   */
  acceptKeyChange(userId: string): Promise<void> {
    return this.#exclusive(async () => {
      const key = this.#keyChanges.get(userId);
      if (!key) return;
      acceptChangedAccountKey(this.trust, userId, key);
      this.#keyChanges.delete(userId);
      await this.#saveTrust();

      const prefix = records.conversation("");
      for (const name of await this.store.names(prefix)) {
        const id = name.slice(prefix.length);
        if ((await this.#record(id)).participants.includes(userId)) {
          // Another try comes with the next visit to the conversation.
          await this.#maintain(id).catch(() => undefined);
        }
      }
    });
  }

  /** The 60 digits both contacts compare (ADR-0010 §3). */
  async securityCode(userId: string): Promise<string[] | undefined> {
    const theirs = this.trust.accountKey(userId);
    return theirs
      ? securityCode(
          { accountId: this.userId, accountKey: this.account.publicKey },
          { accountId: userId, accountKey: theirs },
        )
      : undefined;
  }

  // Conversations on this device

  #policy(record: ConversationRecord) {
    return { participants: record.participants, trust: this.trust };
  }

  async #record(id: string): Promise<ConversationRecord> {
    let record = this.#records.get(id);
    if (!record) {
      record = (await this.store.getJson<ConversationRecord>(
        records.conversation(id),
      )) ?? {
        generation: 0,
        participants: [],
        lastCommitAt: null,
        problem: null,
      };
      this.#records.set(id, record);
    }
    return record;
  }

  async #group(id: string): Promise<Conversation | undefined> {
    const known = this.#groups.get(id);
    if (known) return known;
    const stored = await this.store.get(records.group(id));
    if (!stored) return undefined;
    const group = Conversation.restore(
      stored,
      this.#policy(await this.#record(id)),
    );
    wipe(stored);
    this.#groups.set(id, group);
    return group;
  }

  async #saveGroup(id: string, group: Conversation) {
    this.#groups.set(id, group);
    await putSecret(this.store, records.group(id), await group.export());
    await this.store.putJson(records.conversation(id), await this.#record(id));
  }

  async #dropGroup(id: string) {
    this.#groups.delete(id);
    await this.store.delete(records.group(id));
  }

  /** What this device knows of a conversation, for its page. */
  async status(id: string): Promise<{
    joined: boolean;
    /** No one else's device is in the group yet: nothing can reach them. */
    alone: boolean;
    problem: ConversationProblem | null;
  }> {
    const record = await this.#record(id);
    const group = await this.#group(id);
    return {
      joined: group !== undefined,
      alone:
        group !== undefined &&
        !group.members().some((m) => m.accountId !== this.userId),
      problem: record.problem,
    };
  }

  async history(id: string): Promise<HistoryEntry[]> {
    return (
      (await this.store.getJson<HistoryEntry[]>(records.history(id))) ?? []
    );
  }

  /**
   * The last message this device has shown of a conversation, so newer
   * ones are marked as new here, and only here (PS-COM-004).
   */
  async seen(id: string): Promise<string | null> {
    return (await this.store.getJson<string>(records.seen(id))) ?? null;
  }

  /** Remembers that the conversation has been read up to `entryId`. */
  async markSeen(id: string, entryId: string): Promise<void> {
    if ((await this.seen(id)) !== entryId) {
      await this.store.putJson(records.seen(id), entryId);
    }
  }

  async #updateHistory(
    id: string,
    change: (entries: HistoryEntry[]) => HistoryEntry[],
  ) {
    await this.store.putJson(
      records.history(id),
      change(await this.history(id)),
    );
  }

  /** Adds a message, once: another try of the same message is the same. */
  async #remember(id: string, entry: HistoryEntry) {
    await this.#updateHistory(id, (entries) => {
      const index = entries.findIndex((known) => known.id === entry.id);
      if (index === -1) return [...entries, entry];
      // An own message may already be there, waiting to be sent.
      const copy = [...entries];
      copy[index] = entry;
      return copy;
    });
  }

  // Receiving

  /**
   * Fetches and handles everything waiting for this device, then tries
   * again to send what did not get through.
   */
  sync(): Promise<void> {
    return this.#exclusive(async () => {
      await this.#receive();
      await this.#resendUnsent();
    });
  }

  async #receive() {
    await this.#settleOutstanding();
    const directories = new Map<string, Promise<void>>();

    for (;;) {
      const inbox = await chatApi.inbox();
      const handled: string[] = [];

      for (const item of inbox.items) {
        if (!directories.has(item.conversationId)) {
          directories.set(
            item.conversationId,
            chatApi
              .directory(item.conversationId)
              .then((directory) =>
                this.#applyDirectory(item.conversationId, directory),
              ),
          );
        }
        await directories.get(item.conversationId);
        await this.#handle(item);
        handled.push(item.position);
      }

      if (handled.length > 0) await chatApi.acknowledge(handled);
      if (!inbox.more || handled.length === 0) break;
    }
  }

  async #handle(item: ChatInboxItem) {
    const id = item.conversationId;
    const record = await this.#record(id);
    const bytes = fromBase64(item.ciphertext);

    if (item.type === "welcome") {
      await this.#join(id, item.generation, bytes);
      return;
    }

    const group =
      record.generation === item.generation ? await this.#group(id) : undefined;

    if (item.type === "commit") {
      if (!group) return;
      try {
        await group.receive(bytes);
        if (!group.members().some((m) => m.deviceId === this.deviceId)) {
          // This device was removed from the group.
          await this.#dropGroup(id);
          return;
        }
        await this.#saveGroup(id, group);
      } catch {
        record.problem = "out_of_sync";
        await this.store.putJson(records.conversation(id), record);
      }
      return;
    }

    let entry: HistoryEntry = {
      id: crypto.randomUUID(),
      senderUserId: null,
      own: false,
      text: null,
      sentAt: item.sentAt,
    };
    if (group) {
      try {
        const received = await group.receive(bytes);
        await this.#saveGroup(id, group);
        const body =
          received.kind === "message"
            ? readBody(received.plaintext)
            : undefined;
        if (received.kind === "message" && body) {
          entry = {
            id: body.id,
            senderUserId: received.sender.accountId,
            own: received.sender.accountId === this.userId,
            text: body.text,
            sentAt: item.sentAt,
          };
        }
      } catch {
        // Kept as a message that could not be read.
      }
    }
    await this.#remember(id, entry);
  }

  async #join(id: string, generation: number, welcome: Uint8Array) {
    const record = await this.#record(id);
    const stored = await this.#storedKeyPackages();
    const bundles = stored.map((entry) => importKeyPackage(utf8(entry.data)));
    const bundle = await Conversation.keyPackageFor(welcome, bundles);

    if (!bundle) {
      record.problem = "no_key_package";
      await this.store.putJson(records.conversation(id), record);
      return;
    }

    try {
      const group = await Conversation.join(
        welcome,
        bundle,
        this.#policy(record),
      );
      if (group.groupId !== groupIdOf(id, generation)) {
        throw new Error("welcome for another group");
      }
      Object.assign(record, {
        generation,
        lastCommitAt: Date.now(),
        problem: null,
      });
      await this.#saveGroup(id, group);
    } catch {
      record.problem = "out_of_sync";
      await this.store.putJson(records.conversation(id), record);
      return;
    }

    const used = stored[bundles.indexOf(bundle)];
    if (used && !used.lastResort) {
      await this.store.putJson(
        records.keyPackages,
        stored.filter((entry) => entry !== used),
      );
    }
  }

  // Changing the group

  /**
   * Brings the conversation's group in line with who should be in it
   * (ADR-0010 §4, §7): starts it when no device is left, removes devices
   * this device no longer trusts, adds the participants' new devices, and
   * replaces its own keys now and then. A commit that loses its epoch to
   * another device's is made again from the winner.
   */
  maintain(id: string): Promise<void> {
    return this.#exclusive(async () => {
      await this.#receive();
      await this.#maintain(id);
    });
  }

  async #maintain(id: string) {
    for (let attempt = 1; ; attempt++) {
      try {
        await this.#maintainOnce(id);
        return;
      } catch (error) {
        if (!isConflict(error) || attempt >= chatTuning.conflictRetries) {
          throw error;
        }
        await this.#receive();
      }
    }
  }

  async #maintainOnce(id: string) {
    const [conversation, directory] = await Promise.all([
      chatApi.conversation(id),
      chatApi.directory(id),
    ]);
    if (!conversation.open) return;
    await this.#applyDirectory(id, directory);
    const record = await this.#record(id);
    // A group this device fell out of step with cannot be repaired here.
    if (record.problem === "out_of_sync") return;
    let group = await this.#group(id);

    if (group && record.generation !== conversation.generation) {
      await this.#dropGroup(id);
      group = undefined;
    }

    if (!group) {
      // Another device adds this one with a welcome, unless no device is
      // left: then this device starts the group anew.
      if (directory.members.length > 0) return;
      const generation =
        conversation.epoch === 0
          ? conversation.generation
          : conversation.generation + 1;
      group = await Conversation.create(
        this.device,
        groupIdOf(id, generation),
        this.#policy(record),
      );
      await this.#addMissing(id, group, generation, directory, true);
      return;
    }

    const untrusted = group
      .untrustedMembers()
      .filter((member) => member.deviceId !== this.deviceId);
    if (untrusted.length > 0) {
      await this.#submit(
        id,
        group,
        record.generation,
        await group.remove(untrusted),
        {
          removed: untrusted.map((member) => member.deviceId),
        },
      );
    }

    if (
      await this.#addMissing(id, group, record.generation, directory, false)
    ) {
      return;
    }

    if (
      record.lastCommitAt === null ||
      Date.now() - record.lastCommitAt > chatTuning.rotateAfterMs
    ) {
      await this.#submit(
        id,
        group,
        record.generation,
        await group.rotateKeys(),
        {},
      );
    }
  }

  /**
   * Adds the participants' devices that are not in the group yet and that
   * this device trusts. A starting group commits even with nobody to add,
   * so the server knows this device is in it. Whether anything was sent.
   */
  async #addMissing(
    id: string,
    group: Conversation,
    generation: number,
    directory: ChatDirectory,
    starting: boolean,
  ): Promise<boolean> {
    const record = await this.#record(id);
    const inGroup = new Set(group.members().map((m) => m.deviceId));
    const policy = this.#policy(record);
    const wanted = new Set(
      directory.accounts.flatMap((account) =>
        account.devices
          .filter((device) => {
            const certificate = certificateOf(device.certificate);
            return (
              device.revokedAt === null &&
              !inGroup.has(device.deviceId) &&
              certificate !== undefined &&
              currentlyTrusted(policy, certificate)
            );
          })
          .map((device) => device.deviceId),
      ),
    );

    const claimed =
      wanted.size > 0
        ? (await chatApi.claimKeyPackages(id)).keyPackages.filter((claim) =>
            wanted.has(claim.deviceId),
          )
        : [];
    const usable = [];
    for (const claim of claimed) {
      // A key package that does not hold up is left out, not the others.
      try {
        (await group.add([fromBase64(claim.keyPackage)])).discard();
        usable.push(claim);
      } catch {
        // Not added; its device gets another chance with a new package.
      }
    }

    if (usable.length === 0 && !starting) return false;

    const pending =
      usable.length > 0
        ? await group.add(usable.map((claim) => fromBase64(claim.keyPackage)))
        : await group.rotateKeys();
    await this.#submit(id, group, generation, pending, {
      added: usable.map((claim) => claim.deviceId),
    });
    return true;
  }

  async #submit(
    id: string,
    group: Conversation,
    generation: number,
    pending: PendingCommit,
    { added = [], removed = [] }: { added?: string[]; removed?: string[] },
  ) {
    const idempotencyKey = crypto.randomUUID();
    const send = () =>
      chatApi.commit(
        id,
        {
          generation,
          commit: toBase64(pending.commit),
          welcome: pending.welcome ? toBase64(pending.welcome) : null,
          addedDeviceIds: added,
          removedDeviceIds: removed,
        },
        idempotencyKey,
      );
    this.#outstanding.set(id, { pending, group, send });
    try {
      await send();
    } catch (error) {
      if (!(error instanceof ChatApiError && error.code === "network")) {
        this.#outstanding.delete(id);
        pending.discard();
      }
      throw error;
    }
    this.#outstanding.delete(id);
    await this.#accepted(id, group, generation, pending);
  }

  async #accepted(
    id: string,
    group: Conversation,
    generation: number,
    pending: PendingCommit,
  ) {
    pending.accept();
    Object.assign(await this.#record(id), {
      generation,
      lastCommitAt: Date.now(),
      problem: null,
    });
    await this.#saveGroup(id, group);
  }

  /**
   * A commit whose answer never came is sent again with the same key, which
   * returns the first answer if the server took it. Until it is settled the
   * group can do nothing else.
   */
  async #settleOutstanding() {
    for (const [id, { pending, group, send }] of this.#outstanding) {
      try {
        const accepted = await send();
        this.#outstanding.delete(id);
        await this.#accepted(id, group, accepted.generation, pending);
      } catch (error) {
        if (error instanceof ChatApiError && error.code === "network")
          throw error;
        this.#outstanding.delete(id);
        pending.discard();
      }
    }
  }

  // Sending

  /**
   * Encrypts and sends a message. The group's new state is stored before
   * the ciphertext leaves, so a key is never used twice. A message that did
   * not get through stays in the history as unsent and is tried again on
   * the next sync; the receiver keeps one copy of it.
   */
  /**
   * Whether the message left: it waits, unsent, while no one else's device
   * is in the group (the other person has not turned chat on yet), since a
   * device added later can never read it.
   */
  async send(id: string, text: string): Promise<boolean> {
    const entry: HistoryEntry = {
      id: crypto.randomUUID(),
      senderUserId: this.userId,
      own: true,
      text,
      sentAt: null,
      unsent: true,
    };
    await this.#exclusive(() => this.#remember(id, entry));
    return this.#exclusive(() => this.#deliver(id, entry));
  }

  async #deliver(id: string, entry: HistoryEntry): Promise<boolean> {
    for (let attempt = 1; ; attempt++) {
      let group = await this.#group(id);
      if (!group) {
        await this.#maintain(id);
        group = await this.#group(id);
        if (!group) throw new ChatApiError("conflict");
      }
      if (!group.members().some((m) => m.accountId !== this.userId)) {
        return false;
      }
      const ciphertext = await group.encrypt(
        encodeBody(entry.id, entry.text ?? ""),
      );
      await this.#saveGroup(id, group);
      try {
        const { position, sentAt } = await chatApi.send(id, {
          generation: (await this.#record(id)).generation,
          ciphertext: toBase64(ciphertext),
        });
        // No device took it: sent again later, read once by the receiver.
        if (position === null) return false;
        await this.#remember(id, { ...entry, sentAt, unsent: false });
        return true;
      } catch (error) {
        if (!isConflict(error) || attempt >= chatTuning.conflictRetries) {
          throw error;
        }
        // The group moved on: catch up and encrypt again.
        await this.#receive();
        await this.#maintain(id);
      }
    }
  }

  async #resendUnsent() {
    for (const name of await this.store.names("history:")) {
      const id = name.slice("history:".length);
      const waiting = (await this.history(id)).filter((entry) => entry.unsent);
      if (waiting.length === 0 || !(await this.#group(id))) continue;

      // A contact may have enabled chat since the last poll. Refresh group
      // membership before resending; otherwise unsent messages may remain
      // stranded until the sender reloads the conversation page.
      await this.#maintain(id).catch(() => undefined);
      for (const entry of waiting) {
        if (await this.#group(id)) {
          await this.#deliver(id, entry).catch(() => undefined);
        }
      }
    }
  }
}
