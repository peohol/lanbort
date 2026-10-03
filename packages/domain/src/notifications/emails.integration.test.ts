import { randomUUID } from "node:crypto";
import type { NotificationKind } from "@lanbort/contracts";
import { EmailSendError, MemoryEmailSender } from "@lanbort/email/testing";
import { sql } from "kysely";
import { afterAll, describe, expect, it } from "vitest";
import type { UserActor } from "../actor";
import { ConsumerRegistry, defineConsumer } from "../outbox/consumer";
import { processOutboxBatch } from "../outbox/worker";
import { sendFriendRequest } from "../social/commands";
import { connectTestDatabase } from "../testing/database";
import { loanTestKit } from "../testing/loans";
import { markNotificationsRead, setNotificationPreference } from "./commands";
import {
  deliverNotificationEmails,
  type NotificationEmailOptions,
  notificationEmailMaxAgeMs,
} from "./delivery";
import { notificationGenerator } from "./generator";
import { recordNotifications } from "./store";

/**
 * WP-41: e-mail as the pilot's external reserve channel. Notifications are
 * queued with the notification itself and sent by the e-mail job through
 * the adapter (here a memory sender). Other test files make notifications
 * at the same time, so every assertion is about this file's own recipients.
 */
const db = connectTestDatabase();
afterAll(() => db.destroy());

// Its own consumer name, so the notification tests running alongside never
// claim this file's events, nor this file theirs.
const consumers = new ConsumerRegistry([
  defineConsumer({
    ...notificationGenerator({ db: () => db }),
    name: "test.notification_emails",
  }),
]);
const kit = loanTestKit(db, { consumers });
const { run, user, reservedLoan } = kit;
const appUrl = "https://lanbort.example";

async function deliverEvents() {
  while ((await processOutboxBatch(db, consumers, { batchSize: 100 })).claimed);
}

/** Runs the e-mail job until nothing is due. */
async function sendEmails(
  sender: MemoryEmailSender,
  options: NotificationEmailOptions = {},
) {
  while (
    (
      await deliverNotificationEmails(
        db,
        { sender, appUrl },
        { batchSize: 200, ...options },
      )
    ).claimed
  );
}

async function addressOf(actor: UserActor) {
  const { address } = await db
    .selectFrom("app.verified_contacts")
    .select("address")
    .where("user_id", "=", actor.userId)
    .where("kind", "=", "email")
    .executeTakeFirstOrThrow();

  return address;
}

/** Tells `actor` something directly, as a rule would. */
async function notify(
  actor: UserActor,
  kind: NotificationKind = "loan.cancelled",
  source = `test:${randomUUID()}`,
) {
  const target = { type: "loan" as const, id: randomUUID() };
  await recordNotifications(db, source, new Date(), [
    { recipientId: actor.userId, kind, target },
  ]);
  const { id } = await db
    .selectFrom("app.notifications")
    .select("id")
    .where("recipient_id", "=", actor.userId)
    .where("target_id", "=", target.id)
    .executeTakeFirstOrThrow();

  return {
    notificationId: id,
    again: () =>
      recordNotifications(db, source, new Date(), [
        { recipientId: actor.userId, kind, target },
      ]),
  };
}

/** The e-mail deliveries queued for `actor`, oldest first. */
function deliveriesOf(actor: UserActor) {
  return db
    .selectFrom("app.notification_deliveries as delivery")
    .innerJoin(
      "app.notifications as notification",
      "notification.id",
      "delivery.notification_id",
    )
    .select([
      "delivery.id",
      "notification.kind",
      "delivery.status",
      "delivery.code",
      "delivery.attempts",
    ])
    .where("notification.recipient_id", "=", actor.userId)
    .orderBy("notification.position")
    .execute();
}

async function makeDue(actor: UserActor) {
  await db
    .updateTable("app.notification_deliveries")
    .set({ available_at: sql<Date>`now() - interval '1 second'` })
    .where("status", "=", "pending")
    .where("notification_id", "in", (eb) =>
      eb
        .selectFrom("app.notifications")
        .select("id")
        .where("recipient_id", "=", actor.userId),
    )
    .execute();
}

describe("which notifications go out by e-mail (PS-COM-003, pilot standard)", () => {
  it("queues required notifications by default, action and information only when chosen", async () => {
    const anna = await user();
    const bo = await user();
    const cia = await user();

    await notify(anna, "loan.cancelled");
    await run(sendFriendRequest, bo, { userId: anna.userId });
    await deliverEvents();
    expect(await deliveriesOf(anna)).toEqual([
      expect.objectContaining({ kind: "loan.cancelled", status: "pending" }),
    ]);

    await run(setNotificationPreference, anna, {
      level: "action",
      channel: "email",
      enabled: true,
    });
    await run(sendFriendRequest, cia, { userId: anna.userId });
    await notify(anna, "social.friend_request_accepted");
    await deliverEvents();
    expect((await deliveriesOf(anna)).map((delivery) => delivery.kind)).toEqual(
      ["loan.cancelled", "social.friend_request"],
    );

    await run(setNotificationPreference, anna, {
      level: "information",
      channel: "email",
      enabled: true,
    });
    await notify(anna, "social.friend_request_accepted");
    expect((await deliveriesOf(anna)).map((delivery) => delivery.kind)).toEqual(
      [
        "loan.cancelled",
        "social.friend_request",
        "social.friend_request_accepted",
      ],
    );

    // Information that is not in the app does not go out either: the
    // e-mail leads back to it.
    await run(setNotificationPreference, anna, {
      level: "information",
      channel: "in_app",
      enabled: false,
    });
    await recordNotifications(db, `test:${randomUUID()}`, new Date(), [
      {
        recipientId: anna.userId,
        kind: "social.friend_request_accepted",
        target: { type: "user", id: bo.userId },
      },
    ]);
    expect(await deliveriesOf(anna)).toHaveLength(3);
  });

  it("queues each notification once, and catches up on one an interrupted run did not", async () => {
    const anna = await user();
    const { again } = await notify(anna);
    const [queued] = await deliveriesOf(anna);

    // The same source again: nothing new.
    await again();
    expect(await deliveriesOf(anna)).toEqual([queued]);

    // A run that made the notification but stopped before queueing it.
    await db
      .deleteFrom("app.notification_deliveries")
      .where("id", "=", queued!.id)
      .execute();
    await again();
    expect(await deliveriesOf(anna)).toEqual([
      expect.objectContaining({ kind: "loan.cancelled", status: "pending" }),
    ]);
  });

  it("tells the borrower of an approved loan by e-mail, through the outbox", async () => {
    const { borrower, loanId } = await reservedLoan();
    await deliverEvents();
    const sender = new MemoryEmailSender();
    await sendEmails(sender);

    expect(await deliveriesOf(borrower)).toEqual([
      expect.objectContaining({ kind: "loan.approved", status: "sent" }),
    ]);
    const [email] = sender.to(await addressOf(borrower));
    expect(email?.subject).toBe("Et lån er godkjent");
    // Only the kind and a link to the notification, never the loan itself.
    expect(JSON.stringify(email)).not.toContain(loanId);
  });
});

describe("sending (WP-41)", () => {
  it("sends each e-mail once with only the kind and a link, however often and concurrently the job runs", async () => {
    const anna = await user();
    const address = await addressOf(anna);
    const { notificationId } = await notify(anna, "loan.return_day_passed");
    const sender = new MemoryEmailSender();

    await Promise.all([
      sendEmails(sender),
      sendEmails(sender),
      sendEmails(sender),
    ]);
    await sendEmails(sender);

    expect(sender.attemptsTo(address)).toHaveLength(1);
    const [email] = sender.to(address);
    const link = `${appUrl}/?varsel=${notificationId}`;
    expect(email).toEqual({
      to: address,
      subject: "Siste dag for et lån er passert uten avklart retur",
      text: expect.stringContaining(link),
      html: expect.stringContaining(`href="${link}"`),
      idempotencyKey: expect.stringMatching(/^notification-email\//),
    });
    // No name, no other person, no object: only the kind and the link.
    expect(email?.text).not.toContain("Test Testesen");
    expect(await deliveriesOf(anna)).toEqual([
      expect.objectContaining({ status: "sent", code: null, attempts: 1 }),
    ]);

    // Sending changes nothing about the notification itself.
    const notification = await db
      .selectFrom("app.notifications")
      .select("read_at")
      .where("id", "=", notificationId)
      .executeTakeFirstOrThrow();
    expect(notification.read_at).toBeNull();
  });

  it("retries a failed send with the same key, and gives up on one the provider refuses", async () => {
    const anna = await user();
    const bo = await user();
    const sender = new MemoryEmailSender();
    sender.fail(
      await addressOf(anna),
      new EmailSendError("rate_limited", true),
      new EmailSendError("provider_unavailable", true),
    );
    sender.fail(await addressOf(bo), new EmailSendError("rejected", false));
    await notify(anna);
    await notify(bo);

    await sendEmails(sender);
    expect(await deliveriesOf(anna)).toEqual([
      expect.objectContaining({
        status: "pending",
        code: "rate_limited",
        attempts: 1,
      }),
    ]);
    expect(await deliveriesOf(bo)).toEqual([
      expect.objectContaining({
        status: "dead",
        code: "rejected",
        attempts: 1,
      }),
    ]);

    // Not due yet: a new run leaves it alone.
    await sendEmails(sender);
    expect(sender.attemptsTo(await addressOf(anna))).toHaveLength(1);

    await makeDue(anna);
    await sendEmails(sender);
    await makeDue(anna);
    await sendEmails(sender);
    expect(await deliveriesOf(anna)).toEqual([
      expect.objectContaining({ status: "sent", code: null, attempts: 3 }),
    ]);
    const attempts = sender.attemptsTo(await addressOf(anna));
    expect(attempts).toHaveLength(3);
    expect(new Set(attempts.map((email) => email.idempotencyKey)).size).toBe(1);
    expect(sender.to(await addressOf(bo))).toEqual([]);
  });

  it("parks an e-mail as dead after the last attempt", async () => {
    const anna = await user();
    const sender = new MemoryEmailSender();
    sender.fail(
      await addressOf(anna),
      ...Array.from(
        { length: 3 },
        () => new EmailSendError("provider_unavailable", true),
      ),
    );
    await notify(anna);

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await makeDue(anna);
      await sendEmails(sender, { maxAttempts: 3 });
    }

    expect(await deliveriesOf(anna)).toEqual([
      expect.objectContaining({
        status: "dead",
        code: "provider_unavailable",
        attempts: 3,
      }),
    ]);
  });
});

describe("e-mails no longer worth sending", () => {
  it("are skipped once read in the app, turned off, without an address, or too old", async () => {
    const sender = new MemoryEmailSender();

    const read = await user();
    const { notificationId } = await notify(read);
    await run(markNotificationsRead, read, {
      notificationIds: [notificationId],
    });

    const turnedOff = await user();
    await run(setNotificationPreference, turnedOff, {
      level: "action",
      channel: "email",
      enabled: true,
    });
    await notify(turnedOff, "social.friend_request");
    await run(setNotificationPreference, turnedOff, {
      level: "action",
      channel: "email",
      enabled: false,
    });

    const withoutAddress = await user();
    await notify(withoutAddress);
    await db
      .deleteFrom("app.verified_contacts")
      .where("user_id", "=", withoutAddress.userId)
      .execute();

    await sendEmails(sender);

    for (const [actor, code] of [
      [read, "read"],
      [turnedOff, "turned_off"],
      [withoutAddress, "no_address"],
    ] as const) {
      expect(await deliveriesOf(actor)).toEqual([
        expect.objectContaining({ status: "skipped", code, attempts: 1 }),
      ]);
    }
    expect(sender.to(await addressOf(read))).toEqual([]);
    expect(sender.to(await addressOf(turnedOff))).toEqual([]);

    const late = await user();
    await notify(late);
    await sendEmails(sender, {
      clock: () => new Date(Date.now() + notificationEmailMaxAgeMs + 60_000),
    });
    expect(await deliveriesOf(late)).toEqual([
      expect.objectContaining({ status: "skipped", code: "expired" }),
    ]);
    expect(sender.to(await addressOf(late))).toEqual([]);
  });
});
