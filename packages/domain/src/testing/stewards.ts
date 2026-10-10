import { randomUUID } from "node:crypto";
import { createPasskeyCeremonies, passkeyConfigFor } from "@lanbort/auth";
import { TestPasskey } from "@lanbort/auth/passkey-testing";
import { systemActor, type UserActor } from "../actor";
import {
  type AuthenticatedIdentity,
  resolveUserActor,
} from "../account/identity";
import { type DomainContext, executeCommand } from "../commands/command";
import { grantPlatformRole } from "../platform/commands";
import {
  issueStewardEnrollmentCode,
  stewardPasskeyCommands,
} from "../platform/passkey-commands";
import {
  platformRoleOpsProcess,
  stewardPasskeyOpsProcess,
} from "../platform/policies";
import { registerTestUser } from "./identities";

/** The relying party tests use, as a local deployment has it. */
export const testSite = {
  rpId: "localhost",
  origin: "http://localhost:3000",
} as const;

export const testCeremonies = createPasskeyCeremonies(
  passkeyConfigFor(testSite.origin),
);

export const testPasskeyCommands = stewardPasskeyCommands(testCeremonies);

/** The operational commands, as `pnpm ops:…` runs them. */
export const opsActors = {
  roles: systemActor(platformRoleOpsProcess),
  passkeys: systemActor(stewardPasskeyOpsProcess),
};

/**
 * A platform steward as the pilot sets one up (OD-0023): the role from the
 * operational command, an enrollment code, and two passkeys, the second
 * added from the session the first confirmed. `confirm()` returns the
 * steward as a fresh passkey confirmation leaves them.
 */
export async function testSteward(domain: DomainContext) {
  const { identity } = await registerTestUser(domain);
  const email = identity.email as string;
  const signIn = () => resolveUserActor(domain, identity) as Promise<UserActor>;

  await executeCommand(domain, grantPlatformRole, {
    actor: opsActors.roles,
    input: { email, role: "platform_steward", reason: "Test steward" },
    idempotencyKey: randomUUID(),
  });
  const { output } = await executeCommand(domain, issueStewardEnrollmentCode, {
    actor: opsActors.passkeys,
    input: { email, reason: "First passkeys" },
  });
  const passkeys = [new TestPasskey(testSite), new TestPasskey(testSite)];

  await registerPasskey(domain, await signIn(), passkeys[0]!, {
    enrollmentCode: output.code,
  });
  await registerPasskey(domain, await signIn(), passkeys[1]!);

  return {
    identity,
    email,
    passkeys,
    signIn,
    async confirm(with_ = passkeys[0]!) {
      await confirmSession(domain, await signIn(), with_);
      return signIn();
    },
  };
}

/** Adds a passkey, as the browser and the server do it together. */
export async function registerPasskey(
  domain: DomainContext,
  actor: UserActor,
  passkey: TestPasskey,
  begin: { enrollmentCode?: string } = {},
  name = "Testnøkkel",
) {
  const { output } = await executeCommand(
    domain,
    testPasskeyCommands.beginRegistration,
    { actor, input: begin },
  );

  return executeCommand(domain, testPasskeyCommands.finishRegistration, {
    actor,
    input: {
      challengeId: output.challengeId,
      name,
      response: passkey.register(output.options),
    },
  });
}

/** Confirms the actor's session with a passkey. */
export async function confirmSession(
  domain: DomainContext,
  actor: UserActor,
  passkey: TestPasskey,
) {
  const { output } = await executeCommand(
    domain,
    testPasskeyCommands.beginConfirmation,
    { actor, input: {} },
  );

  return executeCommand(domain, testPasskeyCommands.finishConfirmation, {
    actor,
    input: {
      challengeId: output.challengeId,
      response: passkey.confirm(output.options),
    },
  });
}

/** The same identity in another sign-in session. */
export function inAnotherSession(
  identity: AuthenticatedIdentity,
): AuthenticatedIdentity {
  return {
    ...identity,
    authentication: { ...identity.authentication, sessionId: randomUUID() },
  };
}
