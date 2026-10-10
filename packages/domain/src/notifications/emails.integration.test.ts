import { randomUUID } from "node:crypto";
import type { NotificationKind } from "@lanbort/contracts";
import { EmailSendError, MemoryEmailSender } from "@lanbort/email/testing";
import type { Database } from "@lanbort/database";
import { type Kysely, sql } from "kysely";
import { afterAll, describe, expect, it } from "vitest";
import type { UserActor } from "../actor";
import { leaveEnvironment } from "../environment/membership-commands";
import { cancelLoan } from "../loans/cancellation";
import { ConsumerRegistry, defineConsumer } from "../outbox/consumer";
import { askObjectQuestion } from "../questions/commands";
import { sendFriendRequest } from "../social/commands";
import {
  subscribeToObject,
  unsubscribeFromObject,
} from "../subscriptions/commands";
import { connectTestDatabase } from "../testing/database";
import { deliverAll } from "../testing/outbox";
import { loanTestKit } from "../testing/loans";
import { commitWhileRacing, endMembership } from "../testing/races";
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
  await deliverAll(db, consumers);
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

  it("tells the other party of a cancelled loan by e-mail through the outbox, but not of the approval", async () => {
    const { borrower, owner, loanId } = await reservedLoan();
    await run(cancelLoan, owner, { loanId });
    await deliverEvents();
    const sender = new MemoryEmailSender();
    await sendEmails(sender);

    // Both are required; only the cancellation is time-critical.
    expect(await deliveriesOf(borrower)).toEqual([
      expect.objectContaining({ kind: "loan.cancelled", status: "sent" }),
    ]);
    const [email] = sender.to(await addressOf(borrower));
    expect(email?.subject).toBe("Et lån er kansellert");
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

/** True if `promise` has not settled after `ms`: it is waiting on a lock. */
async function stillWaiting(promise: Promise<unknown>, ms = 300) {
  const waiting = Symbol("waiting");
  const settled = await Promise.race([
    promise.then(
      () => undefined,
      () => undefined,
    ),
    new Promise((resolve) => setTimeout(() => resolve(waiting), ms)),
  ]);

  return settled === waiting;
}

/**
 * Each change that makes a queued e-mail pointless, made the way the app
 * makes it. A changed address is covered on its own below: the e-mail still
 * goes out, to the new one.
 */
const changes = [
  {
    name: "reading the notification in the app",
    kind: "loan.cancelled",
    code: "read",
    setup: async () => {},
    change: (actor: UserActor, notificationId: string) =>
      run(markNotificationsRead, actor, { notificationIds: [notificationId] }),
  },
  {
    name: "turning e-mail off",
    kind: "social.friend_request",
    code: "turned_off",
    setup: (actor: UserActor) =>
      run(setNotificationPreference, actor, {
        level: "action",
        channel: "email",
        enabled: true,
      }),
    change: (actor: UserActor) =>
      run(setNotificationPreference, actor, {
        level: "action",
        channel: "email",
        enabled: false,
      }),
  },
  {
    name: "removing the verified address",
    kind: "loan.cancelled",
    code: "no_address",
    setup: async () => {},
    change: (actor: UserActor) =>
      db
        .deleteFrom("app.verified_contacts")
        .where("user_id", "=", actor.userId)
        .execute(),
  },
] as const;

function changeAddress(actor: UserActor, address: string) {
  return db
    .updateTable("app.verified_contacts")
    .set({ address })
    .where("user_id", "=", actor.userId)
    .where("kind", "=", "email")
    .execute();
}

/**
 * Holds the e-mail job in the middle of sending to someone notified before
 * `actor`, so `actor`'s e-mail is claimed, with what was true then, but not
 * yet checked or sent.
 */
async function holdEarlierEmail(sender: MemoryEmailSender) {
  const earlier = await user();
  await notify(earlier);
  return sender.hold(await addressOf(earlier));
}

function runJob(sender: MemoryEmailSender) {
  return sendEmails(sender, { batchSize: 1000 });
}

describe("changes while the e-mail job runs (WP-41)", () => {
  for (const { name, kind, code, setup, change } of changes) {
    it(`stops an e-mail already claimed after ${name}`, async () => {
      const sender = new MemoryEmailSender();
      const earlier = await holdEarlierEmail(sender);
      const anna = await user();
      const address = await addressOf(anna);
      await setup(anna);
      const { notificationId } = await notify(anna, kind);

      const job = runJob(sender);
      await earlier.reached;
      await change(anna, notificationId);
      earlier.release();
      await job;

      expect(await deliveriesOf(anna)).toEqual([
        expect.objectContaining({ status: "skipped", code }),
      ]);
      expect(sender.attemptsTo(address)).toEqual([]);
    });

    it(`lets an e-mail being sent finish before ${name} returns`, async () => {
      const sender = new MemoryEmailSender();
      const anna = await user();
      const address = await addressOf(anna);
      await setup(anna);
      const { notificationId } = await notify(anna, kind);
      const held = sender.hold(address);

      const job = runJob(sender);
      await held.reached;
      const changing = change(anna, notificationId);
      expect(await stillWaiting(changing)).toBe(true);

      held.release();
      await Promise.all([job, changing]);
      // It was on its way before the change; nothing goes out after it.
      expect(sender.attemptsTo(address)).toHaveLength(1);
      expect(await deliveriesOf(anna)).toEqual([
        expect.objectContaining({ status: "sent" }),
      ]);
    });
  }

  it("holds the job while a change is not yet committed, and then honours it", async () => {
    const sender = new MemoryEmailSender();
    const earlier = await holdEarlierEmail(sender);
    const anna = await user();
    const address = await addressOf(anna);
    const { notificationId } = await notify(anna);
    let commit!: () => void;
    const committed = new Promise<void>((resolve) => (commit = resolve));
    let changed!: () => void;
    const changedInTransaction = new Promise<void>(
      (resolve) => (changed = resolve),
    );

    const job = runJob(sender);
    await earlier.reached;
    const reading = db.transaction().execute(async (tx) => {
      await tx
        .updateTable("app.notifications")
        .set({ read_at: new Date() })
        .where("id", "=", notificationId)
        .execute();
      changed();
      await committed;
    });
    await changedInTransaction;
    earlier.release();
    expect(await stillWaiting(job)).toBe(true);

    commit();
    await Promise.all([reading, job]);
    expect(await deliveriesOf(anna)).toEqual([
      expect.objectContaining({ status: "skipped", code: "read" }),
    ]);
    expect(sender.attemptsTo(address)).toEqual([]);
  });

  it("sends an e-mail claimed before the address changed to the new address only", async () => {
    const sender = new MemoryEmailSender();
    const earlier = await holdEarlierEmail(sender);
    const anna = await user();
    const oldAddress = await addressOf(anna);
    const newAddress = `${randomUUID()}@lanbort.test`;
    await notify(anna);

    const job = runJob(sender);
    await earlier.reached;
    await changeAddress(anna, newAddress);
    earlier.release();
    await job;

    expect(sender.attemptsTo(oldAddress)).toEqual([]);
    expect(sender.to(newAddress)).toHaveLength(1);
  });

  it("lets an e-mail being sent finish before an address change returns", async () => {
    const sender = new MemoryEmailSender();
    const anna = await user();
    const oldAddress = await addressOf(anna);
    await notify(anna);
    const held = sender.hold(oldAddress);

    const job = runJob(sender);
    await held.reached;
    const changing = changeAddress(anna, `${randomUUID()}@lanbort.test`);
    expect(await stillWaiting(changing)).toBe(true);

    held.release();
    await Promise.all([job, changing]);
    expect(sender.attemptsTo(oldAddress)).toHaveLength(1);
  });
});

/**
 * WP-63: a notification about a subscription or a question is seen only
 * through an environment (PS-OBJ-014–015). Once the subscription has ended
 * or the recipient no longer finds the object there, no e-mail goes out on
 * it (`stillConcerns`), and a change made while one is being sent waits for
 * it, as the WP-41 changes above do.
 */
const contexts = [
  {
    name: "a subscription",
    kind: "object.available",
    async target(setup: Awaited<ReturnType<typeof kit.published>>) {
      await run(subscribeToObject, setup.borrower, {
        objectId: setup.objectId,
      });
      const { id } = await db
        .selectFrom("app.object_subscriptions")
        .select("id")
        .where("user_id", "=", setup.borrower.userId)
        .where("object_id", "=", setup.objectId)
        .executeTakeFirstOrThrow();

      return { type: "object_subscription" as const, id };
    },
  },
  {
    name: "a question",
    kind: "object.question_replied",
    async target(setup: Awaited<ReturnType<typeof kit.published>>) {
      const { questionId } = await run(askObjectQuestion, setup.borrower, {
        environmentId: setup.environmentId,
        objectId: setup.objectId,
        body: "Er den lang nok til taket?",
      });

      return { type: "object_question" as const, id: questionId };
    },
  },
] as const;

type Setup = Awaited<ReturnType<typeof kit.published>>;

const accessChanges = [
  {
    name: "unsubscribing",
    contexts: ["a subscription"],
    change: (setup: Setup) =>
      run(unsubscribeFromObject, setup.borrower, { objectId: setup.objectId }),
    uncommitted: (setup: Setup) => (tx: Kysely<Database>) =>
      tx
        .deleteFrom("app.object_subscriptions")
        .where("user_id", "=", setup.borrower.userId)
        .where("object_id", "=", setup.objectId)
        .execute(),
  },
  {
    name: "leaving the environment",
    contexts: ["a subscription", "a question"],
    change: (setup: Setup) =>
      run(leaveEnvironment, setup.borrower, {
        environmentId: setup.environmentId,
      }),
    uncommitted: (setup: Setup) =>
      endMembership(setup.environmentId, setup.borrower.userId, kit.now()),
  },
] as const;

/**
 * The borrower, who chose e-mail for information, is told about `context`
 * in an environment they are a member of; the e-mail is queued.
 */
async function toldAbout(context: (typeof contexts)[number]) {
  const setup = await kit.published();
  await run(setNotificationPreference, setup.borrower, {
    level: "information",
    channel: "email",
    enabled: true,
  });
  await recordNotifications(db, `test:${randomUUID()}`, kit.now(), [
    {
      recipientId: setup.borrower.userId,
      kind: context.kind,
      target: await context.target(setup),
    },
  ]);

  return { setup, address: await addressOf(setup.borrower) };
}

/** The e-mail job at the test clock, at which access is decided. */
const runJobNow = (sender: MemoryEmailSender) =>
  sendEmails(sender, { batchSize: 1000, clock: () => kit.now() });

describe("e-mails about what is seen through an environment (WP-63)", () => {
  for (const context of contexts) {
    it(`sends one about ${context.name} while the recipient still has access`, async () => {
      const sender = new MemoryEmailSender();
      const { setup, address } = await toldAbout(context);

      await runJobNow(sender);
      expect(await deliveriesOf(setup.borrower)).toEqual([
        expect.objectContaining({ kind: context.kind, status: "sent" }),
      ]);
      expect(sender.to(address)).toHaveLength(1);
    });
  }

  for (const {
    name,
    contexts: affected,
    change,
    uncommitted,
  } of accessChanges) {
    for (const context of contexts.filter((c) =>
      (affected as readonly string[]).includes(c.name),
    )) {
      it(`sends none about ${context.name} after ${name}`, async () => {
        const sender = new MemoryEmailSender();
        const { setup, address } = await toldAbout(context);

        await change(setup);
        await runJobNow(sender);
        expect(await deliveriesOf(setup.borrower)).toEqual([
          expect.objectContaining({ status: "skipped", code: "no_access" }),
        ]);
        expect(sender.attemptsTo(address)).toEqual([]);
      });

      it(`lets an e-mail about ${context.name} being sent finish before ${name} returns`, async () => {
        const sender = new MemoryEmailSender();
        const { setup, address } = await toldAbout(context);
        const held = sender.hold(address);

        const job = runJobNow(sender);
        await held.reached;
        const changing = change(setup);
        expect(await stillWaiting(changing)).toBe(true);

        held.release();
        await Promise.all([job, changing]);
        // It was on its way before the change; nothing goes out after it.
        expect(sender.attemptsTo(address)).toHaveLength(1);
        expect(await deliveriesOf(setup.borrower)).toEqual([
          expect.objectContaining({ status: "sent" }),
        ]);
      });

      it(`holds the job while ${name} is not yet committed, and then sends none about ${context.name}`, async () => {
        const sender = new MemoryEmailSender();
        const { setup, address } = await toldAbout(context);

        await commitWhileRacing(db, uncommitted(setup), () =>
          runJobNow(sender),
        );
        expect(await deliveriesOf(setup.borrower)).toEqual([
          expect.objectContaining({ status: "skipped", code: "no_access" }),
        ]);
        expect(sender.attemptsTo(address)).toEqual([]);
      });
    }
  }
});
