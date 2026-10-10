import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import type { UserActor } from "../actor";
import { connectTestDatabase } from "../testing/database";
import { loanTestKit } from "../testing/loans";
import { lookUpPlatformSubject } from "./lookup";

/**
 * OD-0055: a steward finds an account or a thing from its full e-mail
 * address or the link to its page, and every lookup is recorded, found or
 * not, without what was typed.
 */
const db = connectTestDatabase();
afterAll(() => db.destroy());

const { run, user, steward, create, eventsFor } = loanTestKit(db);

const emailOf = async ({ userId }: UserActor) =>
  (
    await db
      .selectFrom("app.verified_contacts")
      .select("address")
      .where("user_id", "=", userId)
      .where("kind", "=", "email")
      .executeTakeFirstOrThrow()
  ).address;

const lookUp = (actor: UserActor, input: object) =>
  run(lookUpPlatformSubject, actor, input);

const lookupsBy = (actor: UserActor) =>
  db
    .selectFrom("app.audit_events")
    .select(["resource_id", "payload"])
    .where("event_type", "=", "platform.subject_looked_up")
    .where("actor_user_id", "=", actor.userId)
    .orderBy("position")
    .execute();

describe("a steward's lookup (OD-0055)", () => {
  it("finds an account by its full e-mail address or its page, and a thing by its page", async () => {
    const platform = await steward();
    const person = await user();
    const email = await emailOf(person);
    const objectId = await create(person);

    const byEmail = await lookUp(platform, {
      by: "email",
      email: email.toUpperCase(),
    });
    expect(byEmail.found).toMatchObject({
      kind: "user",
      userId: person.userId,
      status: "active",
      involved: false,
    });
    expect(
      await lookUp(platform, { by: "person", userId: person.userId }),
    ).toEqual(byEmail);
    expect(
      (await lookUp(platform, { by: "object", objectId })).found,
    ).toMatchObject({
      kind: "object",
      objectId,
      title: "Tilhenger",
      ownerNames: [expect.any(String)],
      involved: false,
    });

    // Part of an address finds nothing: there is no search.
    expect(
      await lookUp(platform, {
        by: "email",
        email: `${email.split("@")[0]}@example.org`,
      }),
    ).toEqual({ found: null });

    // Every lookup is recorded, found or not, never with what was typed.
    const recorded = await lookupsBy(platform);
    expect(recorded).toEqual([
      { resource_id: person.userId, payload: { by: "email", found: true } },
      { resource_id: person.userId, payload: { by: "person", found: true } },
      { resource_id: objectId, payload: { by: "object", found: true } },
      { resource_id: "none", payload: { by: "email", found: false } },
    ]);
    expect(JSON.stringify(recorded)).not.toContain(email.split("@")[0]);
    expect(await eventsFor("platform_lookup", "none")).not.toEqual([]);
  });

  it("names the steward's own account and things as theirs", async () => {
    const platform = await steward();
    const objectId = await create(platform);

    expect(
      (await lookUp(platform, { by: "person", userId: platform.userId })).found,
    ).toMatchObject({ involved: true });
    expect(
      (await lookUp(platform, { by: "object", objectId })).found,
    ).toMatchObject({ involved: true });
  });

  it("finds no account that is unknown, and is only for a confirmed steward", async () => {
    const platform = await steward();
    const person = await user();

    expect(
      await lookUp(platform, { by: "person", userId: randomUUID() }),
    ).toEqual({ found: null });
    expect(
      await lookUp(platform, { by: "object", objectId: randomUUID() }),
    ).toEqual({ found: null });

    await expect(
      lookUp(person, { by: "person", userId: platform.userId }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      lookUp(
        {
          ...platform,
          authentication: { ...platform.authentication, assurance: "aal1" },
        },
        { by: "person", userId: person.userId },
      ),
    ).rejects.toMatchObject({ code: "stronger_authentication_required" });
    expect(await lookupsBy(person)).toEqual([]);
  });
});
