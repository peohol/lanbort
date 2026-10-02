import { randomUUID } from "node:crypto";
import type { UserActor } from "../actor";
import { completeRegistration } from "../account/commands";
import {
  type AuthenticatedIdentity,
  resolveUserActor,
} from "../account/identity";
import { type DomainContext, executeCommand } from "../commands/command";

/** A freshly verified provider identity with a unique e-mail address. */
export function testIdentity(
  overrides: Partial<AuthenticatedIdentity> = {},
): AuthenticatedIdentity {
  return {
    provider: "supabase",
    subject: randomUUID(),
    email: `${randomUUID()}@example.test`,
    emailVerified: true,
    authentication: {
      sessionId: randomUUID(),
      assurance: "aal1",
      methods: [{ method: "otp", at: new Date() }],
    },
    ...overrides,
  };
}

/** Signs a new identity in and completes its registration. */
export async function registerTestUser(
  domain: DomainContext,
  identity = testIdentity(),
): Promise<{ identity: AuthenticatedIdentity; actor: UserActor }> {
  const pending = await resolveUserActor(domain, identity);

  if (!pending) {
    throw new Error("Test identity was not resolved");
  }

  await executeCommand(domain, completeRegistration, {
    actor: pending,
    input: { realName: "Test Testesen", adultConfirmed: true },
    idempotencyKey: randomUUID(),
  });

  return {
    identity,
    actor: (await resolveUserActor(domain, identity)) as UserActor,
  };
}
