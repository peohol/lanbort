import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { systemActor } from "../actor";
import { resolveUserActor } from "../account/identity";
import { authorizeActor, definePolicy } from "../authorization/policy";
import { type DomainContext, executeCommand } from "../commands/command";
import { ConsumerRegistry } from "../outbox/consumer";
import { connectTestDatabase } from "../testing/database";
import { registerTestUser, testIdentity } from "../testing/identities";
import { grantPlatformRole, revokePlatformRole } from "./commands";
import { platformRoleOpsProcess, platformStewardAccess } from "./policies";

const db = connectTestDatabase();
afterAll(() => db.destroy());
const domain: DomainContext = { db, consumers: new ConsumerRegistry() };
const ops = systemActor(platformRoleOpsProcess);

const change = (email: string, reason = "Pilot steward") => ({
  email,
  role: "platform_steward",
  reason,
});

async function roleEvents(userId: string) {
  return db
    .selectFrom("app.audit_events")
    .select(["event_type", "actor_type", "actor_process", "payload"])
    .where("resource_type", "=", "user")
    .where("resource_id", "=", userId)
    .where("event_type", "like", "platform_role.%")
    .orderBy("position")
    .execute();
}

describe("platform steward role (WP-12)", () => {
  it("is granted explicitly, read on every request and revocable without rewriting history", async () => {
    const { identity, actor } = await registerTestUser(domain);
    expect(actor.platformRoles).toEqual([]);

    const granted = await executeCommand(domain, grantPlatformRole, {
      actor: ops,
      input: change(identity.email!.toUpperCase(), "Initial steward"),
      idempotencyKey: randomUUID(),
    });
    expect((await resolveUserActor(domain, identity))?.platformRoles).toEqual([
      "platform_steward",
    ]);

    const revoked = await executeCommand(domain, revokePlatformRole, {
      actor: ops,
      input: change(identity.email!, "Stepped down"),
      idempotencyKey: randomUUID(),
    });
    expect(revoked.output.grantId).toBe(granted.output.grantId);
    expect((await resolveUserActor(domain, identity))?.platformRoles).toEqual(
      [],
    );

    const history = await db
      .selectFrom("app.platform_role_grants")
      .select([
        "granted_by_process",
        "grant_reason",
        "revoked_by_process",
        "revoke_reason",
      ])
      .where("user_id", "=", actor.userId)
      .execute();
    expect(history).toEqual([
      {
        granted_by_process: platformRoleOpsProcess,
        grant_reason: "Initial steward",
        revoked_by_process: platformRoleOpsProcess,
        revoke_reason: "Stepped down",
      },
    ]);

    // The audit trail names the role and who changed it, never the reason.
    expect(await roleEvents(actor.userId)).toEqual([
      {
        event_type: "platform_role.granted",
        actor_type: "system",
        actor_process: platformRoleOpsProcess,
        payload: { role: "platform_steward" },
      },
      {
        event_type: "platform_role.revoked",
        actor_type: "system",
        actor_process: platformRoleOpsProcess,
        payload: { role: "platform_steward" },
      },
    ]);
  });

  it("refuses a second active grant and a revoke without a grant", async () => {
    const { identity } = await registerTestUser(domain);
    await executeCommand(domain, grantPlatformRole, {
      actor: ops,
      input: change(identity.email!),
      idempotencyKey: randomUUID(),
    });

    await expect(
      executeCommand(domain, grantPlatformRole, {
        actor: ops,
        input: change(identity.email!),
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "conflict" });

    const other = await registerTestUser(domain);
    await expect(
      executeCommand(domain, revokePlatformRole, {
        actor: ops,
        input: change(other.identity.email!),
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("replays a retried grant or revoke with the same key instead of failing", async () => {
    const { identity, actor } = await registerTestUser(domain);
    const grant = {
      actor: ops,
      input: change(identity.email!),
      idempotencyKey: randomUUID(),
    };

    const first = await executeCommand(domain, grantPlatformRole, grant);
    const retry = await executeCommand(domain, grantPlatformRole, grant);
    expect(retry).toEqual({ output: first.output, replayed: true });

    // Concurrent retries of the same request also return the same grant.
    const racing = await Promise.all(
      Array.from({ length: 4 }, () =>
        executeCommand(domain, grantPlatformRole, grant),
      ),
    );
    expect(new Set(racing.map((r) => r.output.grantId))).toEqual(
      new Set([first.output.grantId]),
    );

    // The same key cannot be reused for a different change.
    await expect(
      executeCommand(domain, grantPlatformRole, {
        ...grant,
        input: change(identity.email!, "Another reason"),
      }),
    ).rejects.toMatchObject({ code: "idempotency_key_reused" });

    const revoke = {
      actor: ops,
      input: change(identity.email!, "Stepped down"),
      idempotencyKey: randomUUID(),
    };
    const revoked = await executeCommand(domain, revokePlatformRole, revoke);
    expect(await executeCommand(domain, revokePlatformRole, revoke)).toEqual({
      output: revoked.output,
      replayed: true,
    });

    expect(
      (await roleEvents(actor.userId)).map((event) => event.event_type),
    ).toEqual(["platform_role.granted", "platform_role.revoked"]);
  });

  it("requires an idempotency key", async () => {
    const { identity } = await registerTestUser(domain);

    await expect(
      executeCommand(domain, grantPlatformRole, {
        actor: ops,
        input: change(identity.email!),
      }),
    ).rejects.toMatchObject({ code: "idempotency_key_required" });
  });

  it("grants once when separate grant requests race", async () => {
    const { identity, actor } = await registerTestUser(domain);

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        executeCommand(domain, grantPlatformRole, {
          actor: ops,
          input: change(identity.email!),
          idempotencyKey: randomUUID(),
        }),
      ),
    );

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await roleEvents(actor.userId)).toHaveLength(1);
  });

  it("is only granted by the operational command, and only to registered accounts", async () => {
    const { identity, actor } = await registerTestUser(domain);
    const steward = { ...actor, platformRoles: ["platform_steward"] as const };

    for (const caller of [actor, steward, systemActor("outbox.worker")]) {
      await expect(
        executeCommand(domain, grantPlatformRole, {
          actor: caller,
          input: change(identity.email!),
          idempotencyKey: randomUUID(),
        }),
      ).rejects.toMatchObject({ code: "forbidden" });
    }

    const pending = testIdentity();
    await resolveUserActor(domain, pending);
    await expect(
      executeCommand(domain, grantPlatformRole, {
        actor: ops,
        input: change(pending.email!),
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "forbidden" });

    await expect(
      executeCommand(domain, grantPlatformRole, {
        actor: ops,
        input: change("nobody@example.test"),
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "not_found" });

    expect(await roleEvents(actor.userId)).toEqual([]);
  });
});

describe("stronger authentication (WP-12, ADR-0011)", () => {
  const handleCase = definePolicy({
    action: "test.platform_case.handle",
    actor: [...platformStewardAccess],
  });

  it("is never taken from the provider, only from the steward's own passkeys", async () => {
    const { identity } = await registerTestUser(domain);
    await executeCommand(domain, grantPlatformRole, {
      actor: ops,
      input: change(identity.email!),
      idempotencyKey: randomUUID(),
    });

    // Whatever the provider reports, e.g. an authenticator app or a method
    // named like Lånbort's own, no session counts as stronger
    // (passkeys.integration.test.ts covers the passkeys themselves).
    for (const method of ["totp", "webauthn", "phone", "steward_passkey"]) {
      const steward = await resolveUserActor(domain, {
        ...identity,
        authentication: {
          ...identity.authentication,
          assurance: "aal2",
          methods: [{ method, at: new Date() }],
        },
      });

      expect(steward).toMatchObject({
        platformRoles: ["platform_steward"],
        authentication: { assurance: "aal1" },
      });
      expect(() =>
        authorizeActor(handleCase, { actor: steward!, now: new Date() }),
      ).toThrow(
        expect.objectContaining({ code: "stronger_authentication_required" }),
      );
    }
  });
});
