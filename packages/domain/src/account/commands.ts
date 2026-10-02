import { completeRegistrationSchema } from "@lanbort/contracts";
import { z } from "zod";
import type { Database } from "@lanbort/database";
import type { Transaction } from "kysely";
import type { AccountStatus, Actor } from "../actor";
import { defineCommand, type Loaded } from "../commands/command";
import { mfaEnabled, registrationCompleted } from "./events";
import {
  type AccountResource,
  completeRegistrationPolicy,
  recordMfaEnabledPolicy,
} from "./policies";

/** The signed-in user's own account row, locked for the change. */
async function loadOwnUser({
  tx,
  actor,
}: {
  tx: Transaction<Database>;
  actor: Actor;
}): Promise<Loaded<AccountResource, void> | null> {
  if (actor.kind !== "user") {
    return null;
  }

  const user = await tx
    .selectFrom("app.users")
    .select(["id", "status"])
    .where("id", "=", actor.userId)
    .forUpdate()
    .executeTakeFirst();

  return user
    ? {
        resource: { userId: user.id, status: user.status as AccountStatus },
        context: undefined,
      }
    : null;
}

/**
 * UX-JRN-001 step 3: real name and 18+ confirmation activate the account.
 * Retry-safe, so a double submit cannot create two profiles.
 */
export const completeRegistration = defineCommand({
  name: "account.complete_registration",
  input: completeRegistrationSchema,
  output: z.strictObject({ status: z.literal("active") }),
  policy: completeRegistrationPolicy,
  idempotency: "required",
  load: loadOwnUser,
  execute: async ({ tx, input, resource, events, now }) => {
    await tx
      .insertInto("app.profiles")
      .values({ user_id: resource.userId, real_name: input.realName })
      .execute();

    await tx
      .updateTable("app.users")
      .set({ status: "active", adult_confirmed_at: now })
      .where("id", "=", resource.userId)
      .execute();

    events.record(registrationCompleted, {
      resourceId: resource.userId,
      payload: {},
    });

    return { status: "active" as const };
  },
});

/**
 * Makes sure Lånbort's audit history has the authenticator app the provider
 * has confirmed. The provider owns the factor, so its change and this record
 * cannot share a transaction. `resolveUserActor` runs this before it accepts
 * an aal2 session without the record, and it writes the event only once.
 * (Removing an app is not supported yet; when it is, this must compare with
 * the latest removal.)
 */
export const recordMfaEnabled = defineCommand({
  name: "account.record_mfa_enabled",
  input: z.strictObject({}),
  output: z.strictObject({ newlyRecorded: z.boolean() }),
  policy: recordMfaEnabledPolicy,
  // Repetition is harmless: the event is only written once per account.
  idempotency: "none",
  load: loadOwnUser,
  execute: async ({ tx, resource, events }) => {
    // The user row is locked by `loadOwnUser`, so concurrent calls serialize.
    const existing = await tx
      .selectFrom("app.audit_events")
      .select("id")
      .where("resource_type", "=", mfaEnabled.resourceType)
      .where("resource_id", "=", resource.userId)
      .where("event_type", "=", mfaEnabled.type)
      .limit(1)
      .executeTakeFirst();

    if (existing) {
      return { newlyRecorded: false };
    }

    events.record(mfaEnabled, {
      resourceId: resource.userId,
      payload: { method: "totp" },
    });

    return { newlyRecorded: true };
  },
});
