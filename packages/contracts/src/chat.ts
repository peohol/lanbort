import { z } from "zod";
import { personLinkShape } from "./social";

/**
 * Private end-to-end encrypted chat (PS-COM-004–006, PS-COM-009, ADR-0010).
 * The server is only a delivery service: everything here is public key
 * material, signatures and MLS ciphertext, never a key that can decrypt a
 * message and never message content. Binary values travel as standard
 * base64.
 */

const lowerUuid = z.uuid().transform((id) => id.toLowerCase());

/** How many bytes a padded base64 string decodes to. */
const decodedLength = (value: string) =>
  (value.length / 4) * 3 -
  (value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0);

/** Standard base64 of `minBytes` to `maxBytes` bytes. */
export function base64Bytes(maxBytes: number, minBytes = 1) {
  return z
    .string()
    .max(Math.ceil(maxBytes / 3) * 4)
    .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/)
    .refine((value) => {
      const length = decodedLength(value);
      return length >= minBytes && length <= maxBytes;
    }, `must be ${minBytes}–${maxBytes} bytes`);
}

/** An Ed25519 or X25519 public key. */
const publicKey = base64Bytes(32, 32);
/** An Ed25519 signature. */
const signature = base64Bytes(64, 64);

/**
 * The purposes Lånbort's own signatures are made for. Each signature is
 * made over the purpose's label followed by the body, so one made for one
 * purpose can never be replayed as another or as an MLS signature.
 */
export type ChatSignaturePurpose = "device-certificate" | "device-revocation";

export const chatSignatureLabel = (purpose: ChatSignaturePurpose) =>
  `Lanbort ${purpose} v1\0`;

/** What a device certificate's signature covers (keys in base64). */
export const deviceCertificateBody = (c: {
  accountId: string;
  deviceId: string;
  deviceKey: string;
  accountKey: string;
}) => JSON.stringify([c.accountId, c.deviceId, c.deviceKey, c.accountKey]);

/** What a device revocation's signature covers (keys in base64). */
export const deviceRevocationBody = (r: {
  accountId: string;
  deviceId: string;
  accountKey: string;
}) => JSON.stringify([r.accountId, r.deviceId, r.accountKey]);

/** «Device D with signature key K belongs to account A», signed by A's key. */
export const deviceCertificateSchema = z.strictObject({
  v: z.literal(1),
  accountId: lowerUuid,
  deviceId: lowerUuid,
  deviceKey: publicKey,
  accountKey: publicKey,
  signature,
});

/** «Device D no longer belongs to account A», signed by A's key. */
export const deviceRevocationSchema = z.strictObject({
  v: z.literal(1),
  accountId: lowerUuid,
  deviceId: lowerUuid,
  accountKey: publicKey,
  signature,
});

export const chatConversationIdSchema = z.uuid();
export const chatDeviceIdSchema = lowerUuid;

/**
 * The kinds of conversation. Each has its own rules for who may start it and
 * when it is open (`conversationKinds` on the server):
 * - `private`: ordinary private chat (PS-COM-004–006);
 * - `loan_logistics`: the narrow channel between a loan's parties while they
 *   are blocked (WP-44, PS-COM-007), only for short practical messages about
 *   that loan, open only while the server keeps its channel open.
 */
export const chatConversationKinds = ["private", "loan_logistics"] as const;
export const chatConversationKindSchema = z.enum(chatConversationKinds);

/** Upper bounds for what the delivery service stores (bytes). */
export const chatLimits = {
  keyPackageBytes: 4096,
  keyPackagesPerUpload: 20,
  /** Commits and welcomes grow with the group's devices. */
  handshakeBytes: 256 * 1024,
  addedPerCommit: 50,
  removalsPerCommit: 50,
  /**
   * The link package and the recovery backup carry the account's pinned
   * contact keys (at most 1000 of them, ADR-0010 §5, §8), so both have
   * room for that.
   */
  linkPackageBytes: 160 * 1024,
  inboxPageSize: 100,
  /**
   * Shorter messages are padded to this length before encryption, so their
   * size is not revealed (ADR-0010 §4). A loan logistics message must fit
   * in one such block (ADR-0010, WP-44).
   */
  paddedMessageBytes: 1024,
  /**
   * A history archive (ADR-0010 §5, §8): plaintext per part, and at most
   * this many parts. Each part's ciphertext is longer by its 16-byte tag.
   */
  archivePartBytes: 512 * 1024,
  archiveParts: 16,
  recoveryBackupBytes: 128 * 1024,
  /** More than anyone links; a restore revokes them in one request. */
  devicesPerAccount: 100,
} as const;

/** AES-GCM's tag on each archive part. */
const archiveTagBytes = 16;

/** A position in a device's inbox: the server's message order. */
export const chatPositionSchema = z.string().regex(/^[1-9]\d{0,18}$/);

// Account keys and devices

/**
 * The account's first device, or a reset (ADR-0010 §7–8): a new account key
 * and this session's device under it. The certificate is signed by the new
 * key, so the server never holds anything but the public half.
 */
export const registerChatAccountSchema = z.strictObject({
  accountKey: publicKey,
  certificate: deviceCertificateSchema,
});

export const chatDeviceRegisteredSchema = z.strictObject({
  deviceId: chatDeviceIdSchema,
});

/** A commitment to a link request's keys, under the secret on the screen. */
const linkCommitment = base64Bytes(32, 32);

/**
 * A new device asks to be linked (ADR-0010 §5): public halves, and a
 * commitment to them under the secret only its screen shows.
 */
export const requestChatLinkSchema = z.strictObject({
  deviceId: chatDeviceIdSchema,
  deviceKey: publicKey,
  /** The one-time HPKE key the package is sealed to. */
  linkKey: publicKey,
  commitment: linkCommitment,
});

export const chatLinkRequestSchema = z.strictObject({
  linkRequestId: z.uuid(),
  deviceId: chatDeviceIdSchema,
  deviceKey: publicKey,
  linkKey: publicKey,
  commitment: linkCommitment,
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
});

export const chatLinkRequestListSchema = z.strictObject({
  requests: z.array(chatLinkRequestSchema),
});

export const chatLinkRequestTargetSchema = z.strictObject({
  linkRequestId: z.uuid(),
});

/**
 * An existing device approves: it certifies the new device and seals the
 * account key (and optionally a history archive key) to the link key.
 */
export const approveChatLinkSchema = z.strictObject({
  linkRequestId: z.uuid(),
  certificate: deviceCertificateSchema,
  package: base64Bytes(chatLimits.linkPackageBytes),
});

/** The new device's view of its own request. */
export const chatLinkStatusSchema = z.strictObject({
  linkRequestId: z.uuid(),
  expiresAt: z.iso.datetime(),
  /** The sealed package once an existing device has approved. */
  package: base64Bytes(chatLimits.linkPackageBytes).nullable(),
  /**
   * An existing device declined it; it may ask again with a new code. False
   * in a stored answer from before declining existed, replayed on a retry.
   */
  declined: z.boolean().default(false),
});

// History archives

/**
 * An archive of a device's history: for a device being linked (ADR-0010
 * §5), or for the recovery key's backup (§8). Its key never goes to the
 * server.
 */
export const chatArchivePurposeSchema = z.enum(["link", "backup"]);

const archivePartCount = z.number().int().min(1).max(chatLimits.archiveParts);

/**
 * For the device whose link request is being approved, or for the recovery
 * key's backup.
 */
export const createChatArchiveSchema = z.discriminatedUnion("purpose", [
  z.strictObject({
    purpose: z.literal("link"),
    linkRequestId: z.uuid(),
    partCount: archivePartCount,
  }),
  z.strictObject({ purpose: z.literal("backup"), partCount: archivePartCount }),
]);

export type CreateChatArchive = z.infer<typeof createChatArchiveSchema>;

export const chatArchiveSchema = z.strictObject({
  archiveId: z.uuid(),
  expiresAt: z.iso.datetime(),
});

export const chatArchiveTargetSchema = z.strictObject({
  archiveId: z.uuid(),
});

export const chatArchivePartTargetSchema = z.strictObject({
  archiveId: z.uuid(),
  // A path segment in the API, so it arrives as text.
  part: z.coerce
    .number()
    .int()
    .min(0)
    .max(chatLimits.archiveParts - 1),
});

const archivePart = base64Bytes(
  chatLimits.archivePartBytes + archiveTagBytes,
  archiveTagBytes,
);

export const putChatArchivePartSchema = z.strictObject({
  ...chatArchivePartTargetSchema.shape,
  data: archivePart,
});

/** Whether every part is stored, so the archive can be read. */
export const chatArchiveProgressSchema = z.strictObject({
  complete: z.boolean(),
});

export const chatArchivePartSchema = z.strictObject({ data: archivePart });

export const revokeChatDeviceSchema = z.strictObject({
  revocation: deviceRevocationSchema,
});

export const chatDeviceSchema = z.strictObject({
  deviceId: chatDeviceIdSchema,
  certificate: deviceCertificateSchema,
  createdAt: z.iso.datetime(),
  revokedAt: z.iso.datetime().nullable(),
  /** Absent when the device went with a replaced account key. */
  revocation: deviceRevocationSchema.nullable(),
});

// The recovery key (ADR-0010 §8, PS-COM-019)

/** Public, derived from the key: which key a backup is under. */
const recoveryKeyId = base64Bytes(16, 16);
/** The account key and archive key under the key, with nonce and tag. */
const recoveryBackup = base64Bytes(chatLimits.recoveryBackupBytes, 29);

/** A new recovery key's first backup; the earlier key stops working. */
export const createChatRecoveryKeySchema = z.strictObject({
  keyId: recoveryKeyId,
  backup: recoveryBackup,
});

/** A newer backup under the same key, pointing to a complete archive. */
export const backUpChatHistorySchema = z.strictObject({
  keyId: recoveryKeyId,
  backup: recoveryBackup,
  archiveId: z.uuid(),
});

/** What a device without chat needs to restore it with the key. */
export const chatRecoveryBackupSchema = z.strictObject({
  keyId: recoveryKeyId,
  backup: recoveryBackup,
  archive: z
    .strictObject({
      archiveId: z.uuid(),
      parts: z.number().int().min(1).max(chatLimits.archiveParts),
    })
    .nullable(),
});

/**
 * Restoring with the key (R3): this session's device under the account
 * key, and a revocation of every other device, all signed with the account
 * key the backup held.
 */
export const restoreChatAccountSchema = z.strictObject({
  certificate: deviceCertificateSchema,
  revocations: z
    .array(deviceRevocationSchema)
    .max(chatLimits.devicesPerAccount),
});

/** «Ikke nå» to the offer, or an answer to the one reminder. */
export const answerChatRecoveryPromptSchema = z.strictObject({
  prompt: z.enum(["offer", "reminder"]),
});

/** «Mine enheter»: the account's devices and which one this session is. */
export const ownChatDevicesSchema = z.strictObject({
  accountKey: publicKey.nullable(),
  currentDeviceId: chatDeviceIdSchema.nullable(),
  devices: z.array(chatDeviceSchema),
  /** The recovery key, if there is one (PS-COM-019). */
  recovery: z
    .strictObject({
      createdAt: z.iso.datetime(),
      backedUpAt: z.iso.datetime(),
    })
    .nullable(),
  /** Said «Ikke nå», has no key, and has not answered the reminder. */
  recoveryReminder: z.boolean(),
});

export const publishChatKeyPackagesSchema = z.strictObject({
  keyPackages: z
    .array(base64Bytes(chatLimits.keyPackageBytes))
    .max(chatLimits.keyPackagesPerUpload),
  /** Used when the others run out; replaces the previous one. */
  lastResort: base64Bytes(chatLimits.keyPackageBytes).optional(),
});

export const chatKeyPackageStockSchema = z.strictObject({
  available: z.number().int().nonnegative(),
  lastResort: z.boolean(),
});

// Conversations

/**
 * The structured contact a non-friend's conversation is opened from
 * (PS-COM-006): the caller received it from the other person, and opening
 * the conversation is the caller's own choice.
 */
export const chatContextSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("loan_request"), requestId: z.uuid() }),
  z.strictObject({ kind: z.literal("object_question"), questionId: z.uuid() }),
]);

export const startChatConversationSchema = z.strictObject({
  userId: lowerUuid,
  context: chatContextSchema.optional(),
});

/**
 * Whether the caller can write to someone, asked with the context a page
 * shows them in (PS-COM-006, PS-COM-017): the conversation they have, or
 * whether they may start one. Someone blocked either way, gone or missing
 * has neither.
 */
export const chatContactSchema = z.strictObject({
  conversationId: chatConversationIdSchema.nullable(),
  canStart: z.boolean(),
});

export const chatConversationTargetSchema = z.strictObject({
  conversationId: chatConversationIdSchema,
});

/**
 * Mutes or unmutes notifications of new messages in one conversation, for
 * the caller only (PS-COM-018). Required notifications are never muted.
 */
export const muteChatConversationSchema = z.strictObject({
  conversationId: chatConversationIdSchema,
  muted: z.boolean(),
});

export const chatConversationStartedSchema = z.strictObject({
  conversationId: chatConversationIdSchema,
});

export const chatParticipantSchema = z.strictObject({
  userId: z.uuid(),
  /** Null once the account is deleted (PS-ADM-006). */
  realName: z.string().nullable(),
  ...personLinkShape,
});

export const chatConversationSchema = z.strictObject({
  conversationId: chatConversationIdSchema,
  kind: chatConversationKindSchema,
  /** The MLS group's generation: a new group after a restore (ADR-0010 §9). */
  generation: z.number().int().positive(),
  epoch: z.number().int().nonnegative(),
  /** Everyone in it but the caller. */
  others: z.array(chatParticipantSchema),
  /**
   * The loan a `loan_logistics` conversation is about, so it can be shown
   * as only for wrapping up that loan; null for private chat.
   */
  loanId: z.uuid().nullable(),
  /**
   * Messages are accepted. Private chat closes on a block or an inactive
   * account; loan logistics when its channel closes or an account is
   * inactive.
   */
  open: z.boolean(),
  /** This session's device is in the current group. */
  joined: z.boolean(),
  /** The caller's device has messages it has not fetched yet. */
  waiting: z.boolean(),
  /** The caller gets no notifications of its messages (PS-COM-018). */
  muted: z.boolean(),
  /**
   * When it was started: a device linked later shows that earlier messages
   * are on the devices that got them (13).
   */
  startedAt: z.iso.datetime(),
  lastActivityAt: z.iso.datetime(),
});

export const chatConversationListSchema = z.strictObject({
  conversations: z.array(chatConversationSchema),
});

/** The keys of everyone in a conversation, for the device to judge itself. */
export const chatDirectorySchema = z.strictObject({
  accounts: z.array(
    z.strictObject({
      userId: z.uuid(),
      accountKey: publicKey.nullable(),
      devices: z.array(chatDeviceSchema),
    }),
  ),
  /** The devices in the current group, as the server delivers to them. */
  members: z.array(chatDeviceIdSchema),
});

/** One unused key package for each participant device not yet in the group. */
export const chatClaimedKeyPackagesSchema = z.strictObject({
  keyPackages: z.array(
    z.strictObject({
      deviceId: chatDeviceIdSchema,
      keyPackage: base64Bytes(chatLimits.keyPackageBytes),
    }),
  ),
});

/**
 * A commit for the conversation's current epoch, with the devices it adds
 * and removes. The server accepts exactly one commit per epoch. One MLS
 * welcome serves every added device; it is required exactly when
 * `addedDeviceIds` is not empty.
 */
export const submitChatCommitSchema = z.strictObject({
  conversationId: chatConversationIdSchema,
  generation: z.number().int().positive(),
  commit: base64Bytes(chatLimits.handshakeBytes),
  welcome: base64Bytes(chatLimits.handshakeBytes).nullable(),
  addedDeviceIds: z.array(chatDeviceIdSchema).max(chatLimits.addedPerCommit),
  removedDeviceIds: z
    .array(chatDeviceIdSchema)
    .max(chatLimits.removalsPerCommit),
});

export const chatCommitAcceptedSchema = z.strictObject({
  generation: z.number().int().positive(),
  epoch: z.number().int().nonnegative(),
});

export const sendChatMessageSchema = z.strictObject({
  conversationId: chatConversationIdSchema,
  generation: z.number().int().positive(),
  ciphertext: base64Bytes(chatLimits.handshakeBytes),
});

export const chatMessageSentSchema = z.strictObject({
  /** Null when no other device was there to receive it. */
  position: chatPositionSchema.nullable(),
  sentAt: z.iso.datetime(),
});

/**
 * The oldest items still waiting for the device. Within a conversation they
 * come in the server's order; across conversations an item can show up
 * after a later one, so the device acknowledges exactly what it handled.
 */
export const chatInboxQuerySchema = z.strictObject({});

export const chatInboxItemSchema = z.strictObject({
  position: chatPositionSchema,
  conversationId: chatConversationIdSchema,
  generation: z.number().int().positive(),
  type: z.enum(["application", "commit", "welcome"]),
  ciphertext: z.string(),
  sentAt: z.iso.datetime(),
});

export const chatInboxSchema = z.strictObject({
  items: z.array(chatInboxItemSchema),
  more: z.boolean(),
});

/**
 * The device has handled these items, so the server may delete them. Never
 * shown to anyone: there are no read receipts (PS-COM-004).
 */
export const acknowledgeChatInboxSchema = z.strictObject({
  positions: z.array(chatPositionSchema).min(1).max(chatLimits.inboxPageSize),
});

export const chatAcknowledgedSchema = z.strictObject({
  acknowledged: z.number().int().nonnegative(),
});

export const chatDoneSchema = z.strictObject({});

export type DeviceCertificateWire = z.infer<typeof deviceCertificateSchema>;
export type DeviceRevocationWire = z.infer<typeof deviceRevocationSchema>;
export type ChatConversationKind = z.infer<typeof chatConversationKindSchema>;
export type ChatContext = z.infer<typeof chatContextSchema>;
export type ChatContact = z.infer<typeof chatContactSchema>;
export type ChatDevice = z.infer<typeof chatDeviceSchema>;
export type OwnChatDevices = z.infer<typeof ownChatDevicesSchema>;
export type ChatLinkRequest = z.infer<typeof chatLinkRequestSchema>;
export type ChatLinkStatus = z.infer<typeof chatLinkStatusSchema>;
export type ChatArchive = z.infer<typeof chatArchiveSchema>;
export type ChatArchivePurpose = z.infer<typeof chatArchivePurposeSchema>;
export type ChatRecoveryBackup = z.infer<typeof chatRecoveryBackupSchema>;
export type ChatConversation = z.infer<typeof chatConversationSchema>;
export type ChatConversationList = z.infer<typeof chatConversationListSchema>;
export type ChatDirectory = z.infer<typeof chatDirectorySchema>;
export type ChatInbox = z.infer<typeof chatInboxSchema>;
export type ChatInboxItem = z.infer<typeof chatInboxItemSchema>;
export type ChatClaimedKeyPackages = z.infer<
  typeof chatClaimedKeyPackagesSchema
>;
