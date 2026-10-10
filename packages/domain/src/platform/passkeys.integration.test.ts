import { randomUUID } from "node:crypto";
import { TestPasskey } from "@lanbort/auth/passkey-testing";
import { afterAll, describe, expect, it } from "vitest";
import type { UserActor } from "../actor";
import { resolveUserActor } from "../account/identity";
import { authorizeActor, definePolicy } from "../authorization/policy";
import { type DomainContext, executeCommand } from "../commands/command";
import { executeQuery } from "../commands/query";
import { notificationGenerator } from "../notifications/generator";
import { listNotifications } from "../notifications/queries";
import { ConsumerRegistry } from "../outbox/consumer";
import { connectTestDatabase } from "../testing/database";
import { registerTestUser } from "../testing/identities";
import { deliverAll } from "../testing/outbox";
import {
  confirmSession,
  inAnotherSession,
  opsActors,
  registerPasskey,
  testPasskeyCommands,
  testSite,
  testSteward,
} from "../testing/stewards";
import { grantPlatformRole, revokePlatformRole } from "./commands";
import {
  issueStewardEnrollmentCode,
  listOwnPasskeys,
  removeStewardPasskey,
  resetStewardPasskeys,
} from "./passkey-commands";
import { enrollmentCodeTtlMs, passkeyConfirmationMaxAgeMs } from "./passkeys";
import { platformStewardAccess } from "./policies";

const db = connectTestDatabase();
afterAll(() => db.destroy());

let now = new Date();
const consumers = new ConsumerRegistry([
  notificationGenerator({ db: () => db }),
]);
const domain: DomainContext = {
  db,
  consumers,
  clock: () => now,
  platformStewards: true,
};
const advance = (ms: number) => {
  now = new Date(now.getTime() + ms);
};

const privileged = definePolicy({
  action: "test.platform_case.handle",
  actor: [...platformStewardAccess],
});

/** Whether the actor may act as a steward now. */
function mayAct(actor: UserActor | null) {
  try {
    authorizeActor(privileged, { actor: actor!, now });
    return "allow";
  } catch (error) {
    return (error as { code: string }).code;
  }
}

async function auditOf(userId: string) {
  return db
    .selectFrom("app.audit_events")
    .select(["event_type", "payload"])
    .where("resource_type", "=", "user")
    .where("resource_id", "=", userId)
    .where("event_type", "like", "steward_passkey.%")
    .orderBy("position")
    .execute();
}

/** The security notices the steward got about their passkeys, oldest first. */
async function toldAbout(steward: Awaited<ReturnType<typeof testSteward>>) {
  await deliverAll(db, consumers);
  const actor = await steward.signIn();
  const { notifications } = await executeQuery(domain, listNotifications, {
    actor,
    input: {},
  });

  return [...notifications]
    .reverse()
    .filter(({ kind }) => kind === "steward.passkeys_changed")
    .map(({ level, detail, target }) => {
      expect(level).toBe("required");
      expect(target).toEqual({ type: "steward_access", id: actor.userId });
      return detail;
    });
}

const begin = (actor: UserActor, input: object = {}) =>
  executeCommand(domain, testPasskeyCommands.beginRegistration, {
    actor,
    input,
  });

/** A steward with the role and a code, but no passkeys yet. */
async function newSteward() {
  const { identity, actor } = await registerTestUser(domain);
  await executeCommand(domain, grantPlatformRole, {
    actor: opsActors.roles,
    input: {
      email: identity.email!,
      role: "platform_steward",
      reason: "Test",
    },
    idempotencyKey: randomUUID(),
  });
  const issue = () =>
    executeCommand(domain, issueStewardEnrollmentCode, {
      actor: opsActors.passkeys,
      input: { email: identity.email!, reason: "Første nøkler" },
    });

  return {
    identity,
    actor,
    issue,
    signIn: () => resolveUserActor(domain, identity) as Promise<UserActor>,
  };
}

describe("steward passkeys (ADR-0011, OD-0023)", () => {
  it("gives stronger access only after two passkeys and a fresh confirmation in this session", async () => {
    const steward = await newSteward();
    expect(mayAct(await steward.signIn())).toBe(
      "stronger_authentication_required",
    );

    // An e-mail session alone never adds a passkey.
    await expect(begin(await steward.signIn())).rejects.toMatchObject({
      code: "stronger_authentication_required",
    });

    const { output } = await steward.issue();
    expect(output.code).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/);
    const first = new TestPasskey(testSite);
    await registerPasskey(domain, await steward.signIn(), first, {
      enrollmentCode: output.code.toLowerCase().replaceAll("-", " "),
    });

    // One passkey confirms the session but gives no stronger access.
    const withOne = await steward.signIn();
    expect(withOne.authentication.methods[0]?.method).toBe("steward_passkey");
    expect(mayAct(withOne)).toBe("stronger_authentication_required");

    // The fresh confirmation vouches for the second passkey.
    const second = new TestPasskey(testSite);
    await registerPasskey(domain, withOne, second, {}, "Nøkkel i skuffen");
    expect(mayAct(await steward.signIn())).toBe("allow");

    // Ten minutes later it has to be confirmed again, with either passkey.
    advance(passkeyConfirmationMaxAgeMs + 1000);
    const later = await steward.signIn();
    expect(mayAct(later)).toBe("stronger_authentication_required");
    await confirmSession(domain, later, second);
    expect(mayAct(await steward.signIn())).toBe("allow");

    // Another sign-in session of the same steward starts unconfirmed.
    expect(
      mayAct(
        await resolveUserActor(domain, inAnotherSession(steward.identity)),
      ),
    ).toBe("stronger_authentication_required");

    const listed = await executeQuery(domain, listOwnPasskeys, {
      actor: await steward.signIn(),
      input: {},
    });
    expect(listed).toMatchObject({
      minimum: 2,
      strong: true,
      passkeys: [
        { enrolledWith: "enrollment_code", name: "Testnøkkel" },
        { enrolledWith: "passkey", name: "Nøkkel i skuffen" },
      ],
    });

    // The audit trail says what happened, never key material.
    expect(
      (await auditOf(steward.actor.userId)).map((e) => e.event_type),
    ).toEqual([
      "steward_passkey.enrollment_code_issued",
      "steward_passkey.added",
      "steward_passkey.added",
      "steward_passkey.confirmed",
    ]);
  });

  it("uses a code once, for its own account, within its hour", async () => {
    const steward = await newSteward();
    const other = await newSteward();
    const { output } = await steward.issue();

    // Someone else's code, or a wrong one, is refused.
    await other.issue();
    for (const code of [output.code, "AAAA-BBBB-CCCC-DDDD"]) {
      await expect(
        begin(await other.signIn(), { enrollmentCode: code }),
      ).rejects.toMatchObject({
        code: "invalid_input",
        fields: ["enrollmentCode"],
      });
    }

    await registerPasskey(
      domain,
      await steward.signIn(),
      new TestPasskey(testSite),
      {
        enrollmentCode: output.code,
      },
    );
    await expect(
      begin(await steward.signIn(), { enrollmentCode: output.code }),
    ).rejects.toMatchObject({ code: "invalid_input" });

    // A new code voids the open one, and an old code expires.
    const { output: older } = await other.issue();
    const { output: newer } = await other.issue();
    await expect(
      begin(await other.signIn(), { enrollmentCode: older.code }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    advance(enrollmentCodeTtlMs + 1000);
    await expect(
      begin(await other.signIn(), { enrollmentCode: newer.code }),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("does not let a code voided during the ceremony add the passkey", async () => {
    const steward = await newSteward();
    const { output: code } = await steward.issue();
    const actor = await steward.signIn();
    const { output } = await begin(actor, { enrollmentCode: code.code });
    await steward.issue();

    await expect(
      executeCommand(domain, testPasskeyCommands.finishRegistration, {
        actor,
        input: {
          challengeId: output.challengeId,
          name: "Sen nøkkel",
          response: new TestPasskey(testSite).register(output.options),
        },
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("refuses a ceremony from another session, another domain or another passkey", async () => {
    const steward = await testSteward(domain);
    const actor = await steward.confirm();

    // A ceremony started in one session cannot be finished from another.
    const { output } = await executeCommand(
      domain,
      testPasskeyCommands.beginConfirmation,
      { actor, input: {} },
    );
    const elsewhere = (await resolveUserActor(
      domain,
      inAnotherSession(steward.identity),
    )) as UserActor;
    await expect(
      executeCommand(domain, testPasskeyCommands.finishConfirmation, {
        actor: elsewhere,
        input: {
          challengeId: output.challengeId,
          response: steward.passkeys[0]!.confirm(output.options),
        },
      }),
    ).rejects.toMatchObject({ code: "not_found" });

    // Phished through another origin, or a passkey that is not theirs.
    for (const passkey of [
      new TestPasskey({ ...testSite, origin: "https://evil.example" }),
      new TestPasskey(testSite),
    ]) {
      const fresh = await executeCommand(
        domain,
        testPasskeyCommands.beginConfirmation,
        { actor, input: {} },
      );
      const answer = passkey.confirm(fresh.output.options);
      await expect(
        executeCommand(domain, testPasskeyCommands.finishConfirmation, {
          actor,
          input: {
            challengeId: fresh.output.challengeId,
            response: {
              ...answer,
              id: Buffer.from(steward.passkeys[0]!.credentialId).toString(
                "base64url",
              ),
            },
          },
        }),
      ).rejects.toMatchObject({ code: "invalid_input", fields: ["response"] });
    }
  });

  it("never counts what the provider reports, nor anything while switched off", async () => {
    const steward = await testSteward(domain);
    await steward.confirm();

    // TOTP, phone, the provider's own WebAuthn or a method with Lånbort's
    // name do not make another session stronger.
    for (const method of ["totp", "phone", "mfa/webauthn", "steward_passkey"]) {
      const identity = inAnotherSession(steward.identity);
      const actor = await resolveUserActor(domain, {
        ...identity,
        authentication: {
          ...identity.authentication,
          assurance: "aal2",
          methods: [{ method, at: now }],
        },
      });
      expect(actor?.authentication.methods).not.toContainEqual(
        expect.objectContaining({ method: "steward_passkey" }),
      );
      expect(mayAct(actor)).toBe("stronger_authentication_required");
    }

    // The deployment's switch closes it however fresh the confirmation is.
    const off = { ...domain, platformStewards: false };
    expect(mayAct(await resolveUserActor(off, steward.identity))).toBe(
      "stronger_authentication_required",
    );
    expect(mayAct(await steward.signIn())).toBe("allow");
  });

  it("lets a steward replace a lost passkey, but never remove the last", async () => {
    const steward = await testSteward(domain);
    const remove = (actor: UserActor, passkeyId: string) =>
      executeCommand(domain, removeStewardPasskey, {
        actor,
        input: { passkeyId },
        idempotencyKey: randomUUID(),
      });
    const ids = async () =>
      (
        await executeQuery(domain, listOwnPasskeys, {
          actor: await steward.signIn(),
          input: {},
        })
      ).passkeys.map((passkey) => passkey.id);
    const [lostId, keptId] = await ids();
    expect(await toldAbout(steward)).toEqual([
      "enrollment_code",
      "added",
      "added",
    ]);

    // Removing takes a fresh confirmation.
    advance(passkeyConfirmationMaxAgeMs + 1000);
    await expect(remove(await steward.signIn(), lostId!)).rejects.toMatchObject(
      { code: "stronger_authentication_required" },
    );

    const actor = await steward.confirm(steward.passkeys[1]);
    await remove(actor, lostId!);

    // With one left the role gives no stronger access, and the lost one
    // confirms nothing any more.
    expect(mayAct(await steward.signIn())).toBe(
      "stronger_authentication_required",
    );
    await expect(steward.confirm(steward.passkeys[0])).rejects.toMatchObject({
      code: "invalid_input",
    });
    await expect(remove(await steward.signIn(), keptId!)).rejects.toMatchObject(
      { code: "forbidden" },
    );

    // A replacement added from the confirmed session restores it.
    await registerPasskey(
      domain,
      await steward.signIn(),
      new TestPasskey(testSite),
    );
    expect(mayAct(await steward.signIn())).toBe("allow");
    expect((await toldAbout(steward)).slice(3)).toEqual(["removed", "added"]);

    // Someone else's passkey is not found.
    const other = await testSteward(domain);
    await expect(remove(await other.confirm(), keptId!)).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("resets every passkey when all are lost, with a new code from the operational command", async () => {
    const steward = await testSteward(domain);
    await steward.confirm();
    expect(mayAct(await steward.signIn())).toBe("allow");

    // A code is only for the first passkey: while lost ones still count,
    // the operator must reset, not enroll.
    await expect(
      executeCommand(domain, issueStewardEnrollmentCode, {
        actor: opsActors.passkeys,
        input: { email: steward.email, reason: "Mistet begge nøklene" },
      }),
    ).rejects.toMatchObject({ code: "conflict" });

    const { output } = await executeCommand(domain, resetStewardPasskeys, {
      actor: opsActors.passkeys,
      input: { email: steward.email, reason: "Mistet begge nøklene" },
    });
    expect(output.removedPasskeys).toBe(2);

    // The open session loses its stronger access at once, and the old
    // passkeys cannot confirm anything.
    expect(mayAct(await steward.signIn())).toBe(
      "stronger_authentication_required",
    );
    await expect(steward.confirm()).rejects.toMatchObject({
      code: "forbidden",
    });

    const fresh = [new TestPasskey(testSite), new TestPasskey(testSite)];
    await registerPasskey(domain, await steward.signIn(), fresh[0]!, {
      enrollmentCode: output.code,
    });
    await registerPasskey(domain, await steward.signIn(), fresh[1]!);
    expect(mayAct(await steward.signIn())).toBe("allow");

    const removed = (await auditOf((await steward.signIn()).userId)).filter(
      (event) => event.event_type === "steward_passkey.removed",
    );
    expect(removed).toHaveLength(2);
    // The reset is told once, not per passkey it removed.
    expect((await toldAbout(steward)).slice(3)).toEqual([
      "reset",
      "added",
      "added",
    ]);
    // Events name only ids, never a code, a key or a reason.
    for (const event of await auditOf((await steward.signIn()).userId)) {
      for (const key of Object.keys(event.payload as object)) {
        expect([
          "passkeyId",
          "enrolledWith",
          "codeId",
          "removedPasskeys",
        ]).toContain(key);
      }
    }
  });

  it("is only for stewards, and only the operational command issues codes", async () => {
    const { identity, actor } = await registerTestUser(domain);

    await expect(begin(actor)).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      executeCommand(domain, issueStewardEnrollmentCode, {
        actor: opsActors.passkeys,
        input: { email: identity.email!, reason: "Ikke forvalter" },
      }),
    ).rejects.toMatchObject({ code: "forbidden" });

    const steward = await testSteward(domain);
    for (const caller of [await steward.confirm(), opsActors.roles]) {
      await expect(
        executeCommand(domain, issueStewardEnrollmentCode, {
          actor: caller,
          input: { email: steward.email, reason: "Selvbetjent" },
        }),
      ).rejects.toMatchObject({ code: "forbidden" });
    }

    // A revoked role gives nothing, whatever the session.
    await executeCommand(domain, revokePlatformRole, {
      actor: opsActors.roles,
      input: {
        email: steward.email,
        role: "platform_steward",
        reason: "Gått av",
      },
      idempotencyKey: randomUUID(),
    });
    expect(mayAct(await steward.signIn())).toBe("forbidden");
  });
});
