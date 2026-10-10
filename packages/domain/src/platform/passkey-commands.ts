import {
  beginPasskeyRegistrationSchema,
  emailAddressSchema,
  finishPasskeyConfirmationSchema,
  finishPasskeyRegistrationSchema,
  passkeyCeremonySchema,
  stewardPasskeysSchema,
} from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import type { Transaction } from "kysely";
import { z } from "zod";
import type { Actor, AccountStatus, UserActor } from "../actor";
import { rateLimits } from "../abuse/rate-limits";
import { defineCommand } from "../commands/command";
import { defineQuery } from "../commands/query";
import { DomainError } from "../errors";
import type { EventRecorder } from "../events/recorder";
import {
  stewardEnrollmentCodeIssued,
  stewardPasskeyAdded,
  stewardPasskeyConfirmed,
  stewardPasskeyRemoved,
} from "./events";
import {
  activePasskeys,
  enrollmentCodeHash,
  enrollmentCodeTtlMs,
  maximumStewardPasskeys,
  minimumStewardPasskeys,
  newChallenge,
  newEnrollmentCode,
  passkeyChallengeTtlMs,
  passkeyMethod,
  type PasskeyCeremonies,
  toStoredCredential,
  userHandle,
} from "./passkeys";
import {
  beginPasskeyConfirmationPolicy,
  beginPasskeyRegistrationPolicy,
  finishPasskeyConfirmationPolicy,
  finishPasskeyRegistrationPolicy,
  issueEnrollmentCodePolicy,
  listOwnPasskeysPolicy,
  type PasskeyEnrollmentResource,
  removePasskeyPolicy,
  resetStewardPasskeysPolicy,
  type StewardTarget,
} from "./policies";

type Tx = Transaction<Database>;

/** Only signed-in stewards reach these commands (their policies say so). */
function steward(actor: Actor): UserActor {
  if (actor.kind !== "user") {
    throw new Error("Passkey commands are for signed-in users");
  }

  return actor;
}

function invalid(field: string, message: string): never {
  throw new DomainError("invalid_input", message, [field]);
}

/** The open enrollment code the user typed, or null when it is not theirs. */
async function openEnrollmentCode(
  tx: Tx,
  userId: string,
  code: string,
  now: Date,
) {
  const row = await tx
    .selectFrom("app.steward_enrollment_codes")
    .select("id")
    .where("user_id", "=", userId)
    .where("code_hash", "=", enrollmentCodeHash(code))
    .where("used_at", "is", null)
    .where("voided_at", "is", null)
    .where("expires_at", ">", now)
    .forUpdate()
    .executeTakeFirst();

  return row?.id ?? null;
}

/** A ceremony this session started and has not finished, locked. */
async function openChallenge(
  tx: Tx,
  actor: UserActor,
  challengeId: string,
  purpose: "registration" | "confirmation",
  now: Date,
) {
  return tx
    .selectFrom("app.steward_passkey_challenges")
    .select(["id", "challenge", "enrollment_code_id"])
    .where("id", "=", challengeId)
    .where("user_id", "=", actor.userId)
    .where("session_id", "=", actor.authentication.sessionId)
    .where("purpose", "=", purpose)
    .where("completed_at", "is", null)
    .where("expires_at", ">", now)
    .forUpdate()
    .executeTakeFirst();
}

async function insertChallenge(
  tx: Tx,
  actor: UserActor,
  purpose: "registration" | "confirmation",
  now: Date,
  enrollmentCodeId: string | null = null,
) {
  const challenge = newChallenge();
  const { id } = await tx
    .insertInto("app.steward_passkey_challenges")
    .values({
      user_id: actor.userId,
      session_id: actor.authentication.sessionId,
      purpose,
      challenge,
      enrollment_code_id: enrollmentCodeId,
      created_at: now,
      expires_at: new Date(now.getTime() + passkeyChallengeTtlMs),
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  return { id, challenge };
}

async function countActive(tx: Tx, userId: string) {
  return (await activePasskeys(tx, userId).execute()).length;
}

const ceremonyOutput = passkeyCeremonySchema;

/**
 * The passkey commands, with the WebAuthn ceremonies of this deployment
 * (`packages/auth`), whose relying party comes from server configuration.
 */
export function stewardPasskeyCommands(ceremonies: PasskeyCeremonies) {
  /**
   * Starts adding a passkey, vouched for by an enrollment code from the
   * operational command or by a recent confirmation with another passkey.
   * The code is bound to the ceremony and used up only when it succeeds.
   */
  const beginRegistration = defineCommand({
    name: "steward_passkey.begin_registration",
    input: beginPasskeyRegistrationSchema,
    output: ceremonyOutput,
    policy: beginPasskeyRegistrationPolicy,
    idempotency: "none",
    rateLimit: rateLimits.passkeys,
    load: async ({ tx, actor, input, now }) => {
      const user = steward(actor);
      let codeId: string | null = null;

      if (input.enrollmentCode !== undefined) {
        codeId = await openEnrollmentCode(
          tx,
          user.userId,
          input.enrollmentCode,
          now,
        );

        if (!codeId) {
          invalid("enrollmentCode", "Not an open code for this account");
        }
      }

      const resource: PasskeyEnrollmentResource = {
        vouchedBy: codeId ? "enrollment_code" : "session",
      };

      return { resource, context: codeId };
    },
    execute: async ({ tx, actor, context: codeId, now }) => {
      const user = steward(actor);
      const existing = (await activePasskeys(tx, user.userId).execute()).map(
        toStoredCredential,
      );

      if (existing.length >= maximumStewardPasskeys) {
        throw new DomainError("conflict", "No more passkeys");
      }

      const email = await tx
        .selectFrom("app.verified_contacts")
        .select("address")
        .where("user_id", "=", user.userId)
        .where("kind", "=", "email")
        .executeTakeFirst();
      const { id, challenge } = await insertChallenge(
        tx,
        user,
        "registration",
        now,
        codeId,
      );

      return {
        challengeId: id,
        options: await ceremonies.registrationOptions({
          challenge,
          userHandle: userHandle(user.userId),
          userName: email?.address ?? "Lånbort",
          existing,
        }),
      };
    },
  });

  /**
   * Verifies the new passkey and records it, with its audit event, before
   * it counts. Its registration also confirms the session, so a steward can
   * add their second passkey right after the first.
   */
  const finishRegistration = defineCommand({
    name: "steward_passkey.finish_registration",
    input: finishPasskeyRegistrationSchema,
    output: z.strictObject({ passkeyId: z.uuid() }),
    policy: finishPasskeyRegistrationPolicy,
    idempotency: "none",
    rateLimit: rateLimits.passkeys,
    load: async ({ tx, actor, input, now }) => {
      const challenge = await openChallenge(
        tx,
        steward(actor),
        input.challengeId,
        "registration",
        now,
      );

      if (!challenge) {
        return null;
      }

      let vouchedBy: PasskeyEnrollmentResource["vouchedBy"] = "session";

      if (challenge.enrollment_code_id) {
        const code = await tx
          .selectFrom("app.steward_enrollment_codes")
          .select("id")
          .where("id", "=", challenge.enrollment_code_id)
          .where("used_at", "is", null)
          .where("voided_at", "is", null)
          .where("expires_at", ">", now)
          .forUpdate()
          .executeTakeFirst();
        vouchedBy = code ? "enrollment_code" : "lapsed_code";
      }

      return { resource: { vouchedBy }, context: challenge };
    },
    execute: async ({ tx, actor, input, context: challenge, events, now }) => {
      const user = steward(actor);
      const credential = await ceremonies.verifyRegistration({
        response: input.response,
        challenge: challenge.challenge,
      });

      if (!credential) {
        invalid("response", "The passkey could not be verified");
      }

      if ((await countActive(tx, user.userId)) >= maximumStewardPasskeys) {
        throw new DomainError("conflict", "No more passkeys");
      }

      const taken = await tx
        .selectFrom("app.steward_passkeys")
        .select("id")
        .where("credential_id", "=", Buffer.from(credential.id))
        .executeTakeFirst();

      if (taken) {
        throw new DomainError("conflict", "The passkey is already registered");
      }

      const enrolledWith = challenge.enrollment_code_id
        ? "enrollment_code"
        : "passkey";
      const { id: passkeyId } = await tx
        .insertInto("app.steward_passkeys")
        .values({
          user_id: user.userId,
          credential_id: Buffer.from(credential.id),
          public_key: Buffer.from(credential.publicKey),
          sign_count: credential.signCount,
          transports: [...credential.transports],
          name: input.name,
          enrolled_with: enrolledWith,
          created_at: now,
          last_used_at: now,
        })
        .returning("id")
        .executeTakeFirstOrThrow();

      if (challenge.enrollment_code_id) {
        await tx
          .updateTable("app.steward_enrollment_codes")
          .set({ used_at: now })
          .where("id", "=", challenge.enrollment_code_id)
          .execute();
      }

      await tx
        .updateTable("app.steward_passkey_challenges")
        .set({ completed_at: now, passkey_id: passkeyId })
        .where("id", "=", challenge.id)
        .execute();

      events.record(stewardPasskeyAdded, {
        resourceId: user.userId,
        payload: { passkeyId, enrolledWith },
      });

      return { passkeyId };
    },
  });

  /** Starts confirming this session with one of the steward's passkeys. */
  const beginConfirmation = defineCommand({
    name: "steward_passkey.begin_confirmation",
    input: z.strictObject({}),
    output: ceremonyOutput,
    policy: beginPasskeyConfirmationPolicy,
    idempotency: "none",
    rateLimit: rateLimits.passkeys,
    load: async ({ tx, actor }) => {
      const passkeys = (
        await activePasskeys(tx, steward(actor).userId).execute()
      ).map(toStoredCredential);

      return {
        resource: { activeCount: passkeys.length },
        context: passkeys,
      };
    },
    execute: async ({ tx, actor, context: passkeys, now }) => {
      const { id, challenge } = await insertChallenge(
        tx,
        steward(actor),
        "confirmation",
        now,
      );

      return {
        challengeId: id,
        options: await ceremonies.confirmationOptions({
          challenge,
          allowed: passkeys,
        }),
      };
    },
  });

  /**
   * Verifies the answer with the passkey it names, which must be one of the
   * steward's own that still counts, and confirms the session.
   */
  const finishConfirmation = defineCommand({
    name: "steward_passkey.finish_confirmation",
    input: finishPasskeyConfirmationSchema,
    output: z.strictObject({ confirmedAt: z.iso.datetime() }),
    policy: finishPasskeyConfirmationPolicy,
    idempotency: "none",
    rateLimit: rateLimits.passkeys,
    load: async ({ tx, actor, input, now }) => {
      const challenge = await openChallenge(
        tx,
        steward(actor),
        input.challengeId,
        "confirmation",
        now,
      );

      return challenge ? { resource: undefined, context: challenge } : null;
    },
    execute: async ({ tx, actor, input, context: challenge, events, now }) => {
      const user = steward(actor);
      const credentialId = ceremonies.credentialIdOf(input.response);
      const passkey = credentialId
        ? await activePasskeys(tx, user.userId)
            .where("credential_id", "=", Buffer.from(credentialId))
            .forUpdate()
            .executeTakeFirst()
        : undefined;

      if (!passkey) {
        invalid("response", "Not one of the steward's passkeys");
      }

      const verified = await ceremonies.verifyConfirmation({
        response: input.response,
        challenge: challenge.challenge,
        credential: toStoredCredential(passkey),
      });

      if (!verified) {
        invalid("response", "The passkey could not be verified");
      }

      await tx
        .updateTable("app.steward_passkeys")
        .set({
          sign_count: Math.max(verified.signCount, Number(passkey.sign_count)),
          last_used_at: now,
        })
        .where("id", "=", passkey.id)
        .execute();
      await tx
        .updateTable("app.steward_passkey_challenges")
        .set({ completed_at: now, passkey_id: passkey.id })
        .where("id", "=", challenge.id)
        .execute();

      events.record(stewardPasskeyConfirmed, {
        resourceId: user.userId,
        payload: { passkeyId: passkey.id },
      });

      return { confirmedAt: now.toISOString() };
    },
  });

  return {
    beginRegistration,
    finishRegistration,
    beginConfirmation,
    finishConfirmation,
  };
}

export type StewardPasskeyCommands = ReturnType<typeof stewardPasskeyCommands>;

/** One of the steward's own passkeys that counts, with how many there are. */
async function loadOwnPasskey(tx: Tx, actor: Actor, passkeyId: string) {
  const user = steward(actor);
  const passkeys = await activePasskeys(tx, user.userId).forUpdate().execute();

  return passkeys.some((passkey) => passkey.id === passkeyId)
    ? { resource: { activeCount: passkeys.length }, context: undefined }
    : null;
}

/**
 * Removes a passkey that is lost or no longer wanted, after a fresh
 * confirmation; a steward with fewer than two loses stronger access until
 * they add another.
 */
export const removeStewardPasskey = defineCommand({
  name: "steward_passkey.remove",
  input: z.strictObject({ passkeyId: z.uuid() }),
  output: z.strictObject({ passkeyId: z.uuid() }),
  policy: removePasskeyPolicy,
  idempotency: "required",
  rateLimit: rateLimits.passkeys,
  load: ({ tx, actor, input }) => loadOwnPasskey(tx, actor, input.passkeyId),
  execute: async ({ tx, actor, input, events, now }) => {
    const user = steward(actor);

    await tx
      .updateTable("app.steward_passkeys")
      .set({ removed_at: now, removed_by_user_id: user.userId })
      .where("id", "=", input.passkeyId)
      .execute();

    events.record(stewardPasskeyRemoved, {
      resourceId: user.userId,
      payload: { passkeyId: input.passkeyId },
    });

    return { passkeyId: input.passkeyId };
  },
});

/** The steward's passkeys and whether this session is confirmed. */
export const listOwnPasskeys = defineQuery({
  name: "steward_passkey.list_own",
  input: z.strictObject({}),
  policy: listOwnPasskeysPolicy,
  load: async ({ db, actor }) => {
    const user = steward(actor);
    const rows = await db
      .selectFrom("app.steward_passkeys")
      .select(["id", "name", "enrolled_with", "created_at", "last_used_at"])
      .where("user_id", "=", user.userId)
      .where("removed_at", "is", null)
      .orderBy("created_at")
      .execute();
    const confirmed = user.authentication.methods.find(
      ({ method }) => method === passkeyMethod,
    );

    return {
      context: undefined,
      resource: {
        passkeys: rows.map((row) => ({
          id: row.id,
          name: row.name,
          enrolledWith: row.enrolled_with as "enrollment_code" | "passkey",
          createdAt: new Date(row.created_at).toISOString(),
          lastUsedAt: row.last_used_at
            ? new Date(row.last_used_at).toISOString()
            : null,
        })),
        minimum: minimumStewardPasskeys,
        confirmedAt: confirmed?.at.toISOString() ?? null,
        strong: user.authentication.assurance === "aal2",
      },
    };
  },
  present: ({ resource }) => stewardPasskeysSchema.parse(resource),
});

const opsInput = z.strictObject({
  email: emailAddressSchema,
  /** Why; stored with the code, never in events or logs. */
  reason: z.string().trim().min(1).max(500),
});

/** The steward behind a verified address, locked for the change. */
async function loadStewardTarget(tx: Tx, email: string) {
  const user = await tx
    .selectFrom("app.verified_contacts as contact")
    .innerJoin("app.users as user", "user.id", "contact.user_id")
    .select(["user.id", "user.status"])
    .where("contact.kind", "=", "email")
    .where("contact.address", "=", email)
    .forUpdate("user")
    .executeTakeFirst();

  if (!user) {
    return null;
  }

  const grant = await tx
    .selectFrom("app.platform_role_grants")
    .select("id")
    .where("user_id", "=", user.id)
    .where("role", "=", "platform_steward")
    .where("revoked_at", "is", null)
    .executeTakeFirst();
  const resource: StewardTarget = {
    userId: user.id,
    status: user.status as AccountStatus,
    holdsRole: grant !== undefined,
  };

  return { resource, context: undefined };
}

const enrollmentCodeOutput = z.strictObject({
  code: z.string(),
  expiresAt: z.iso.datetime(),
  removedPasskeys: z.number().int().min(0),
});

/**
 * A new one-time enrollment code for the steward, voiding any open one. It
 * is shown once to the operator, who hands it over outside e-mail; only its
 * hash is kept. With `removeAll`, every passkey stops counting first: the
 * reset when a steward has lost them all.
 */
async function issueCode(
  tx: Tx,
  steward: StewardTarget,
  reason: string,
  removeAll: boolean,
  events: EventRecorder,
  now: Date,
  process: string,
) {
  let removedPasskeys = 0;

  if (removeAll) {
    const removed = await tx
      .updateTable("app.steward_passkeys")
      .set({ removed_at: now, removed_by_process: process })
      .where("user_id", "=", steward.userId)
      .where("removed_at", "is", null)
      .returning("id")
      .execute();

    for (const { id } of removed) {
      events.record(stewardPasskeyRemoved, {
        resourceId: steward.userId,
        payload: { passkeyId: id },
      });
    }

    removedPasskeys = removed.length;
  }

  await tx
    .updateTable("app.steward_enrollment_codes")
    .set({ voided_at: now })
    .where("user_id", "=", steward.userId)
    .where("used_at", "is", null)
    .where("voided_at", "is", null)
    .execute();

  const code = newEnrollmentCode();
  const expiresAt = new Date(now.getTime() + enrollmentCodeTtlMs);
  const { id: codeId } = await tx
    .insertInto("app.steward_enrollment_codes")
    .values({
      user_id: steward.userId,
      code_hash: enrollmentCodeHash(code),
      issued_at: now,
      issued_by_process: process,
      reason,
      expires_at: expiresAt,
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  events.record(stewardEnrollmentCodeIssued, {
    resourceId: steward.userId,
    payload: { codeId, removedPasskeys },
  });

  return { code, expiresAt: expiresAt.toISOString(), removedPasskeys };
}

function processOf(actor: Actor): string {
  if (actor.kind !== "system") {
    throw new Error("Only the operational command issues codes");
  }

  return actor.process;
}

/**
 * OD-0023: the code for a steward's first passkey, or for adding one when
 * they cannot confirm with another. Not idempotent on purpose: the output
 * holds the code, which is never stored, and a retry simply voids the first
 * code and issues a new one.
 */
export const issueStewardEnrollmentCode = defineCommand({
  name: "steward_passkey.issue_enrollment_code",
  input: opsInput,
  output: enrollmentCodeOutput,
  policy: issueEnrollmentCodePolicy,
  idempotency: "none",
  load: ({ tx, input }) => loadStewardTarget(tx, input.email),
  execute: ({ tx, actor, input, resource, events, now }) =>
    issueCode(tx, resource, input.reason, false, events, now, processOf(actor)),
});

/**
 * OD-0023: every passkey is lost. All of them stop counting at once, so
 * whoever holds a lost one cannot act, and a new code is issued for the
 * steward to start again.
 */
export const resetStewardPasskeys = defineCommand({
  name: "steward_passkey.reset",
  input: opsInput,
  output: enrollmentCodeOutput,
  policy: resetStewardPasskeysPolicy,
  idempotency: "none",
  load: ({ tx, input }) => loadStewardTarget(tx, input.email),
  execute: ({ tx, actor, input, resource, events, now }) =>
    issueCode(tx, resource, input.reason, true, events, now, processOf(actor)),
});
