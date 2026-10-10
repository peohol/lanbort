import {
  approveChatLinkSchema,
  chatDeviceRegisteredSchema,
  chatDoneSchema,
  chatLimits,
  chatKeyPackageStockSchema,
  chatLinkRequestListSchema,
  chatLinkRequestTargetSchema,
  chatLinkStatusSchema,
  type DeviceCertificateWire,
  type DeviceRevocationWire,
  ownChatDevicesSchema,
  publishChatKeyPackagesSchema,
  registerChatAccountSchema,
  requestChatLinkSchema,
  revokeChatDeviceSchema,
} from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import { type Kysely, sql, type Transaction } from "kysely";
import { z } from "zod";
import { rateLimits } from "../abuse/rate-limits";
import type { Actor, UserActor } from "../actor";
import { defineCommand } from "../commands/command";
import { defineQuery } from "../commands/query";
import { DomainError } from "../errors";
import type { EventRecorder } from "../events/recorder";
import { actingUserId } from "../objects/state";
import {
  chatAccountKeyCreated,
  chatAccountKeyReset,
  chatDeviceLinked,
  chatDeviceRevoked,
} from "./events";
import { readKeyPackage } from "./mls";
import { chatRetention, keyPackagesPerDevice } from "./model";
import {
  approveChatLinkPolicy,
  finishChatLinkPolicy,
  listChatLinkRequestsPolicy,
  publishChatKeyPackagesPolicy,
  readChatLinkStatusPolicy,
  readOwnChatDevicesPolicy,
  registerChatAccountPolicy,
  requestChatLinkPolicy,
  resetChatAccountPolicy,
  revokeChatDevicePolicy,
} from "./policies";
import {
  certificateIsSigned,
  fromBase64,
  revocationIsSigned,
  toBase64,
} from "./signatures";
import {
  currentAccountKey,
  devicesOf,
  loadDevice,
  lockChatAccount,
  presentDevice,
  sessionDevice,
  shutOut,
} from "./store";

type Tx = Transaction<Database>;

export const sessionOf = (actor: Actor) =>
  (actor as UserActor).authentication.sessionId;

function conflict(message: string): never {
  throw new DomainError("conflict", message);
}

function invalid(field: string): never {
  throw new DomainError("invalid_input", `Invalid ${field}`, [field]);
}

/**
 * A certificate the caller's account key made for exactly this device
 * (ADR-0010 §3). The server checks it as defence in depth; every client
 * checks it again against the key it has pinned.
 */
export function checkCertificate(
  certificate: DeviceCertificateWire,
  expected: {
    userId: string;
    accountKey: Uint8Array;
    deviceId?: string;
    deviceKey?: Uint8Array;
  },
): void {
  if (
    certificate.accountId !== expected.userId ||
    certificate.accountKey !== toBase64(expected.accountKey) ||
    (expected.deviceId !== undefined &&
      certificate.deviceId !== expected.deviceId) ||
    (expected.deviceKey !== undefined &&
      certificate.deviceKey !== toBase64(expected.deviceKey)) ||
    !certificateIsSigned(certificate)
  ) {
    invalid("certificate");
  }
}

export async function deviceIdTaken(
  tx: Tx,
  deviceId: string,
): Promise<boolean> {
  const [device, request] = await Promise.all([
    tx
      .selectFrom("app.chat_devices")
      .select("id")
      .where("id", "=", deviceId)
      .executeTakeFirst(),
    tx
      .selectFrom("app.chat_link_requests")
      .select("id")
      .where("device_id", "=", deviceId)
      .executeTakeFirst(),
  ]);

  return device !== undefined || request !== undefined;
}

export async function insertDevice(
  tx: Tx,
  certificate: DeviceCertificateWire,
  accountKeyId: string,
  sessionId: string,
): Promise<void> {
  await tx
    .insertInto("app.chat_devices")
    .values({
      id: certificate.deviceId,
      user_id: certificate.accountId,
      account_key_id: accountKeyId,
      session_id: sessionId,
      device_key: fromBase64(certificate.deviceKey),
      certificate_signature: fromBase64(certificate.signature),
    })
    .execute();
}

/**
 * A new account key with this session's device under it: the account's
 * first device, or a reset that shuts out every device under the previous
 * key (ADR-0010 §8). The key's private half never reaches the server.
 */
async function registerAccount(
  args: {
    tx: Tx;
    actor: Actor;
    input: z.infer<typeof registerChatAccountSchema>;
    events: EventRecorder;
    now: Date;
  },
  mode: "first" | "reset",
) {
  const { tx, actor, input, events, now } = args;
  const userId = actingUserId(actor);
  await lockChatAccount(tx, userId);
  const previous = await currentAccountKey(tx, userId);

  if (mode === "first" && previous) {
    conflict("The account already has a chat key; link this device instead");
  }

  if (mode === "reset" && !previous) {
    conflict("The account has no chat key to reset");
  }

  const accountKey = fromBase64(input.accountKey);
  checkCertificate(input.certificate, { userId, accountKey });

  if (previous && Buffer.from(previous.publicKey).equals(accountKey)) {
    conflict("A reset needs a new account key");
  }

  if (await deviceIdTaken(tx, input.certificate.deviceId)) {
    conflict("The device id is taken");
  }

  if (previous) {
    const live = (await devicesOf(tx, [userId]))
      .filter((device) => device.revokedAt === null)
      .map((device) => device.id);
    await shutOut(tx, live, now);
    await tx
      .updateTable("app.chat_account_keys")
      .set({ replaced_at: now })
      .where("id", "=", previous.id)
      .execute();
  }

  // A new identity starts with no pending link to an old one, and no
  // backup of it: the recovery key held the old account key.
  for (const table of [
    "app.chat_link_requests",
    "app.chat_recovery_keys",
    "app.chat_archives",
  ] as const) {
    await tx.deleteFrom(table).where("user_id", "=", userId).execute();
  }

  const { id: accountKeyId } = await tx
    .insertInto("app.chat_account_keys")
    .values({ user_id: userId, public_key: accountKey, created_at: now })
    .returning("id")
    .executeTakeFirstOrThrow();
  await insertDevice(tx, input.certificate, accountKeyId, sessionOf(actor));

  if (previous) {
    events.record(chatAccountKeyReset, {
      resourceId: input.certificate.deviceId,
      payload: { previousAccountKeyId: previous.id },
    });
  } else {
    events.record(chatAccountKeyCreated, {
      resourceId: input.certificate.deviceId,
      payload: {},
    });
  }

  return { deviceId: input.certificate.deviceId };
}

/** The account's first chat device, in this session (ADR-0010 §3). */
export const registerChatAccount = defineCommand({
  name: "chat.register_account",
  input: registerChatAccountSchema,
  output: chatDeviceRegisteredSchema,
  policy: registerChatAccountPolicy,
  rateLimit: rateLimits.chatKeys,
  idempotency: "required",
  load: async () => ({ resource: undefined, context: undefined }),
  execute: (args) => registerAccount(args, "first"),
});

/**
 * Tilbakestilling (ADR-0010 §8): when every device and the recovery key are
 * lost. Contacts are told the security code changed; old history is gone.
 */
export const resetChatAccount = defineCommand({
  name: "chat.reset_account",
  input: registerChatAccountSchema,
  output: chatDeviceRegisteredSchema,
  policy: resetChatAccountPolicy,
  rateLimit: rateLimits.chatResets,
  idempotency: "required",
  load: async () => ({ resource: undefined, context: undefined }),
  execute: (args) => registerAccount(args, "reset"),
});

interface LinkRequestRow {
  id: string;
  user_id: string;
  session_id: string;
  device_id: string;
  device_key: Buffer;
  link_key: Buffer;
  commitment: Buffer | null;
  created_at: Date;
  expires_at: Date;
  approved_at: Date | null;
  package: Buffer | null;
}

const linkRequestColumns = [
  "id",
  "user_id",
  "session_id",
  "device_id",
  "device_key",
  "link_key",
  "commitment",
  "created_at",
  "expires_at",
  "approved_at",
  "package",
] as const;

async function loadLinkRequest(
  tx: Tx,
  linkRequestId: string,
  options: { lock?: boolean } = {},
): Promise<LinkRequestRow | undefined> {
  let query = tx
    .selectFrom("app.chat_link_requests")
    .select(linkRequestColumns)
    .where("id", "=", linkRequestId);

  if (options.lock) {
    query = query.forUpdate();
  }

  return query.executeTakeFirst();
}

/** The new device's own request: this account and this very session. */
const ownSessionRequest = (
  request: LinkRequestRow | undefined,
  actor: Actor,
): request is LinkRequestRow =>
  request !== undefined &&
  actor.kind === "user" &&
  request.user_id === actor.userId &&
  request.session_id === actor.authentication.sessionId;

const linkStatus = (request: LinkRequestRow) => ({
  linkRequestId: request.id,
  expiresAt: request.expires_at.toISOString(),
  package: request.package ? toBase64(request.package) : null,
});

/**
 * A new device asks to be linked (ADR-0010 §5). It shows its keys to an
 * existing device on the screen; the server only passes the sealed package
 * on. The request is short-lived and replaces the session's earlier one.
 */
export const requestChatLink = defineCommand({
  name: "chat.request_link",
  input: requestChatLinkSchema,
  output: chatLinkStatusSchema,
  policy: requestChatLinkPolicy,
  rateLimit: rateLimits.chatKeys,
  idempotency: "required",
  load: async () => ({ resource: undefined, context: undefined }),
  execute: async ({ tx, actor, input, now }) => {
    const userId = actingUserId(actor);
    await lockChatAccount(tx, userId);

    if (await sessionDevice(tx, actor)) {
      conflict("This session already has a chat device");
    }

    if (!(await currentAccountKey(tx, userId))) {
      conflict("The account has no chat device to link to");
    }

    await tx
      .deleteFrom("app.chat_link_requests")
      .where("session_id", "=", sessionOf(actor))
      .execute();

    if (await deviceIdTaken(tx, input.deviceId)) {
      conflict("The device id is taken");
    }

    const request = await tx
      .insertInto("app.chat_link_requests")
      .values({
        user_id: userId,
        session_id: sessionOf(actor),
        device_id: input.deviceId,
        device_key: fromBase64(input.deviceKey),
        link_key: fromBase64(input.linkKey),
        commitment: fromBase64(input.commitment),
        created_at: now,
        expires_at: new Date(now.getTime() + chatRetention.linkRequestMs),
      })
      .returning(linkRequestColumns)
      .executeTakeFirstOrThrow();

    return linkStatus(request);
  },
});

/** The new device waits for its package. */
export const readChatLinkStatus = defineQuery({
  name: "chat.read_link_status",
  input: chatLinkRequestTargetSchema,
  policy: readChatLinkStatusPolicy,
  load: async ({ db, actor, input, now }) => {
    const request = await db
      .selectFrom("app.chat_link_requests")
      .select(linkRequestColumns)
      .where("id", "=", input.linkRequestId)
      .executeTakeFirst();
    const own = ownSessionRequest(request, actor) && request.expires_at > now;

    return {
      resource: { hasDevice: false, own, request: own ? request : null },
      context: undefined,
    };
  },
  present: ({ resource }) => linkStatus(resource.request!),
});

/** The new device has its package: the request is gone for good. */
export const finishChatLink = defineCommand({
  name: "chat.finish_link",
  input: chatLinkRequestTargetSchema,
  output: chatDoneSchema,
  policy: finishChatLinkPolicy,
  idempotency: "required",
  load: async ({ tx, actor, input }) => ({
    resource: {
      hasDevice: false,
      own: ownSessionRequest(
        await loadLinkRequest(tx, input.linkRequestId, { lock: true }),
        actor,
      ),
    },
    context: undefined,
  }),
  execute: async ({ tx, input }) => {
    await tx
      .deleteFrom("app.chat_link_requests")
      .where("id", "=", input.linkRequestId)
      .execute();

    return {};
  },
});

/** An existing device sees the account's requests that wait for approval. */
export const listChatLinkRequests = defineQuery({
  name: "chat.list_link_requests",
  input: z.strictObject({}),
  policy: listChatLinkRequestsPolicy,
  load: async ({ db, actor, now }) => {
    const device = await sessionDevice(db, actor);
    const requests = device
      ? await db
          .selectFrom("app.chat_link_requests")
          .select(linkRequestColumns)
          .where("user_id", "=", device.userId)
          .where("approved_at", "is", null)
          .where("expires_at", ">", now)
          // One from before commitments cannot be matched; it just expires.
          .where("commitment", "is not", null)
          .orderBy("created_at")
          .execute()
      : [];

    return {
      resource: { hasDevice: device !== null, requests },
      context: undefined,
    };
  },
  present: ({ resource }) =>
    chatLinkRequestListSchema.parse({
      requests: resource.requests.map((request) => ({
        linkRequestId: request.id,
        deviceId: request.device_id,
        deviceKey: toBase64(request.device_key),
        linkKey: toBase64(request.link_key),
        commitment: toBase64(request.commitment!),
        createdAt: request.created_at.toISOString(),
        expiresAt: request.expires_at.toISOString(),
      })),
    }),
});

/**
 * An existing device approves after the user compared the code on both
 * screens: it certifies the new device under the account key and seals the
 * account key to the new device's link key. The new device is bound to its
 * own session; it sees only what is sent from now on (ADR-0010 §5).
 */
export const approveChatLink = defineCommand({
  name: "chat.approve_link",
  input: approveChatLinkSchema,
  output: chatDeviceRegisteredSchema,
  policy: approveChatLinkPolicy,
  rateLimit: rateLimits.chatKeys,
  idempotency: "required",
  load: async ({ tx, actor, input, now }) => {
    const userId = actingUserId(actor);
    await lockChatAccount(tx, userId);
    const device = await sessionDevice(tx, actor, { lock: true });
    const request = await loadLinkRequest(tx, input.linkRequestId, {
      lock: true,
    });

    return {
      resource: {
        hasDevice: device !== null,
        own:
          request !== undefined &&
          request.user_id === userId &&
          request.approved_at === null &&
          request.expires_at > now,
        device,
        request,
      },
      context: undefined,
    };
  },
  execute: async ({ tx, input, resource, events, now }) => {
    const approver = resource.device!;
    const request = resource.request!;
    checkCertificate(input.certificate, {
      userId: approver.userId,
      accountKey: approver.accountKey,
      deviceId: request.device_id,
      deviceKey: request.device_key,
    });

    if (
      await tx
        .selectFrom("app.chat_devices")
        .select("id")
        .where("id", "=", request.device_id)
        .executeTakeFirst()
    ) {
      conflict("The device id is taken");
    }

    // A restore revokes every other device in one request (ADR-0010 §8).
    const live = (await devicesOf(tx, [approver.userId])).filter(
      (device) => device.revokedAt === null,
    );

    if (live.length >= chatLimits.devicesPerAccount) {
      conflict("The account has as many devices as it can have");
    }

    await insertDevice(
      tx,
      input.certificate,
      approver.accountKeyId,
      request.session_id,
    );
    await tx
      .updateTable("app.chat_link_requests")
      .set({ approved_at: now, package: fromBase64(input.package) })
      .where("id", "=", request.id)
      .execute();

    events.record(chatDeviceLinked, {
      resourceId: request.device_id,
      payload: { approvedByDeviceId: approver.id },
    });

    return { deviceId: request.device_id };
  },
});

/** A revocation of `target` its own account key signed. */
export const revokes = (
  revocation: DeviceRevocationWire,
  target: { id: string; userId: string; accountKey: Uint8Array },
) =>
  revocation.deviceId === target.id &&
  revocation.accountId === target.userId &&
  revocation.accountKey === toBase64(target.accountKey) &&
  revocationIsSigned(revocation);

/**
 * Shuts one of the account's devices out with a revocation its account key
 * signed (ADR-0010 §7): the lost device, or this one at sign-out. The server
 * stops delivering to it and accepting from it at once and ends its
 * sign-in session; the clients remove it from every group.
 */
export const revokeChatDevice = defineCommand({
  name: "chat.revoke_device",
  input: revokeChatDeviceSchema,
  output: chatDoneSchema,
  policy: revokeChatDevicePolicy,
  rateLimit: rateLimits.chatKeys,
  idempotency: "required",
  load: async ({ tx, actor, input }) => {
    const userId = actingUserId(actor);
    await lockChatAccount(tx, userId);
    const device = await sessionDevice(tx, actor, { lock: true });
    const target = await loadDevice(tx, input.revocation.deviceId, {
      lock: true,
    });

    return {
      resource: {
        hasDevice: device !== null,
        own: target?.userId === userId && target.revokedAt === null,
        target,
      },
      context: undefined,
    };
  },
  execute: async ({ tx, input, resource, events, now }) => {
    const target = resource.target!;
    const { revocation } = input;

    if (!revokes(revocation, target)) {
      invalid("revocation");
    }

    await shutOut(tx, [target.id], now, fromBase64(revocation.signature));
    events.record(chatDeviceRevoked, { resourceId: target.id, payload: {} });

    return {};
  },
});

/**
 * «Mine enheter»: the account key, its devices, this session's device and
 * the recovery key, if there is one.
 */
export const readOwnChatDevices = defineQuery({
  name: "chat.read_own_devices",
  input: z.strictObject({}),
  policy: readOwnChatDevicesPolicy,
  load: async ({ db, actor }) => {
    const userId = actingUserId(actor);
    const [accountKey, devices, current, recovery, prompt] = await Promise.all([
      currentAccountKey(db, userId),
      devicesOf(db, [userId]),
      sessionDevice(db, actor),
      db
        .selectFrom("app.chat_recovery_keys")
        .select(["created_at", "backed_up_at"])
        .where("user_id", "=", userId)
        .executeTakeFirst(),
      db
        .selectFrom("app.chat_recovery_prompts")
        .select(["declined_at", "reminded_at"])
        .where("user_id", "=", userId)
        .executeTakeFirst(),
    ]);

    return {
      resource: { accountKey, devices, current, recovery, prompt },
      context: undefined,
    };
  },
  present: ({ resource: { recovery, prompt, ...resource } }) =>
    ownChatDevicesSchema.parse({
      accountKey: resource.accountKey
        ? toBase64(resource.accountKey.publicKey)
        : null,
      currentDeviceId: resource.current?.id ?? null,
      devices: resource.devices.map(presentDevice),
      recovery: recovery
        ? {
            createdAt: recovery.created_at.toISOString(),
            backedUpAt: recovery.backed_up_at.toISOString(),
          }
        : null,
      // PS-COM-019: one reminder, only for someone who said «Ikke nå».
      recoveryReminder:
        !recovery && prompt?.declined_at != null && prompt.reminded_at === null,
    }),
});

/**
 * The device publishes one-time key packages so others can add it to
 * conversations, and one last-resort package that is never used up
 * (ADR-0010 §6). Only packages the device made for itself are kept. An
 * empty upload just reports how many are left.
 */
export const publishChatKeyPackages = defineCommand({
  name: "chat.publish_key_packages",
  input: publishChatKeyPackagesSchema,
  output: chatKeyPackageStockSchema,
  policy: publishChatKeyPackagesPolicy,
  rateLimit: rateLimits.chatKeys,
  idempotency: "required",
  load: async ({ tx, actor }) => {
    const device = await sessionDevice(tx, actor, { lock: true });

    return {
      resource: { hasDevice: device !== null, device },
      context: undefined,
    };
  },
  execute: async ({ tx, input, resource, now }) => {
    const device = resource.device!;
    const expiresAt = new Date(now.getTime() + chatRetention.keyPackageMs);
    const ownPackage = (encoded: string, field: string) => {
      const bytes = fromBase64(encoded);
      let identity: unknown;

      try {
        const parsed = readKeyPackage(bytes);
        identity = {
          signatureKey: toBase64(parsed.signatureKey),
          certificate: JSON.parse(new TextDecoder().decode(parsed.identity)),
        };
      } catch {
        invalid(field);
      }

      const { signatureKey, certificate } = identity as {
        signatureKey: string;
        certificate: Partial<DeviceCertificateWire> | null;
      };

      if (
        signatureKey !== toBase64(device.deviceKey) ||
        certificate?.deviceId !== device.id ||
        certificate.accountId !== device.userId
      ) {
        invalid(field);
      }

      return bytes;
    };

    const packages = input.keyPackages.map((p) => ownPackage(p, "keyPackages"));
    const lastResort =
      input.lastResort === undefined
        ? undefined
        : ownPackage(input.lastResort, "lastResort");

    await tx
      .deleteFrom("app.chat_key_packages")
      .where("device_id", "=", device.id)
      .where("expires_at", "<=", now)
      .execute();

    if (lastResort) {
      await tx
        .deleteFrom("app.chat_key_packages")
        .where("device_id", "=", device.id)
        .where("last_resort", "=", true)
        .execute();
      await tx
        .insertInto("app.chat_key_packages")
        .values({
          device_id: device.id,
          key_package: lastResort,
          last_resort: true,
          created_at: now,
          expires_at: expiresAt,
        })
        .execute();
    }

    if (packages.length > 0) {
      await tx
        .insertInto("app.chat_key_packages")
        .values(
          packages.map((key_package) => ({
            device_id: device.id,
            key_package,
            created_at: now,
            expires_at: expiresAt,
          })),
        )
        .execute();
    }

    const stock = await tx
      .selectFrom("app.chat_key_packages")
      .select(({ fn }) => [
        fn
          .countAll<string>()
          .filterWhere("last_resort", "=", false)
          .as("available"),
        fn
          .countAll<string>()
          .filterWhere("last_resort", "=", true)
          .as("lastResort"),
      ])
      .where("device_id", "=", device.id)
      .executeTakeFirstOrThrow();

    if (Number(stock.available) > keyPackagesPerDevice) {
      conflict("Too many unused key packages");
    }

    return {
      available: Number(stock.available),
      lastResort: Number(stock.lastResort) > 0,
    };
  },
});

/**
 * A re-authentication gives the browser a new sign-in session (WP-12). The
 * old session's chat device and pending link request go with it, and the
 * old session ends. Otherwise the device would stay in every group, bound
 * to a session nothing uses any more, while the browser lost its chat
 * (ADR-0010 §5, §7). Call it only once the new session is known to be the
 * same user's.
 */
export async function renewChatSession(
  db: Kysely<Database>,
  userId: string,
  from: string,
  to: string,
): Promise<void> {
  if (from === to) {
    return;
  }

  await db.transaction().execute(async (tx) => {
    await tx
      .updateTable("app.chat_devices")
      .set({ session_id: to })
      .where("user_id", "=", userId)
      .where("session_id", "=", from)
      .where("revoked_at", "is", null)
      .execute();
    await tx
      .updateTable("app.chat_link_requests")
      .set({ session_id: to })
      .where("user_id", "=", userId)
      .where("session_id", "=", from)
      .execute();
    await sql`select app.end_auth_sessions(${[from]}::text[])`.execute(tx);
  });
}
