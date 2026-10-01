import { randomUUID } from "node:crypto";
import type { Database } from "@lanbort/database";
import type { Kysely } from "kysely";
import type { UserActor } from "../actor";

/** An active, freshly e-mail-authenticated user actor for policy tests. */
export function testUserActor(overrides: Partial<UserActor> = {}): UserActor {
  const now = new Date();

  return {
    kind: "user",
    userId: randomUUID(),
    accountStatus: "active",
    authentication: {
      sessionId: randomUUID(),
      assurance: "aal1",
      methods: [{ method: "otp", at: now }],
    },
    platformRoles: [],
    ...overrides,
  };
}

/** Inserts an internal user row so events can reference the actor. */
export async function createTestUser(
  db: Kysely<Database>,
  overrides: Partial<UserActor> = {},
): Promise<UserActor> {
  const actor = testUserActor(overrides);

  await db
    .insertInto("app.users")
    .values({
      id: actor.userId,
      status: actor.accountStatus,
      adult_confirmed_at: actor.accountStatus === "active" ? new Date() : null,
    })
    .execute();

  return actor;
}
