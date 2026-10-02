import { emailAddressSchema, platformRoleSchema } from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import type { Transaction } from "kysely";
import { z } from "zod";
import type { AccountStatus, Actor } from "../actor";
import { defineCommand } from "../commands/command";
import { DomainError } from "../errors";
import { platformRoleGranted, platformRoleRevoked } from "./events";
import {
  grantPlatformRolePolicy,
  type PlatformRoleTarget,
  revokePlatformRolePolicy,
} from "./policies";

const platformRoleChangeSchema = z.strictObject({
  email: emailAddressSchema,
  role: platformRoleSchema,
  /** Why the change is made. Stored on the grant row, not in events or logs. */
  reason: z.string().trim().min(1).max(500),
});

type PlatformRoleChange = z.infer<typeof platformRoleChangeSchema>;

/** The account behind a verified address, locked for the change. */
async function loadTarget(
  tx: Transaction<Database>,
  input: PlatformRoleChange,
) {
  const user = await tx
    .selectFrom("app.verified_contacts as contact")
    .innerJoin("app.users as user", "user.id", "contact.user_id")
    .select(["user.id", "user.status"])
    .where("contact.kind", "=", "email")
    .where("contact.address", "=", input.email)
    .forUpdate("user")
    .executeTakeFirst();

  if (!user) {
    return null;
  }

  const grant = await tx
    .selectFrom("app.platform_role_grants")
    .select("id")
    .where("user_id", "=", user.id)
    .where("role", "=", input.role)
    .where("revoked_at", "is", null)
    .executeTakeFirst();

  const resource: PlatformRoleTarget = {
    userId: user.id,
    status: user.status as AccountStatus,
    activeGrantId: grant?.id ?? null,
  };

  return { resource, context: undefined };
}

/** Who made a change, as stored on the grant row. */
function changedBy(actor: Actor) {
  switch (actor.kind) {
    case "user":
      return { userId: actor.userId, process: null };
    case "system":
      return { userId: null, process: actor.process };
    case "anonymous":
      throw new Error("Anonymous actors cannot change platform roles");
  }
}

const grantOutput = z.strictObject({ grantId: z.uuid() });

export const grantPlatformRole = defineCommand({
  name: "platform_role.grant",
  input: platformRoleChangeSchema,
  output: grantOutput,
  policy: grantPlatformRolePolicy,
  // A retry with the same key returns the first result (docs/architecture/05).
  idempotency: "required",
  load: ({ tx, input }) => loadTarget(tx, input),
  execute: async ({ tx, actor, input, resource, events, now }) => {
    if (resource.activeGrantId !== null) {
      throw new DomainError("conflict", "The role is already granted");
    }

    const by = changedBy(actor);
    const grant = await tx
      .insertInto("app.platform_role_grants")
      .values({
        user_id: resource.userId,
        role: input.role,
        granted_at: now,
        granted_by_user_id: by.userId,
        granted_by_process: by.process,
        grant_reason: input.reason,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    events.record(platformRoleGranted, {
      resourceId: resource.userId,
      payload: { role: input.role },
    });

    return { grantId: grant.id };
  },
});

export const revokePlatformRole = defineCommand({
  name: "platform_role.revoke",
  input: platformRoleChangeSchema,
  output: grantOutput,
  policy: revokePlatformRolePolicy,
  idempotency: "required",
  load: ({ tx, input }) => loadTarget(tx, input),
  execute: async ({ tx, actor, input, resource, events, now }) => {
    const grantId = resource.activeGrantId as string;
    const by = changedBy(actor);

    await tx
      .updateTable("app.platform_role_grants")
      .set({
        revoked_at: now,
        revoked_by_user_id: by.userId,
        revoked_by_process: by.process,
        revoke_reason: input.reason,
      })
      .where("id", "=", grantId)
      .execute();

    events.record(platformRoleRevoked, {
      resourceId: resource.userId,
      payload: { role: input.role },
    });

    return { grantId };
  },
});
