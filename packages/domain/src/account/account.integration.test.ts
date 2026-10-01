import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { executeCommand, type DomainContext } from "../commands/command";
import { executeQuery } from "../commands/query";
import { ConsumerRegistry } from "../outbox/consumer";
import { connectTestDatabase } from "../testing/database";
import { testIdentity } from "../testing/identities";
import { completeRegistration } from "./commands";
import { resolveUserActor } from "./identity";
import { getOwnAccount } from "./queries";

const db = connectTestDatabase();
afterAll(() => db.destroy());
const domain: DomainContext = { db, consumers: new ConsumerRegistry() };

const identity = testIdentity;

async function eventsFor(userId: string) {
  return db
    .selectFrom("app.audit_events")
    .select(["event_type", "actor_user_id", "payload"])
    .where("resource_type", "=", "user")
    .where("resource_id", "=", userId)
    .orderBy("position")
    .execute();
}

describe("identity normalization (WP-10)", () => {
  it("creates one internal account per verified identity and reuses it", async () => {
    const verified = identity();

    const first = await resolveUserActor(domain, verified);
    const again = await resolveUserActor(domain, verified);

    expect(first).toMatchObject({
      kind: "user",
      accountStatus: "pending_registration",
      authentication: verified.authentication,
    });
    expect(again?.userId).toBe(first?.userId);
    // The internal id is not the provider's subject.
    expect(first?.userId).not.toBe(verified.subject);
    expect(await eventsFor(first!.userId)).toEqual([
      {
        event_type: "account.created",
        actor_user_id: first!.userId,
        payload: {},
      },
    ]);
  });

  it("creates a single account when the first requests race", async () => {
    const verified = identity();

    const actors = await Promise.all(
      Array.from({ length: 6 }, () => resolveUserActor(domain, verified)),
    );

    expect(new Set(actors.map((actor) => actor?.userId)).size).toBe(1);
  });

  it("treats an identity without a verified e-mail as not signed in", async () => {
    expect(
      await resolveUserActor(domain, identity({ emailVerified: false })),
    ).toBeNull();
    expect(
      await resolveUserActor(domain, identity({ email: null })),
    ).toBeNull();
  });

  it("never links a second identity to an address another account owns", async () => {
    const email = `${randomUUID()}@example.test`;
    await resolveUserActor(domain, identity({ email }));

    await expect(
      resolveUserActor(domain, identity({ email: email.toUpperCase() })),
    ).rejects.toMatchObject({ code: "conflict" });
  });
});

describe("registration (UX-JRN-001, PS-USR-001)", () => {
  it("activates the account with real name and 18+ confirmation, once", async () => {
    const verified = identity();
    const actor = (await resolveUserActor(domain, verified))!;
    const request = {
      actor,
      input: { realName: " Kari Nordmann ", adultConfirmed: true },
      idempotencyKey: randomUUID(),
    };

    expect(await executeCommand(domain, completeRegistration, request)).toEqual(
      {
        output: { status: "active" },
        replayed: false,
      },
    );
    expect(await executeCommand(domain, completeRegistration, request)).toEqual(
      {
        output: { status: "active" },
        replayed: true,
      },
    );

    const active = (await resolveUserActor(domain, verified))!;
    expect(
      await executeQuery(domain, getOwnAccount, { actor: active, input: {} }),
    ).toEqual({
      userId: actor.userId,
      status: "active",
      realName: "Kari Nordmann",
      email: verified.email,
    });
    expect(
      (await eventsFor(actor.userId)).map((event) => event.event_type),
    ).toEqual(["account.created", "account.registration_completed"]);
  });

  it("refuses a second registration with a new key", async () => {
    const actor = (await resolveUserActor(domain, identity()))!;
    const input = { realName: "Ola Nordmann", adultConfirmed: true };

    await executeCommand(domain, completeRegistration, {
      actor,
      input,
      idempotencyKey: randomUUID(),
    });

    await expect(
      executeCommand(domain, completeRegistration, {
        actor,
        input: { ...input, realName: "Someone Else" },
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("requires the 18+ confirmation", async () => {
    const actor = (await resolveUserActor(domain, identity()))!;

    await expect(
      executeCommand(domain, completeRegistration, {
        actor,
        input: { realName: "Ung Bruker", adultConfirmed: false },
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({
      code: "invalid_input",
      fields: ["adultConfirmed"],
    });
  });

  it("shows a pending account without profile data", async () => {
    const verified = identity();
    const actor = (await resolveUserActor(domain, verified))!;

    expect(
      await executeQuery(domain, getOwnAccount, { actor, input: {} }),
    ).toEqual({
      userId: actor.userId,
      status: "pending_registration",
      realName: null,
      email: verified.email,
    });
  });
});
