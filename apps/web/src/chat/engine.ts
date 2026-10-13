"use client";

import type {
  ChatDirectory,
  ChatInboxItem,
  ChatLinkRequest,
  ChatLinkStatus,
  ChatRecoveryBackup,
  DeviceCertificateWire,
  DeviceRevocationWire,
} from "@lanbort/contracts";
import {
  type AccountKey,
  type Device,
  type DeviceCertificate,
  type DeviceRevocation,
  type KeyPackageBundle,
  type LinkedArchive,
  type MemoryTrustStore,
  type PendingCommit,
  type PendingLink,
  type RecoveryKey,
  type TrustSnapshot,
  Conversation,
  KEY_PACKAGE_LIFETIME_SECONDS,
  acceptChangedAccountKey,
  applyRevocation,
  approveLink,
  carriedTrust,
  createAccountKey,
  createDevice,
  createKeyPackage,
  createMemoryTrustStore,
  createRecoveryKey,
  currentlyTrusted,
  decodeCertificate,
  decodeRevocation,
  encodeCertificate,
  encodeRevocation,
  exportAccountKey,
  exportDevice,
  exportKeyPackage,
  exportLinkedArchive,
  exportRecoveryKey,
  importAccountKey,
  importDevice,
  importKeyPackage,
  importLinkedArchive,
  importRecoveryKey,
  matchLinkRequest,
  observeAccountKey,
  openRecoveryBackup,
  readRecoveryKey,
  revokeDevice,
  revokedDeviceOf,
  sealRecoveryBackup,
  SHORT_MESSAGE_BYTES,
  securityCode,
  settleParticipants,
  startLink,
  wipe,
} from "@lanbort/e2ee";
import { ChatApiError, chatApi } from "./api";
import { fromBase64, fromUtf8, toBase64, utf8 } from "./bytes";
import {
  type ConversationHistory,
  historyLost,
  mergeConversations,
  mergeHistory,
  packHistory,
  receiveHistory,
  sendHistory,
  unpackHistory,
  withReceived,
} from "./history-transfer";
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
  /**
   * The recovery key's backup is brought up to date at most this often,
   * once the history has changed (ADR-0010 §8).
   */
  backupEveryMs: 10 * 60 * 1000,
  /** Fetching history again after a lost connection waits this long. */
  historyRetryMs: 30 * 1000,
  /** A rotation that could not be made is tried again after this long. */
  rotateRetryMs: 60 * 60 * 1000,
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
  /**
   * For an unsent message: whom the page showed it was written to. It is
   * encrypted only to a group with exactly them (`#mayEncrypt`).
   */
  to?: string[];
}

/**
 * Where fetching history to this device stands: the other device's, moved
 * when it was linked (KF5 screen 13), or the backup's, restored with the
 * recovery key (R3).
 */
export interface HistoryTransfer {
  state: "running" | "done" | "failed";
  from: "device" | "backup";
}

/** When the history or the pinned keys last changed, and when the backup last caught up. */
interface BackupState {
  changedAt: number;
  backedUpAt: number;
}

/** A contact's security code, and the account key it is for. */
export interface SecurityCode {
  /** 12 groups of 5 digits. */
  code: string[];
  /** Passed back to `acceptKeyChange`, so it accepts this key and no other. */
  key: string;
  /** The contact's key changed to this one; the user has not accepted it. */
  pending: boolean;
}

/** Why a conversation does not work on this device. */
/**
 * `other_person`: the page showed someone else than the account the
 * conversation's group is with, so nothing is sent in it.
 */
export type ConversationProblem =
  "no_key_package" | "out_of_sync" | "other_person";

/** The account's backup as read from the server, before it is replaced. */
interface CurrentBackup {
  keyId: string;
  sealed: Uint8Array;
  /** What the server checks that the backup it replaces is (SHA-256). */
  digest: string;
  /** It points to a history archive. */
  history: boolean;
}

interface ConversationRecord {
  generation: number;
  /**
   * The newest epoch this device has had in that generation, kept when it
   * leaves the group, so a welcome to an earlier one is refused.
   */
  epoch?: number;
  participants: string[];
  /** When this device last replaced its own keys in the group; null: never. */
  lastCommitAt: number | null;
  problem: ConversationProblem | null;
}

/**
 * A commit on its way to the server, stored before it is sent, so one the
 * server accepted is not lost when the page closes before the answer
 * comes. Sent again with the same key, it returns the first answer.
 */
interface StoredCommit {
  idempotencyKey: string;
  body: {
    generation: number;
    commit: string;
    welcome: string | null;
    addedDeviceIds: string[];
    removedDeviceIds: string[];
  };
  /** It gives this device new keys of its own in the group. */
  rotates: boolean;
}

interface StoredKeyPackage {
  data: string;
  lastResort: boolean;
  createdAt: number;
}

const records = {
  account: "account",
  device: "device",
  recovery: "recovery",
  /** A new key whose answer is not in yet: the server may have taken it. */
  recoveryPending: "recovery-pending",
  backup: "backup",
  /** Set on a device that was linked (13), not on a first or restored one. */
  linked: "linked",
  /** An archive's key, kept until its history is here. */
  transfer: (from: HistoryTransfer["from"] | "") => `transfer:${from}`,
  trust: "trust",
  keyPackages: "key-packages",
  group: (id: string) => `group:${id}`,
  /** A commit waiting for the server's answer, and the group state after it. */
  commit: (id: string) => `commit:${id}`,
  commitState: (id: string) => `commit-state:${id}`,
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

/** A pending link request, with the code the user showed this device. */
export type MatchedLinkRequest = ChatLinkRequest & { code: string };

const linkKeysOf = (request: ChatLinkRequest) => ({
  deviceId: request.deviceId,
  deviceKey: fromBase64(request.deviceKey),
  linkKey: fromBase64(request.linkKey),
  commitment: fromBase64(request.commitment),
});

const isConflict = (error: unknown) =>
  error instanceof ChatApiError && error.code === "conflict";

/**
 * A backup refused because another device replaced it since it was read,
 * or because its archive is gone: tried again from what is there now.
 */
const backupOutdated = (error: unknown) =>
  isConflict(error) ||
  (error instanceof ChatApiError && error.code === "not_found");

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
export async function loadChat(userId: string): Promise<
  | { setup: "ready"; engine: ChatEngine }
  | {
      setup: Exclude<ChatSetup, "ready">;
      /** The account has a recovery key to restore chat with (R3). */
      recovery: boolean;
    }
> {
  const devices = await chatApi.devices();
  const store = await openChatStore(userId);
  const [account, device, recovery, linked] = await Promise.all([
    store.get(records.account),
    store.get(records.device),
    store.get(records.recovery),
    store.getJson<boolean>(records.linked),
  ]);

  if (account && device) {
    const accountKey = importAccountKey(account);
    const ownDevice = importDevice(device);
    const recoveryKey = recovery ? importRecoveryKey(recovery) : null;
    wipe(account, device, ...(recovery ? [recovery] : []));

    if (
      devices.currentDeviceId === ownDevice.certificate.deviceId &&
      devices.accountKey === toBase64(accountKey.publicKey)
    ) {
      const trust = createMemoryTrustStore(
        await store.getJson<TrustSnapshot>(records.trust),
      );
      const engine = new ChatEngine(
        userId,
        store,
        accountKey,
        ownDevice,
        trust,
        {
          recovery: recoveryKey,
          linked: linked === true,
          addedAt: devices.devices.find(
            (d) => d.deviceId === ownDevice.certificate.deviceId,
          )?.createdAt,
        },
      );
      // History a reload or a lost connection interrupted.
      void engine.resumeHistory();
      return { setup: "ready", engine };
    }
  }

  await store.destroy();

  const setup = devices.currentDeviceId
    ? "lost"
    : devices.accountKey
      ? "link"
      : "new";
  return { setup, recovery: devices.recovery !== null };
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
    commitment: toBase64(link.keys.commitment),
  });
  return { link, status };
}

/**
 * On the new device, once an existing device has approved. History the
 * other device moved here is fetched after, while chat already works; its
 * key is stored first, since the link package goes.
 */
export async function completeDeviceLink(
  userId: string,
  link: PendingLink,
  status: ChatLinkStatus & { package: string },
): Promise<ChatEngine> {
  const { account, device, archive, recovery, pinned, revoked } =
    await link.open(fromBase64(status.package));
  const engine = await ChatEngine.begin(userId, account, device, {
    recovery,
    linked: true,
    pinned,
    revoked,
  });
  if (archive) await engine.holdHistory(archive, "device");
  await chatApi.finishLink(status.linkRequestId);
  void engine.resumeHistory();
  return engine;
}

/**
 * Restores chat on this device with the recovery key (R3, ADR-0010 §8):
 * the account key from the backup, a new device under it, and every other
 * device revoked. The contacts see no change of key. The backed-up history
 * is fetched after, while chat already works. `wrong_key` when the typed
 * key does not open the backup.
 */
export async function restoreChat(
  userId: string,
  typed: string,
): Promise<ChatEngine | "wrong_key"> {
  const key = await readRecoveryKey(typed);
  if (!key) return "wrong_key";
  const [backup, devices] = await Promise.all([
    chatApi.recoveryBackup(),
    chatApi.devices(),
  ]);
  if (toBase64(key.id) !== backup.keyId) return "wrong_key";

  let opened;
  try {
    opened = await openRecoveryBackup(key, userId, fromBase64(backup.backup));
  } catch {
    return "wrong_key";
  }
  const { account, archive, pinned, revoked } = opened;
  // The server refuses a backup of an older key; this says so sooner.
  if (devices.accountKey !== toBase64(account.publicKey)) {
    throw new ChatApiError("conflict");
  }

  const device = await createDevice(account);
  const revocations = await Promise.all(
    devices.devices
      .filter((other) => other.revokedAt === null)
      .map((other) => revokeDevice(account, other.deviceId)),
  );
  await chatApi.restore({
    certificate: certificateWire(device.certificate),
    revocations: revocations.map(revocationWire),
  });
  await deleteChatStore(userId);
  const engine = await ChatEngine.begin(userId, account, device, {
    recovery: key,
    pinned,
    revoked,
    revocations,
  });

  // Only the archive the server still keeps for the backup.
  if (archive && archive.archiveId === backup.archive?.archiveId) {
    await engine.holdHistory(archive, "backup");
    void engine.resumeHistory();
  } else if (archive) {
    wipe(archive.key.reveal());
  }
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
  /** Commits whose answer was lost, while their group is in memory. */
  readonly #outstanding = new Map<
    string,
    { pending: PendingCommit; group: Conversation }
  >();
  /** When a rotation was last tried, so one that fails waits. */
  readonly #rotationTriedAt = new Map<string, number>();
  readonly #listeners = new Set<() => void>();
  #queue: Promise<unknown> = Promise.resolve();
  #historyTransfer: HistoryTransfer | null = null;
  #receivingHistory: Promise<void> | null = null;
  #historyRetryAt = 0;
  #recovery: RecoveryKey | null;
  readonly #linked: boolean;
  #linkedAt: Promise<string | null> | null = null;
  #backup: BackupState | undefined;
  #backingUp: Promise<void> | null = null;
  /** The pinned keys and revocations as last saved: the backup carries them. */
  #trusted: string;

  constructor(
    readonly userId: string,
    private readonly store: ChatStore,
    private readonly account: AccountKey,
    private readonly device: Device,
    private readonly trust: MemoryTrustStore,
    {
      recovery = null,
      linked = false,
      addedAt,
    }: {
      /** The recovery key's backup key, if this device has it (ADR-0010 §8). */
      recovery?: RecoveryKey | null;
      /** It was linked to the others (ADR-0010 §5). */
      linked?: boolean;
      /** When the server added it, if already known. */
      addedAt?: string | undefined;
    } = {},
  ) {
    this.#recovery = recovery;
    this.#linked = linked;
    if (linked && addedAt) this.#linkedAt = Promise.resolve(addedAt);
    this.#trusted = JSON.stringify(trust.snapshot());
  }

  /**
   * A device with fresh keys: stores them, with the recovery key's backup
   * key if it got one and whether it was linked, and publishes key packages.
   */
  static async begin(
    userId: string,
    account: AccountKey,
    device: Device,
    {
      recovery,
      linked = false,
      pinned = {},
      revoked = [],
      revocations = [],
    }: {
      recovery?: RecoveryKey | undefined;
      linked?: boolean;
      /** The contacts' keys the account's other device had pinned (§5, §8). */
      pinned?: Record<string, string> | undefined;
      /** The devices the account's other device knew were revoked (§7). */
      revoked?: string[] | undefined;
      /** Revocations this device just signed (a restore, §8). */
      revocations?: DeviceRevocation[];
    } = {},
  ): Promise<ChatEngine> {
    const store = await openChatStore(userId);
    const trust = createMemoryTrustStore({ accountKeys: pinned, revoked });
    trust.setAccountKey(userId, account.publicKey);
    for (const revocation of revocations) {
      await applyRevocation(trust, revocation);
    }
    await putSecret(store, records.account, exportAccountKey(account));
    await putSecret(store, records.device, exportDevice(device));
    if (recovery) {
      await putSecret(store, records.recovery, exportRecoveryKey(recovery));
    }
    if (linked) await store.putJson(records.linked, true);
    await store.putJson(records.trust, trust.snapshot());
    const engine = new ChatEngine(userId, store, account, device, trust, {
      recovery: recovery ?? null,
      linked,
    });
    await engine.replenishKeyPackages();
    return engine;
  }

  get deviceId(): string {
    return this.device.certificate.deviceId;
  }

  /**
   * When the server added this device, if it was linked rather than the
   * first or a restored one (13). Asked for once, then kept.
   */
  linkedAt(): Promise<string | null> {
    if (!this.#linked) return Promise.resolve(null);
    this.#linkedAt ??= chatApi.devices().then(
      ({ devices }) =>
        devices.find((d) => d.deviceId === this.deviceId)?.createdAt ?? null,
      (problem: unknown) => {
        this.#linkedAt = null;
        throw problem;
      },
    );
    return this.#linkedAt;
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

  /**
   * The contacts' account keys this device has pinned and the devices it
   * knows were revoked, for a new or restored device of the account to
   * start from (ADR-0010 §5, §7, §8). If there are more than a package
   * holds, the contacts the user has written to come first, then those
   * who wrote, then the rest: a server can make a device pin accounts, but
   * not make its user write to them.
   */
  async #carriedTrust() {
    const activity = new Map<string, [number, string]>();
    const met = (userId: string, tier: number, at: string) => {
      const [known, last] = activity.get(userId) ?? [3, ""];
      if (tier < known || (tier === known && at > last)) {
        activity.set(userId, [tier, at]);
      }
    };
    const prefix = records.conversation("");
    for (const name of await this.store.names(prefix)) {
      const id = name.slice(prefix.length);
      const others = (await this.#record(id)).participants.filter(
        (userId) => userId !== this.userId,
      );
      const history = await this.history(id);
      for (const userId of others) {
        met(userId, 2, "");
        for (const entry of history) {
          if (entry.own && entry.sentAt) met(userId, 0, entry.sentAt);
          if (entry.senderUserId === userId && entry.text !== null) {
            met(userId, 1, entry.sentAt ?? "");
          }
        }
      }
    }
    const ranked = [...activity]
      .sort(
        ([, [tierA, atA]], [, [tierB, atB]]) =>
          tierA - tierB || atB.localeCompare(atA),
      )
      .map(([userId]) => userId);
    return carriedTrust(this.trust.snapshot(), this.userId, ranked);
  }

  /** The account's pending link request the user's code points to. */
  async findLinkRequest(
    requests: readonly ChatLinkRequest[],
    shown: { code: string },
  ): Promise<MatchedLinkRequest | undefined> {
    const keyed = requests.map((request) => ({
      request,
      ...linkKeysOf(request),
    }));
    const found = (await matchLinkRequest(keyed, shown))?.request;
    return found && { ...found, code: shown.code };
  }

  /**
   * Certifies the new device and seals the account key to it, with what
   * this device trusts. With `moveHistory`, also the key of this device's
   * history, stored encrypted, and the recovery key's backup key if this
   * device has it: that key opens the backup's history too, so a device
   * the user gave only new messages never gets it (ADR-0010 §5).
   */
  async approveLink(
    request: MatchedLinkRequest,
    moveHistory = false,
  ): Promise<void> {
    const archive = moveHistory
      ? await sendHistory(
          packHistory(await this.#exclusive(() => this.#ownHistory())),
          { purpose: "link", linkRequestId: request.linkRequestId },
        )
      : undefined;
    const { certificate, sealed } = await approveLink(
      linkKeysOf(request),
      request.code,
      {
        account: this.account,
        archive,
        recovery: (moveHistory && this.#recovery) || undefined,
        ...(await this.#carriedTrust()),
      },
    );
    if (archive) wipe(archive.key.reveal());
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

  // The recovery key (ADR-0010 §8, PS-COM-019)

  /** This device keeps the recovery key's backup up to date. */
  get hasRecoveryKey(): boolean {
    return this.#recovery !== null;
  }

  /**
   * Makes a new recovery key, which replaces the account's earlier one.
   * The code is for the user to write down, once; this device keeps only
   * what it needs for the backup.
   *
   * The new backup keeps the history the one there now holds, with this
   * device's, in the same step: none of it is ever without a backup. That
   * needs the backup's key; without it, the backup's history goes, and
   * nothing is made until the user agrees to lose it: the answer is what
   * they agree to. Made again with that answer's `dropsHistory`, the key
   * replaces that backup and no other.
   */
  async createRecoveryKey(
    dropping: string | null = null,
  ): Promise<{ code: string } | { dropsHistory: string }> {
    for (let attempt = 1; ; attempt++) {
      const current = await this.#exclusive(() => this.#readBackup());
      const pending = await this.#pendingKey(current);
      const opener =
        current &&
        [this.#recovery, pending].find((key) => this.#holdsKeyOf(current, key));
      if (current?.history && !opener && current.digest !== dropping) {
        return { dropsHistory: current.digest };
      }
      const startedAt = Date.now();
      // A first key has no backup to keep history in yet: it follows.
      const archive = current && (await this.#backupArchive(current, opener));
      const { code, key } = await createRecoveryKey();
      try {
        // Kept first: if the answer is lost, the backup the server may have
        // taken under it can still be opened, and its history kept.
        await putSecret(
          this.store,
          records.recoveryPending,
          exportRecoveryKey(key),
        );
        await chatApi.createRecoveryKey({
          keyId: toBase64(key.id),
          backup: toBase64(
            await sealRecoveryBackup(key, {
              account: this.account,
              ...(archive ? { archive } : {}),
              ...(await this.#carriedTrust()),
            }),
          ),
          archiveId: archive?.archiveId ?? null,
          replaces: current?.digest ?? null,
        });
      } catch (error) {
        if (backupOutdated(error) && attempt < chatTuning.conflictRetries) {
          continue;
        }
        throw error;
      } finally {
        if (archive) wipe(archive.key.reveal());
      }
      await putSecret(this.store, records.recovery, exportRecoveryKey(key));
      await this.store.delete(records.recoveryPending);
      this.#recovery = key;
      this.#changed();
      if (archive) {
        await this.#backedUp(startedAt);
      } else {
        void this.backUp().catch(() => undefined);
      }
      return { code };
    }
  }

  /**
   * A key this device made whose answer never came, if the backup there is
   * now is under it: the server took it, and only this device can open
   * that backup. Otherwise it is gone, and so is the record of it.
   */
  async #pendingKey(
    current: CurrentBackup | null,
  ): Promise<RecoveryKey | null> {
    const stored = await this.store.get(records.recoveryPending);
    if (!stored) return null;
    try {
      const key = importRecoveryKey(stored);
      if (
        current &&
        this.#holdsKeyOf(current, key) &&
        !this.#holdsKeyOf(current, this.#recovery)
      ) {
        return key;
      }
    } catch {
      // Not a key: nothing to open with it.
    } finally {
      wipe(stored);
    }
    await this.store.delete(records.recoveryPending);
    return null;
  }

  /**
   * Stores the history encrypted, and a new backup that holds its key. One
   * at a time. If another device has made a newer key since, this one
   * stops: only that key's devices keep the backup.
   */
  backUp(): Promise<void> {
    this.#backingUp ??= this.#backUpNow().finally(() => {
      this.#backingUp = null;
    });
    return this.#backingUp;
  }

  /**
   * Replaces only the backup it read, with what that one holds and what
   * this device holds: if another device backed up in between, it reads
   * and merges again. A backup it cannot read stops it, rather than lose
   * what that one held.
   */
  async #backUpNow(): Promise<void> {
    const recovery = this.#recovery;
    // Until history on its way here is in, a backup would leave it out.
    if (!recovery || (await this.#heldHistory()).length > 0) return;
    const startedAt = Date.now();
    for (let attempt = 1; ; attempt++) {
      const current = await this.#exclusive(() => this.#readBackup());
      if (!current || !this.#holdsKeyOf(current, recovery)) {
        // Another device has made a newer key.
        if (this.#recovery === recovery) {
          await this.store.delete(records.recovery);
          this.#recovery = null;
          this.#changed();
        }
        throw new ChatApiError("conflict");
      }
      const archive = await this.#backupArchive(current, recovery);
      try {
        await chatApi.backUp({
          keyId: toBase64(recovery.id),
          backup: toBase64(
            await sealRecoveryBackup(recovery, {
              account: this.account,
              archive,
              ...(await this.#carriedTrust()),
            }),
          ),
          archiveId: archive.archiveId,
          replaces: current.digest,
        });
        break;
      } catch (error) {
        if (!backupOutdated(error) || attempt >= chatTuning.conflictRetries) {
          throw error;
        }
      } finally {
        wipe(archive.key.reveal());
      }
    }
    await this.#backedUp(startedAt);
  }

  /** The backup holds what had changed by `startedAt`. */
  async #backedUp(startedAt: number) {
    const state = await this.#backupState();
    state.backedUpAt = startedAt;
    await this.store.putJson(records.backup, state);
  }

  /** The account's backup as the server has it now; null: there is none. */
  async #readBackup(): Promise<CurrentBackup | null> {
    let backup: ChatRecoveryBackup;
    try {
      backup = await chatApi.recoveryBackup();
    } catch (error) {
      if (error instanceof ChatApiError && error.code === "not_found") {
        return null;
      }
      throw error;
    }
    const sealed = fromBase64(backup.backup);
    return {
      keyId: backup.keyId,
      sealed,
      digest: toBase64(
        new Uint8Array(await crypto.subtle.digest("SHA-256", sealed)),
      ),
      history: backup.archive !== null,
    };
  }

  #holdsKeyOf(
    backup: CurrentBackup,
    recovery: RecoveryKey | null | undefined,
  ): boolean {
    return recovery != null && backup.keyId === toBase64(recovery.id);
  }

  /**
   * Stores, encrypted, the history a backup that replaces `current` keeps:
   * this device's, with what `current` holds if `key` opens it. A device
   * that is behind so never backs up less than the backup had.
   */
  async #backupArchive(
    current: CurrentBackup,
    key: RecoveryKey | null | undefined,
  ): Promise<LinkedArchive> {
    const backedUp = key ? await this.#takeInBackup(current, key) : [];
    const own = await this.#exclusive(() => this.#ownHistory());
    return sendHistory(packHistory(mergeConversations(own, backedUp)), {
      purpose: "backup",
    });
  }

  /**
   * What the backup holds that a backup replacing it must keep: its
   * revocations, taken in here, and its history, returned. Only
   * revocations: they can only take trust away. A backup under this
   * device's key that does not open stops the backup: it is not replaced
   * unread. Nor is it while its history cannot be fetched; once that is
   * gone or does not open, there is none left to keep.
   */
  async #takeInBackup(
    backup: CurrentBackup,
    recovery: RecoveryKey,
  ): Promise<ConversationHistory[]> {
    const opened = await openRecoveryBackup(
      recovery,
      this.userId,
      backup.sealed,
    );
    wipe(opened.account.signingKey.reveal());
    const { archive } = opened;
    try {
      await this.#exclusive(async () => {
        for (const ref of opened.revoked ?? []) {
          const device = revokedDeviceOf(ref);
          if (device) this.trust.addRevocation(device);
        }
        await this.#saveTrust();
      });
      if (!archive) return [];
      try {
        return unpackHistory(await receiveHistory(archive));
      } catch (error) {
        if (historyLost(error)) return [];
        throw error;
      }
    } finally {
      if (archive) wipe(archive.key.reveal());
    }
  }

  /** Backs up when the history has changed and the last backup is old. */
  async #backUpIfDue() {
    if (!this.#recovery) return;
    const { changedAt, backedUpAt } = await this.#backupState();
    if (
      changedAt > backedUpAt &&
      Date.now() - backedUpAt >= chatTuning.backupEveryMs
    ) {
      await this.backUp();
    }
  }

  /** What the backup holds has changed: the next due backup takes it. */
  async #backupDue() {
    if (!this.#recovery) return;
    const state = await this.#backupState();
    state.changedAt = Date.now();
    await this.store.putJson(records.backup, state);
  }

  async #backupState(): Promise<BackupState> {
    this.#backup ??= (await this.store.getJson<BackupState>(
      records.backup,
    )) ?? { changedAt: 0, backedUpAt: 0 };
    return this.#backup;
  }

  /**
   * Whether this device holds a conversation where both have written: the
   * one reminder of the recovery key waits for that (PS-COM-019).
   */
  async hasExchangedMessages(): Promise<boolean> {
    for (const { history } of await this.#ownHistory()) {
      const sent = (own: boolean) =>
        history.some((entry) => entry.own === own && entry.sentAt !== null);
      if (sent(true) && sent(false)) return true;
    }
    return false;
  }

  // Trust

  async #saveTrust() {
    const snapshot = this.trust.snapshot();
    await this.store.putJson(records.trust, snapshot);
    const trusted = JSON.stringify(snapshot);
    if (trusted !== this.#trusted) {
      this.#trusted = trusted;
      await this.#backupDue();
    }
  }

  /**
   * Pins first-seen account keys, records revocations and key changes. A
   * directory that does not name the conversation's two accounts, the same
   * as before, is not used: the group is dropped, so nothing more is read
   * or sent in it, and the conversation is out of step.
   */
  async #applyDirectory(conversationId: string, directory: ChatDirectory) {
    const record = await this.#record(conversationId);
    const participants = settleParticipants(
      this.userId,
      record.participants,
      directory.accounts.map(({ userId }) => userId),
    );
    if (!participants) {
      // A list stored before this rule may itself be wrong.
      if (!settleParticipants(this.userId, [], record.participants)) {
        record.participants.splice(0, Infinity);
      }
      record.problem = "out_of_sync";
      await this.#dropGroup(conversationId);
      await this.store.putJson(records.conversation(conversationId), record);
      return;
    }

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

    if (record.participants.length === 0) {
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
   * Only after the user has seen that the security code changed, and only
   * the key that code was for (`SecurityCode.key`): if the server has shown
   * another since, nothing is accepted. The conversations with the contact
   * are brought in line at once: their old devices out, the ones under the
   * new key in. Whether the key was accepted.
   */
  acceptKeyChange(userId: string, shownKey: string): Promise<boolean> {
    return this.#exclusive(async () => {
      const key = this.#keyChanges.get(userId);
      if (!key || toBase64(key) !== shownKey) return false;
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
      return true;
    });
  }

  /**
   * The 60 digits both contacts compare (ADR-0010 §3), for the other
   * participant of a conversation, as this device settled them; for anyone
   * else null, and nothing more is sent in it (`#shows`); undefined until
   * they are settled. While the
   * contact's key has changed and the user has not accepted it, the code
   * is the new key's, the one accepting would trust; until then nothing
   * is sent in the conversation.
   */
  async securityCode(
    conversationId: string,
    userId: string,
  ): Promise<SecurityCode | null | undefined> {
    if (userId === this.userId) return undefined;
    if (!(await this.#shows(conversationId, [userId]))) {
      return (await this.#record(conversationId)).participants.length === 0
        ? undefined
        : null;
    }
    const proposed = this.#keyChanges.get(userId);
    const key = proposed ?? this.trust.accountKey(userId);
    if (!key) return undefined;
    return {
      code: await securityCode(
        { accountId: this.userId, accountKey: this.account.publicKey },
        { accountId: userId, accountKey: key },
      ),
      key: toBase64(key),
      pending: proposed !== undefined,
    };
  }

  // Conversations on this device

  /**
   * Whether the accounts a page shows a conversation with are the ones its
   * group is between (ADR-0010 §3): the server says both, and the group is
   * what a message is encrypted to. Once this device has settled them, a
   * page that shows anyone else marks the conversation, and nothing more
   * is sent in it. Before that, nothing is decided.
   */
  async #shows(id: string, userIds: readonly string[]): Promise<boolean> {
    const record = await this.#record(id);
    if (record.participants.length === 0) return false;
    const others = record.participants.filter((u) => u !== this.userId);
    const shown = new Set(userIds);
    if (
      shown.size === others.length &&
      others.every((userId) => shown.has(userId))
    ) {
      return true;
    }
    if (record.problem !== "other_person") {
      record.problem = "other_person";
      await this.store.putJson(records.conversation(id), record);
      this.#changed();
    }
    return false;
  }

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

  /**
   * The group's state and the record that says how far it has come, in one
   * write: an interruption never leaves a record behind its group.
   */
  async #saveGroup(id: string, group: Conversation) {
    this.#groups.set(id, group);
    const record = await this.#record(id);
    record.epoch = Number(group.epoch);
    const state = (await group.export()).reveal();
    try {
      await this.store.putAll([
        [records.group(id), new Uint8Array(state)],
        [records.conversation(id), utf8(JSON.stringify(record))],
      ]);
    } finally {
      wipe(state);
    }
  }

  async #dropGroup(id: string) {
    this.#groups.delete(id);
    await this.store.delete(records.group(id));
  }

  /**
   * What this device knows of a conversation, for its page, which says
   * whom it `shows` the conversation is with (`#shows`).
   */
  async status(
    id: string,
    shows: readonly string[],
  ): Promise<{
    joined: boolean;
    /** No one else's device is in the group yet: nothing can reach them. */
    alone: boolean;
    problem: ConversationProblem | null;
  }> {
    await this.#shows(id, shows);
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

  /** Moving the other device's history here, if it is or was under way. */
  get historyTransfer(): HistoryTransfer | null {
    return this.#historyTransfer;
  }

  /**
   * Keeps the key of the history the approving device moved here, or the
   * backup's, in the device's encrypted store until the history is in.
   */
  async holdHistory(
    archive: LinkedArchive,
    from: HistoryTransfer["from"],
  ): Promise<void> {
    try {
      await putSecret(
        this.store,
        records.transfer(from),
        exportLinkedArchive(archive),
      );
    } finally {
      wipe(archive.key.reveal());
    }
  }

  /**
   * Fetches the history held for this device and adds it. After a lost
   * connection it is tried again on a later sync or load; it is given up
   * only when the archive is gone or does not open. One at a time.
   */
  resumeHistory(): Promise<void> {
    if (Date.now() < this.#historyRetryAt) return Promise.resolve();
    this.#receivingHistory ??= this.#receiveHeldHistory()
      .catch(() => undefined)
      .finally(() => {
        this.#receivingHistory = null;
      });
    return this.#receivingHistory;
  }

  async #heldHistory(): Promise<HistoryTransfer["from"][]> {
    const prefix = records.transfer("");
    return (await this.store.names(prefix)).map(
      (name) => name.slice(prefix.length) as HistoryTransfer["from"],
    );
  }

  async #receiveHeldHistory(): Promise<void> {
    for (const from of await this.#heldHistory()) {
      const stored = await this.store.get(records.transfer(from));
      if (!stored) continue;
      let archive: LinkedArchive;
      try {
        archive = importLinkedArchive(stored);
      } catch {
        await this.store.delete(records.transfer(from));
        continue;
      } finally {
        wipe(stored);
      }
      this.#historyTransfer = { state: "running", from };
      this.#changed();
      try {
        const moved = unpackHistory(await receiveHistory(archive));
        await this.#exclusive(async () => {
          for (const { id, history, seen } of moved) {
            await this.#updateHistory(id, (own) => mergeHistory(own, history));
            if (seen !== null && (await this.seen(id)) === null) {
              await this.store.putJson(records.seen(id), seen);
            }
          }
        });
        await this.#releaseHistory(from, archive);
        this.#historyTransfer = { state: "done", from };
      } catch (error) {
        if (historyLost(error)) {
          await this.#releaseHistory(from, archive);
          this.#historyTransfer = { state: "failed", from };
        } else {
          this.#historyRetryAt = Date.now() + chatTuning.historyRetryMs;
        }
      } finally {
        wipe(archive.key.reveal());
        this.#changed();
      }
    }
  }

  /**
   * Done with held history: its key goes, and a link's archive leaves the
   * server. The backup's stays there, for the backup still points to it.
   */
  async #releaseHistory(from: HistoryTransfer["from"], archive: LinkedArchive) {
    await this.store.delete(records.transfer(from));
    if (from === "device") {
      await chatApi.deleteArchive(archive.archiveId).catch(() => undefined);
    }
  }

  async #ownHistory(): Promise<ConversationHistory[]> {
    const prefix = records.history("");
    return Promise.all(
      (await this.store.names(prefix)).map(async (name) => {
        const id = name.slice(prefix.length);
        return {
          id,
          history: await this.history(id),
          seen: await this.seen(id),
        };
      }),
    );
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
    await this.#backupDue();
  }

  /** Adds a received message, never in place of one (`withReceived`). */
  async #rememberReceived(id: string, entry: HistoryEntry) {
    await this.#updateHistory(id, (entries) => withReceived(entries, entry));
  }

  /** Adds an own message, once: another try of the same message is the same. */
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
      await this.#rotateDue();
      // Not awaited: they wait for this operation to end.
      void this.resumeHistory();
      void this.#backUpIfDue().catch(() => undefined);
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
        // From a device no longer trusted: not shown at all (ADR-0010 §7).
        if (received.kind === "untrusted") return;
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
    await this.#rememberReceived(id, entry);
  }

  /**
   * Joins from a welcome, never to an earlier generation or epoch than this
   * device has had: a welcome the server delivers again (the last-resort
   * key package opens it as often as it comes) would otherwise take the
   * group back to keys that others have moved on from, or that removed
   * devices hold, and this device would use its keys there again.
   */
  async #join(id: string, generation: number, welcome: Uint8Array) {
    const record = await this.#record(id);
    if (generation < record.generation) return;
    const stored = await this.#storedKeyPackages();
    const bundles = stored.map((entry) => importKeyPackage(utf8(entry.data)));
    const bundle = await Conversation.keyPackageFor(welcome, bundles);

    if (!bundle) {
      // Delivered again after its one-time package was used: nothing new.
      if (generation === record.generation && (await this.#group(id))) return;
      record.problem = "no_key_package";
      await this.store.putJson(records.conversation(id), record);
      return;
    }
    const used = stored[bundles.indexOf(bundle)];

    try {
      const group = await Conversation.join(
        welcome,
        bundle,
        this.#policy(record),
      );
      if (group.groupId !== groupIdOf(id, generation)) {
        throw new Error("welcome for another group");
      }
      if (Number(group.epoch) <= (await this.#knownEpoch(id, generation))) {
        return;
      }
      Object.assign(record, {
        generation,
        // A last-resort package's keys may be in other groups too.
        lastCommitAt: used?.lastResort ? null : Date.now(),
        problem: null,
      });
      await this.#saveGroup(id, group);
    } catch {
      record.problem = "out_of_sync";
      await this.store.putJson(records.conversation(id), record);
      return;
    }

    if (used && !used.lastResort) {
      await this.store.putJson(
        records.keyPackages,
        stored.filter((entry) => entry !== used),
      );
    }
  }

  /**
   * The newest epoch this device has had in the generation: the record's,
   * or the stored group's if that is newer (a record from before both were
   * written together may lag behind). -1 for a generation it has not had.
   */
  async #knownEpoch(id: string, generation: number): Promise<number> {
    const record = await this.#record(id);
    if (generation !== record.generation) return -1;
    const stored = Number((await this.#group(id))?.epoch ?? -1);
    return Math.max(record.epoch ?? -1, stored);
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
    // A group this device fell out of step with cannot be repaired here,
    // and one with someone else than the page shows is left as it is.
    if (record.problem === "out_of_sync" || record.problem === "other_person") {
      return;
    }
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
      starting,
    });
    return true;
  }

  /**
   * Sends a commit and, once the server has accepted it, moves the group on.
   * It is stored first with the state it leads to, so an answer lost to a
   * closed page is fetched again later (`#settleOutstanding`) instead of
   * leaving this device behind the group for good.
   */
  async #submit(
    id: string,
    group: Conversation,
    generation: number,
    pending: PendingCommit,
    {
      added = [],
      removed = [],
      starting = false,
    }: { added?: string[]; removed?: string[]; starting?: boolean },
  ) {
    const stored: StoredCommit = {
      idempotencyKey: crypto.randomUUID(),
      body: {
        generation,
        commit: toBase64(pending.commit),
        welcome: pending.welcome ? toBase64(pending.welcome) : null,
        addedDeviceIds: added,
        removedDeviceIds: removed,
      },
      // A new group's keys are all new.
      rotates: pending.rotates || starting,
    };
    await putSecret(this.store, records.commitState(id), pending.state());
    await this.store.putJson(records.commit(id), stored);
    this.#outstanding.set(id, { pending, group });
    await this.#settle(id, stored);
  }

  /** Sends a stored commit (again) and settles it with the server's answer. */
  async #settle(id: string, stored: StoredCommit) {
    let accepted: { generation: number };
    try {
      accepted = await chatApi.commit(id, stored.body, stored.idempotencyKey);
    } catch (error) {
      if (!(error instanceof ChatApiError && error.code === "network")) {
        this.#outstanding.get(id)?.pending.discard();
        await this.#forgetCommit(id);
      }
      throw error;
    }

    const inMemory = this.#outstanding.get(id);
    let group: Conversation;
    if (inMemory) {
      inMemory.pending.accept();
      group = inMemory.group;
    } else {
      // The page was reloaded: the state the commit leads to was stored.
      const state = await this.store.get(records.commitState(id));
      const policy = this.#policy(await this.#record(id));
      try {
        if (!state) throw new Error("no state");
        group = Conversation.restore(state, policy);
      } catch {
        // Accepted, but this device cannot follow: out of step.
        await this.#forgetCommit(id);
        await this.#outOfStep(id);
        return;
      } finally {
        if (state) wipe(state);
      }
    }
    const record = await this.#record(id);
    Object.assign(record, {
      generation: accepted.generation,
      problem: null,
      ...(stored.rotates && { lastCommitAt: Date.now() }),
    });
    await this.#saveGroup(id, group);
    await this.#forgetCommit(id);
  }

  async #outOfStep(id: string) {
    const record = await this.#record(id);
    record.problem = "out_of_sync";
    await this.store.putJson(records.conversation(id), record);
  }

  async #forgetCommit(id: string) {
    this.#outstanding.delete(id);
    await this.store.delete(records.commit(id));
    await this.store.delete(records.commitState(id));
  }

  /** Whether a commit of the conversation still waits for its answer. */
  async #commitWaiting(id: string): Promise<boolean> {
    return (
      this.#outstanding.has(id) ||
      (await this.store.getJson(records.commit(id))) !== undefined
    );
  }

  /**
   * A commit whose answer never came is sent again with the same key, which
   * returns the first answer if the server took it. Until it is settled the
   * group can do nothing else.
   */
  async #settleOutstanding() {
    const prefix = records.commit("");
    for (const name of await this.store.names(prefix)) {
      const id = name.slice(prefix.length);
      const stored = await this.store.getJson<StoredCommit>(name);
      if (!stored) continue;
      try {
        await this.#settle(id, stored);
      } catch (error) {
        if (error instanceof ChatApiError && error.code === "network") {
          throw error;
        }
      }
    }
  }

  // Sending

  /**
   * Encrypts and sends a message. The group's new state is stored before
   * the ciphertext leaves, so a key is never used twice. A message that did
   * not get through stays in the history as unsent and is tried again on
   * the next sync; the receiver keeps one copy of it. Whether the message
   * left: it waits, unsent, while no one else's device is in the group (the
   * other person has not turned chat on yet), since a device added later
   * can never read it, and while the group is not settled (`#mayEncrypt`).
   */
  async send(
    id: string,
    text: string,
    to: readonly string[],
  ): Promise<boolean> {
    const entry: HistoryEntry = {
      id: crypto.randomUUID(),
      senderUserId: this.userId,
      own: true,
      text,
      sentAt: null,
      unsent: true,
      to: [...to],
    };
    await this.#exclusive(() => this.#remember(id, entry));
    return this.#exclusive(() => this.#deliver(id, entry));
  }

  /**
   * Every message is encrypted to a group brought in line with what the
   * server says now (`#maintain`), so a revoked device is removed before,
   * not after. `inLine` skips that for the next messages of one round.
   */
  async #deliver(
    id: string,
    entry: HistoryEntry,
    inLine = false,
  ): Promise<boolean> {
    for (let attempt = 1; ; attempt++) {
      if (!inLine) {
        await this.#settleOutstanding();
        await this.#maintain(id);
      }
      inLine = false;
      const group = await this.#group(id);
      if (!group) throw new ChatApiError("conflict");
      if (
        !(await this.#mayEncrypt(id, group, entry)) ||
        !group.members().some((m) => m.accountId !== this.userId)
      ) {
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
      }
    }
  }

  /**
   * The one check before anything is encrypted in a conversation: the
   * group is between the two accounts this device settled, the other one
   * is whom the page showed the message was written to, every device in
   * it is one this device trusts (none revoked, none under a replaced
   * account key), no changed key waits for the user, no commit waits for
   * its answer, and the group is not out of step (ADR-0010 §3, §7).
   */
  async #mayEncrypt(
    id: string,
    group: Conversation,
    entry: HistoryEntry,
  ): Promise<boolean> {
    const record = await this.#record(id);
    return (
      entry.to !== undefined &&
      (await this.#shows(id, entry.to)) &&
      record.problem === null &&
      record.participants.length === 2 &&
      !record.participants.some((userId) => this.#keyChanges.has(userId)) &&
      !(await this.#commitWaiting(id)) &&
      group.untrustedMembers().length === 0
    );
  }

  async #resendUnsent() {
    for (const name of await this.store.names("history:")) {
      const id = name.slice("history:".length);
      const waiting = (await this.history(id)).filter((entry) => entry.unsent);
      if (waiting.length === 0 || !(await this.#group(id))) continue;

      // The first brings the group in line (a contact may have enabled chat
      // since the last poll); the rest follow in the same group.
      let inLine = false;
      for (const entry of waiting) {
        inLine = await this.#deliver(id, entry, inLine).catch(() => false);
        if (!inLine) break;
      }
    }
  }

  /**
   * Replaces this device's keys in each group where it is due (ADR-0010
   * §4), also where the user has not opened the conversation: what keeps a
   * device's keys fresh is that it rotates them, whether or not it writes.
   */
  async #rotateDue() {
    const now = Date.now();
    const prefix = records.group("");
    for (const name of await this.store.names(prefix)) {
      const id = name.slice(prefix.length);
      const { lastCommitAt, problem } = await this.#record(id);
      if (
        problem !== null ||
        (lastCommitAt !== null &&
          now - lastCommitAt <= chatTuning.rotateAfterMs) ||
        now - (this.#rotationTriedAt.get(id) ?? 0) < chatTuning.rotateRetryMs
      ) {
        continue;
      }
      this.#rotationTriedAt.set(id, now);
      await this.#maintain(id).catch(() => undefined);
    }
  }
}
