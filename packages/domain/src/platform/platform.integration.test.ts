import { afterAll, describe, expect, it } from "vitest";
import { systemActor } from "../actor";
import { recordMfaEnabled } from "../account/commands";
import { resolveUserActor } from "../account/identity";
import { type DomainContext, executeCommand } from "../commands/command";
import { ConsumerRegistry } from "../outbox/consumer";
import { connectTestDatabase } from "../testing/database";
import { registerTestUser, testIdentity } from "../testing/identities";
import { grantPlatformRole, revokePlatformRole } from "./commands";
import { platformRoleOpsProcess } from "./policies";

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
    });
    expect((await resolveUserActor(domain, identity))?.platformRoles).toEqual([
      "platform_steward",
    ]);

    const revoked = await executeCommand(domain, revokePlatformRole, {
      actor: ops,
      input: change(identity.email!, "Stepped down"),
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
    });

    await expect(
      executeCommand(domain, grantPlatformRole, {
        actor: ops,
        input: change(identity.email!),
      }),
    ).rejects.toMatchObject({ code: "conflict" });

    const other = await registerTestUser(domain);
    await expect(
      executeCommand(domain, revokePlatformRole, {
        actor: ops,
        input: change(other.identity.email!),
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("grants once when the same grant races", async () => {
    const { identity, actor } = await registerTestUser(domain);

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        executeCommand(domain, grantPlatformRole, {
          actor: ops,
          input: change(identity.email!),
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
        }),
      ).rejects.toMatchObject({ code: "forbidden" });
    }

    const pending = testIdentity();
    await resolveUserActor(domain, pending);
    await expect(
      executeCommand(domain, grantPlatformRole, {
        actor: ops,
        input: change(pending.email!),
      }),
    ).rejects.toMatchObject({ code: "forbidden" });

    await expect(
      executeCommand(domain, grantPlatformRole, {
        actor: ops,
        input: change("nobody@example.test"),
      }),
    ).rejects.toMatchObject({ code: "not_found" });

    expect(await roleEvents(actor.userId)).toEqual([]);
  });
});

describe("MFA audit record (WP-12)", () => {
  it("is written once, and only for a session confirmed with the second factor", async () => {
    const { identity, actor } = await registerTestUser(domain);

    await expect(
      executeCommand(domain, recordMfaEnabled, { actor, input: {} }),
    ).rejects.toMatchObject({ code: "mfa_required" });

    const steppedUp = await resolveUserActor(domain, {
      ...identity,
      authentication: {
        ...identity.authentication,
        assurance: "aal2",
        methods: [{ method: "totp", at: new Date() }],
      },
    });
    const record = () =>
      executeCommand(domain, recordMfaEnabled, {
        actor: steppedUp!,
        input: {},
      });

    // Every later verification re-checks; the event is written once.
    expect((await record()).output).toEqual({ newlyRecorded: true });
    expect((await record()).output).toEqual({ newlyRecorded: false });
    await Promise.all([record(), record()]);

    const events = await db
      .selectFrom("app.audit_events")
      .select(["event_type", "payload"])
      .where("resource_id", "=", actor.userId)
      .where("event_type", "=", "account.mfa_enabled")
      .execute();
    expect(events).toEqual([
      { event_type: "account.mfa_enabled", payload: { method: "totp" } },
    ]);
  });
});
