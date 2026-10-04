import {
  type AuthenticationService,
  type ClientConfig,
  type ClientState,
  type Credential,
  type CreateCommitResult,
  type IncomingMessageCallback,
  type KeyPackage,
  type MLSMessage,
  type PrivateKeyPackage,
  type PrivateMessage,
  type Proposal,
  createApplicationMessage,
  createCommit,
  createGroup,
  decodeMlsMessage,
  defaultCapabilities,
  defaultKeyPackageEqualityConfig,
  defaultKeyRetentionConfig,
  defaultLifetimeConfig,
  emptyPskIndex,
  encodeMlsMessage,
  generateKeyPackageWithKey,
  joinGroup,
  processPrivateMessage,
} from "ts-mls";
// ts-mls 1.x does not report who sent an application message; 2.x does
// (`senderLeafIndex`). Until Lånbort moves to 2.x, the sender is read with
// the library's own decryption step. See `senderOf`.
import { unprotectPrivateMessage } from "ts-mls/messageProtection.js";
import {
  type Device,
  type DeviceCertificate,
  type DeviceRef,
  decodeCertificate,
  encodeCertificate,
  verifyDeviceCertificate,
} from "./identity";
import { Secret, wipe } from "./secret";
import { bytesEqual, loadSuite, utf8 } from "./suite";
import type { TrustStore } from "./trust";

/**
 * Who may be in a conversation. `participants` comes from the server's domain
 * rules (friends, an allowed first contact, a loan's logistics channel); the
 * trust store decides which of their devices are genuinely theirs.
 */
export interface ConversationPolicy {
  participants: readonly string[];
  trust: TrustStore;
}

/** A key package stays valid for at most this long (ts-mls caps it at a month). */
export const KEY_PACKAGE_LIFETIME_SECONDS = 28 * 24 * 60 * 60;

/** Tolerated clock difference between the device that makes a key package and the one that adds it. */
const CLOCK_SKEW_SECONDS = 60 * 60;

/** Shorter messages are padded to this length so their size is not revealed. */
const PADDED_LENGTH = 1024;

/** Only these proposals are accepted; anything else in a commit is rejected. */
const permittedProposals = new Set<Proposal["proposalType"]>([
  "add",
  "remove",
  "update",
]);

/**
 * The MLS authentication service for one conversation (ADR-0010). A device is
 * accepted only if its credential is a device certificate that is signed by
 * the account key this device has pinned for that account, binds the device's
 * actual signature key, names an account that is a participant, and has not
 * been revoked. A device the server slips into a key directory is rejected.
 */
export function conversationAuthenticator(
  policy: ConversationPolicy,
): AuthenticationService {
  return {
    async validateCredential(credential, signaturePublicKey) {
      const certificate = certificateOf(credential);
      return (
        certificate !== undefined &&
        currentlyTrusted(policy, certificate) &&
        bytesEqual(certificate.deviceKey, signaturePublicKey) &&
        (await verifyDeviceCertificate(certificate))
      );
    },
  };
}

const certificateOf = (credential: Credential) =>
  credential.credentialType === "basic"
    ? decodeCertificate(credential.identity)
    : undefined;

/**
 * Whether this device still trusts a certificate it once accepted: the account
 * is a participant, its pinned account key is the one that signed, and the
 * device has not been revoked. A member may be removed only once this is no
 * longer true, so no participant can remove another's device at will.
 */
const currentlyTrusted = (
  policy: ConversationPolicy,
  certificate: DeviceCertificate,
) => {
  const pinned = policy.trust.accountKey(certificate.accountId);
  return (
    policy.participants.includes(certificate.accountId) &&
    pinned !== undefined &&
    bytesEqual(pinned, certificate.accountKey) &&
    !policy.trust.isRevoked(certificate)
  );
};

const clientConfig = (policy: ConversationPolicy): ClientConfig => ({
  keyRetentionConfig: defaultKeyRetentionConfig,
  // Lifetimes are checked when this device adds a key package. Checking them
  // again on receive would lock new devices out of groups whose members
  // simply have not rotated keys since joining.
  lifetimeConfig: defaultLifetimeConfig,
  keyPackageEqualityConfig: defaultKeyPackageEqualityConfig,
  paddingConfig: { kind: "padUntilLength", padUntilLength: PADDED_LENGTH },
  authService: conversationAuthenticator(policy),
});

/**
 * Accepts only add, update and remove, and a remove only of a device this
 * device no longer trusts (revoked, under a replaced account key, or no
 * longer a participant). Adds and updates are checked by the authenticator.
 */
const acceptableChanges =
  (state: ClientState, policy: ConversationPolicy): IncomingMessageCallback =>
  (incoming) => {
    const proposals =
      incoming.kind === "commit"
        ? incoming.proposals.map((p) => p.proposal)
        : [incoming.proposal.proposal];
    return proposals.every(
      (p) =>
        permittedProposals.has(p.proposalType) &&
        (p.proposalType !== "remove" ||
          mayBeRemoved(state, policy, p.remove.removed)),
    )
      ? "accept"
      : "reject";
  };

function mayBeRemoved(
  state: ClientState,
  policy: ConversationPolicy,
  leafIndex: number,
): boolean {
  const node = state.ratchetTree[leafIndex * 2];
  const certificate =
    node?.nodeType === "leaf" ? certificateOf(node.leaf.credential) : undefined;
  return certificate !== undefined && !currentlyTrusted(policy, certificate);
}

export interface KeyPackageBundle {
  /** Published to the server's key package directory for this device. */
  published: Uint8Array;
  /** Stays on the device until a welcome uses it; then it is discarded. */
  secret: Secret<{
    publicPackage: KeyPackage;
    privatePackage: PrivateKeyPackage;
  }>;
}

export async function createKeyPackage(
  device: Device,
  now: Date = new Date(),
): Promise<KeyPackageBundle> {
  const issuedAt = BigInt(Math.floor(now.getTime() / 1000));
  const notBefore = issuedAt - BigInt(CLOCK_SKEW_SECONDS);
  const { publicPackage, privatePackage } = await generateKeyPackageWithKey(
    {
      credentialType: "basic",
      identity: encodeCertificate(device.certificate),
    },
    defaultCapabilities(),
    {
      notBefore,
      notAfter: issuedAt + BigInt(KEY_PACKAGE_LIFETIME_SECONDS),
    },
    [],
    {
      signKey: device.signingKey.reveal(),
      publicKey: device.certificate.deviceKey,
    },
    await loadSuite(),
  );
  return {
    published: encodeMlsMessage({
      version: "mls10",
      wireformat: "mls_key_package",
      keyPackage: publicPackage,
    }),
    secret: new Secret({ publicPackage, privatePackage }),
  };
}

/**
 * A commit waits for the server to place it in the conversation's order
 * (exactly one commit wins each epoch). Call `accept()` once the server has
 * accepted it. If another commit won, call `discard()`, receive the winner
 * and try again. Until one of them is called, the conversation sends and
 * receives nothing, so the commit always applies to the state it was made
 * from.
 */
export interface PendingCommit {
  commit: Uint8Array;
  /** For the added devices, sent only after the commit is accepted. */
  welcome?: Uint8Array;
  accept(): void;
  discard(): void;
}

export type Received =
  | { kind: "message"; sender: DeviceRef; plaintext: Uint8Array }
  | { kind: "commit"; epoch: bigint };

function decode<W extends MLSMessage["wireformat"]>(
  bytes: Uint8Array,
  wireformat: W,
): Extract<MLSMessage, { wireformat: W }> {
  const [message] = decodeMlsMessage(bytes, 0) ?? [];
  if (message?.wireformat !== wireformat) {
    throw new Error(`expected ${wireformat}`);
  }
  return message as Extract<MLSMessage, { wireformat: W }>;
}

function refOf(state: ClientState, leafIndex: number): DeviceRef {
  const node = state.ratchetTree[leafIndex * 2];
  const certificate =
    node?.nodeType === "leaf" && node.leaf.credential.credentialType === "basic"
      ? decodeCertificate(node.leaf.credential.identity)
      : undefined;
  if (!certificate) throw new Error("unknown sender");
  return { accountId: certificate.accountId, deviceId: certificate.deviceId };
}

/**
 * One device's view of one conversation: an MLS group whose members are the
 * participants' devices (ADR-0010). Group state, and the keys in it, never
 * leave the object except through WP-43's encrypted device storage.
 */
export class Conversation {
  #state: ClientState;
  #pending: object | undefined;
  #queue: Promise<unknown> = Promise.resolve();

  readonly #policy: ConversationPolicy;

  private constructor(state: ClientState, policy: ConversationPolicy) {
    this.#state = state;
    this.#policy = policy;
  }

  static async create(
    device: Device,
    conversationId: string,
    policy: ConversationPolicy,
  ): Promise<Conversation> {
    const own = (await createKeyPackage(device)).secret.reveal();
    return new Conversation(
      await createGroup(
        utf8(conversationId),
        own.publicPackage,
        own.privatePackage,
        [],
        await loadSuite(),
        clientConfig(policy),
      ),
      policy,
    );
  }

  /** Joins from a welcome. The new device sees only what is sent from now on. */
  static async join(
    welcome: Uint8Array,
    keyPackage: KeyPackageBundle,
    policy: ConversationPolicy,
  ): Promise<Conversation> {
    const { publicPackage, privatePackage } = keyPackage.secret.reveal();
    return new Conversation(
      await joinGroup(
        decode(welcome, "mls_welcome").welcome,
        publicPackage,
        privatePackage,
        emptyPskIndex,
        await loadSuite(),
        undefined,
        undefined,
        clientConfig(policy),
      ),
      policy,
    );
  }

  get epoch(): bigint {
    return this.#state.groupContext.epoch;
  }

  members(): DeviceRef[] {
    return this.#leaves().map(({ ref }) => ref);
  }

  #leaves(): { ref: DeviceRef; leafIndex: number }[] {
    return this.#state.ratchetTree.flatMap((node, index) =>
      node?.nodeType === "leaf"
        ? [{ ref: refOf(this.#state, index / 2), leafIndex: index / 2 }]
        : [],
    );
  }

  /** Adds devices from their published key packages. */
  add(keyPackages: Uint8Array[]): Promise<PendingCommit> {
    return this.#commit(
      keyPackages.map((bytes) => ({
        proposalType: "add",
        add: { keyPackage: decode(bytes, "mls_key_package").keyPackage },
      })),
    );
  }

  /**
   * Removes devices this device no longer trusts: a revoked device, devices
   * under a replaced account key, or a former participant's devices.
   */
  remove(devices: DeviceRef[]): Promise<PendingCommit> {
    const wanted = new Set(
      devices.map((d) => JSON.stringify([d.accountId, d.deviceId])),
    );
    return this.#serially(() => {
      const leaves = this.#leaves().flatMap(({ ref, leafIndex }) =>
        wanted.has(JSON.stringify([ref.accountId, ref.deviceId]))
          ? [leafIndex]
          : [],
      );
      if (leaves.length !== wanted.size) throw new Error("unknown device");
      if (
        !leaves.every((leaf) => mayBeRemoved(this.#state, this.#policy, leaf))
      ) {
        throw new Error("device is still trusted");
      }
      return this.#createCommit(
        leaves.map((removed) => ({
          proposalType: "remove",
          remove: { removed },
        })),
      );
    });
  }

  /** Replaces this device's keys in the group (post-compromise security). */
  rotateKeys(): Promise<PendingCommit> {
    return this.#commit([]);
  }

  encrypt(plaintext: Uint8Array): Promise<Uint8Array> {
    return this.#serially(() => this.#encrypt(plaintext));
  }

  receive(bytes: Uint8Array): Promise<Received> {
    return this.#serially(() => this.#receive(bytes));
  }

  /**
   * Runs state changes one at a time, so two calls never start from the same
   * state, and refuses them while a commit waits for the server.
   */
  #serially<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.#queue.then(() => {
      if (this.#pending) throw new Error("commit pending");
      return operation();
    });
    this.#queue = run.catch(() => undefined);
    return run;
  }

  async #encrypt(plaintext: Uint8Array): Promise<Uint8Array> {
    const { newState, privateMessage, consumed } =
      await createApplicationMessage(this.#state, plaintext, await loadSuite());
    this.#state = newState;
    wipe(...consumed);
    return encodeMlsMessage({
      version: "mls10",
      wireformat: "mls_private_message",
      privateMessage,
    });
  }

  async #receive(bytes: Uint8Array): Promise<Received> {
    const { privateMessage } = decode(bytes, "mls_private_message");
    const cs = await loadSuite();
    const sender =
      privateMessage.contentType === "application"
        ? await this.#senderOf(privateMessage)
        : undefined;
    const result = await processPrivateMessage(
      this.#state,
      privateMessage,
      emptyPskIndex,
      cs,
      acceptableChanges(this.#state, this.#policy),
    );
    wipe(...result.consumed, ...(sender?.consumed ?? []));
    if (result.kind === "applicationMessage") {
      if (!sender) throw new Error("unexpected application message");
      this.#state = result.newState;
      return {
        kind: "message",
        sender: sender.ref,
        plaintext: result.message,
      };
    }
    if (result.actionTaken === "reject") {
      throw new Error("rejected membership change");
    }
    this.#state = result.newState;
    return { kind: "commit", epoch: this.epoch };
  }

  #commit(proposals: Proposal[]): Promise<PendingCommit> {
    return this.#serially(() => this.#createCommit(proposals));
  }

  async #createCommit(proposals: Proposal[]): Promise<PendingCommit> {
    const result: CreateCommitResult = await createCommit(
      { state: this.#state, cipherSuite: await loadSuite() },
      { extraProposals: proposals, ratchetTreeExtension: true },
    );
    const token = {};
    this.#pending = token;
    const settle = () => {
      if (this.#pending !== token) throw new Error("commit no longer pending");
      this.#pending = undefined;
    };
    return {
      commit: encodeMlsMessage(result.commit),
      ...(result.welcome && {
        welcome: encodeMlsMessage({
          version: "mls10",
          wireformat: "mls_welcome",
          welcome: result.welcome,
        }),
      }),
      accept: () => {
        settle();
        this.#state = result.newState;
        wipe(...result.consumed);
      },
      discard: settle,
    };
  }

  /**
   * Reads the authenticated sender of an application message by running the
   * library's decryption on the current, unchanged state. The state itself is
   * advanced only by `processPrivateMessage`.
   */
  async #senderOf(message: PrivateMessage) {
    const state = this.#state;
    const epoch =
      message.epoch < state.groupContext.epoch
        ? state.historicalReceiverData.get(message.epoch)
        : {
            senderDataSecret: state.keySchedule.senderDataSecret,
            secretTree: state.secretTree,
            ratchetTree: state.ratchetTree,
            groupContext: state.groupContext,
          };
    if (!epoch) throw new Error("epoch too old");
    const { content, consumed } = await unprotectPrivateMessage(
      epoch.senderDataSecret,
      message,
      epoch.secretTree,
      epoch.ratchetTree,
      epoch.groupContext,
      state.clientConfig.keyRetentionConfig,
      await loadSuite(),
    );
    const { sender } = content.content;
    if (sender.senderType !== "member") throw new Error("not a member");
    return {
      ref: refOf(
        { ...state, ratchetTree: epoch.ratchetTree },
        sender.leafIndex,
      ),
      consumed,
    };
  }

  toJSON(): string {
    return "[conversation]";
  }

  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return "Conversation([redacted])";
  }
}
