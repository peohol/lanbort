import { randomUUID } from "node:crypto";
import { sql } from "kysely";
import { afterAll, describe, expect, it } from "vitest";
import { systemActor } from "../actor";
import { executeCommand } from "../commands/command";
import {
  joinEnvironment,
  leaveEnvironment,
} from "../environment/membership-commands";
import { ConsumerRegistry } from "../outbox/consumer";
import { connectTestDatabase } from "../testing/database";
import { loanTestKit } from "../testing/loans";
import { pilotRetention } from "./model";
import { retentionProcess } from "./policies";
import { purgeExpiredData } from "./purge";

/**
 * OD-0002: the pilot's retention job deletes what has been kept long enough,
 * and nothing that is still in use. Test files share one database, so the
 * job runs at the real time and this file makes its old rows by dating them
 * back; nothing another file makes is old enough to go.
 */
const db = connectTestDatabase();
afterAll(() => db.destroy());

const day = 24 * 60 * 60 * 1000;
const ago = (ms: number) => new Date(Date.now() - ms);
const kit = loanTestKit(db);
// A clock 100 days back, for what the domain dates itself.
const past = loanTestKit(db, { startInDays: -100 });

const purge = () =>
  executeCommand({ db, consumers: new ConsumerRegistry() }, purgeExpiredData, {
    actor: systemActor(retentionProcess),
    input: {},
  });

async function notification(
  recipientId: string,
  createdAt: Date,
  target: { type: string; id: string } = { type: "object", id: randomUUID() },
) {
  const { id } = await db
    .insertInto("app.notifications")
    .values({
      recipient_id: recipientId,
      kind: "object.question_replied",
      level: "information",
      target_type: target.type,
      target_id: target.id,
      source_key: `test:${randomUUID()}`,
      occurred_at: createdAt,
      created_at: createdAt,
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  return id;
}

async function delivery(notificationId: string, finishedAt: Date | null) {
  await db
    .insertInto("app.notification_deliveries")
    .values({
      notification_id: notificationId,
      channel: "email",
      status: finishedAt ? "sent" : "pending",
      finished_at: finishedAt,
      // Out of reach of the e-mail job other test files run meanwhile.
      available_at: new Date(Date.now() + day),
    })
    .execute();
}

const exists = async (table: "app.notifications", id: string) =>
  (await db
    .selectFrom(table)
    .select("id")
    .where("id", "=", id)
    .executeTakeFirst()) !== undefined;

const deliveriesOf = async (notificationId: string) =>
  (
    await db
      .selectFrom("app.notification_deliveries")
      .select("status")
      .where("notification_id", "=", notificationId)
      .execute()
  ).map((row) => row.status);

describe("pilot retention (OD-0002)", () => {
  it("deletes notifications after 180 days, with their e-mail deliveries", async () => {
    const { userId } = await kit.user();
    const old = await notification(
      userId,
      ago(pilotRetention.notificationsMs + day),
    );
    const recent = await notification(
      userId,
      ago(pilotRetention.notificationsMs - day),
    );
    await delivery(old, null);
    await delivery(recent, ago(day));

    await purge();

    expect(await exists("app.notifications", old)).toBe(false);
    expect(await exists("app.notifications", recent)).toBe(true);
    expect(await deliveriesOf(recent)).toEqual(["sent"]);
  });

  it("keeps the notifications of a loan that is still reserved or active", async () => {
    const { borrower, loanId } = await past.reservedLoan();
    const kept = await notification(
      borrower.userId,
      ago(pilotRetention.notificationsMs + day),
      { type: "loan", id: loanId },
    );

    await purge();

    expect(await exists("app.notifications", kept)).toBe(true);
  });

  it("deletes finished e-mail deliveries after 30 days, never waiting ones", async () => {
    const { userId } = await kit.user();
    const finished = await notification(userId, ago(40 * day));
    const waiting = await notification(userId, ago(40 * day));
    await delivery(finished, ago(pilotRetention.emailDeliveriesMs + day));
    await delivery(waiting, null);

    await purge();

    expect(await deliveriesOf(finished)).toEqual([]);
    expect(await deliveriesOf(waiting)).toEqual(["pending"]);
    expect(await exists("app.notifications", finished)).toBe(true);
  });

  it("deletes succeeded outbox messages after 30 days, keeping failed ones", async () => {
    await kit.user();
    const { id: eventId } = await db
      .selectFrom("app.audit_events")
      .select("id")
      .orderBy("position", "desc")
      .limit(1)
      .executeTakeFirstOrThrow();
    const message = (consumer: string, status: "succeeded" | "dead") => ({
      event_id: eventId,
      consumer,
      status,
      attempts: 1,
      last_error: status === "dead" ? "test" : null,
      finished_at: ago(pilotRetention.outboxMessagesMs + day),
    });
    const succeeded = `test.retention-${randomUUID().slice(0, 8)}`;
    const dead = `test.retention-${randomUUID().slice(0, 8)}`;
    await db
      .insertInto("app.outbox_messages")
      .values([message(succeeded, "succeeded"), message(dead, "dead")])
      .execute();

    await purge();

    const left = await db
      .selectFrom("app.outbox_messages")
      .select("consumer")
      .where("event_id", "=", eventId)
      .where("consumer", "in", [succeeded, dead])
      .execute();
    expect(left.map((row) => row.consumer)).toEqual([dead]);
  });

  it("deletes stored command results after 30 days", async () => {
    const record = (key: string, createdAt: Date) => ({
      scope: `system:test.retention`,
      command: "test.retention",
      idempotency_key: key,
      request_hash: "0".repeat(64),
      response: {},
      created_at: createdAt,
    });
    const old = randomUUID();
    const recent = randomUUID();
    await db
      .insertInto("app.idempotency_records")
      .values([
        record(old, ago(pilotRetention.commandResultsMs + day)),
        record(recent, ago(pilotRetention.commandResultsMs - day)),
      ])
      .execute();

    await purge();

    const left = await db
      .selectFrom("app.idempotency_records")
      .select("idempotency_key")
      .where("idempotency_key", "in", [old, recent])
      .execute();
    expect(left.map((row) => row.idempotency_key)).toEqual([recent]);
  });

  it("deletes the answers of a membership that ended 90 days ago, not of one still active", async () => {
    const admin = await past.user();
    const environmentId = await past.environment(admin, {
      requirements: [{ kind: "information", text: "Hvilken leilighet?" }],
    });
    const { id: requirementId } = await db
      .selectFrom("app.environment_requirements")
      .select("id")
      .where("environment_id", "=", environmentId)
      .executeTakeFirstOrThrow();
    const [leaving, staying] = [await past.user(), await past.user()];
    for (const member of [leaving, staying]) {
      await past.run(joinEnvironment, member, {
        environmentId,
        answers: [{ requirementId, answer: "H0101" }],
      });
    }
    await past.run(leaveEnvironment, leaving, { environmentId });

    await purge();

    const answered = await db
      .selectFrom("app.environment_membership_answers as answer")
      .innerJoin(
        "app.environment_memberships as membership",
        "membership.id",
        "answer.membership_id",
      )
      .select("membership.user_id")
      .where("answer.environment_id", "=", environmentId)
      .execute();
    expect(answered.map((row) => row.user_id)).not.toContain(leaving.userId);
    expect(answered.map((row) => row.user_id)).toContain(staying.userId);
  });

  it("deletes rate-limit rows that no longer limit anything", async () => {
    const subject = Buffer.from(randomUUID());
    await sql`
      insert into app.rate_limits (rule, subject_hash, available_at)
      values ('test_retention', ${subject}, ${ago(day)}),
             ('test_retention_future', ${subject}, ${new Date(Date.now() + day)})
    `.execute(db);

    await purge();

    const left = await db
      .selectFrom("app.rate_limits")
      .select("rule")
      .where("subject_hash", "=", subject)
      .execute();
    expect(left.map((row) => row.rule)).toEqual(["test_retention_future"]);
  });
});
