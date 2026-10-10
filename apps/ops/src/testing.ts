import { randomUUID } from "node:crypto";
import {
  completeRegistration,
  type DomainContext,
  executeCommand,
  resolveUserActor,
} from "@lanbort/domain";

/** A registered account, as the operational commands find it by e-mail. */
export async function registeredAccount(domain: DomainContext) {
  const email = `ops-${randomUUID()}@example.test`;
  const actor = await resolveUserActor(domain, {
    provider: "supabase",
    subject: randomUUID(),
    email,
    emailVerified: true,
    authentication: { sessionId: randomUUID(), assurance: "aal1", methods: [] },
  });
  await executeCommand(domain, completeRegistration, {
    actor: actor!,
    input: { realName: "Drift Testesen", adultConfirmed: true },
    idempotencyKey: randomUUID(),
  });
  return { email, userId: actor!.userId };
}
