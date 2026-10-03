import { randomUUID } from "node:crypto";
import type { Notification } from "@lanbort/contracts";
import { afterAll, describe, expect, it } from "vitest";
import { systemActor, type UserActor } from "../actor";
import { authorizeActor } from "../authorization/policy";
import { executeQuery } from "../commands/query";
import { leaveEnvironment } from "../environment/membership-commands";
import { reportHandover } from "../loans/handover";
import { reportReturn } from "../loans/return";
import { stillConcerns } from "../notifications/concerns";
import { notificationGenerator } from "../notifications/generator";
import { listNotifications } from "../notifications/queries";
import { updateObject } from "../objects/commands";
import {
  liftObjectRestriction,
  setObjectRestriction,
} from "../objects/restrictions";
import { ConsumerRegistry } from "../outbox/consumer";
import { processOutboxBatch } from "../outbox/worker";
import { publishObject } from "../publications/commands";
import { blockUser } from "../social/commands";
import { connectTestDatabase } from "../testing/database";
import { loanTestKit } from "../testing/loans";
import {
  commitWhileRacing,
  endMembership,
  notifiedSince,
} from "../testing/races";
import { objectAvailabilityWatcher } from "./availability";
import {
  lookAtSubscribedObjects,
  subscribeToObject,
  unsubscribeFromObject,
} from "./commands";
import {
  lookAtSubscribedObjectsPolicy,
  objectAvailabilityProcess,
} from "./policies";
import { lookAgain as lookAgainAt } from "./store";
import { listObjectSubscriptions } from "./queries";

/**
 * WP-63: object subscriptions (PS-OBJ-014). Events go through the real
 * outbox to the notification generator and the availability watcher; each
 * test checks who is told, and just as much who is not.
 */
const db = connectTestDatabase();
afterAll(() => db.destroy());

const consumers = new ConsumerRegistry([
  notificationGenerator({ db: () => db }),
  objectAvailabilityWatcher({ db: () => db }),
]);
const kit = loanTestKit(db, { consumers });
const {
  run,
  tick,
  user,
  environment,
  join,
  member,
  versionOf,
  published,
  reservedLoan,
} = kit;

const oneDay = 24 * 60 * 60 * 1000;
const notFound = { code: "not_found" };

async function deliver() {
  while ((await processOutboxBatch(db, consumers, { batchSize: 100 })).claimed);
}

/** The actor's notifications about subscriptions, oldest first. */
async function told(actor: UserActor) {
  await deliver();
  const { notifications } = await executeQuery(tick(), listNotifications, {
    actor,
    input: {},
  });

  return [...notifications]
    .reverse()
    .filter(({ target }) => target.type === "object_subscription");
}

const kinds = async (actor: UserActor) =>
  (await told(actor)).map(({ kind }: Notification) => kind);

const subscribe = (actor: UserActor, objectId: string) =>
  run(subscribeToObject, actor, { objectId });

const subscriptions = (actor: UserActor) =>
  executeQuery(tick(), listObjectSubscriptions, { actor, input: {} });

/** The scheduled job, as its route runs it. */
const lookAgain = () => {
  authorizeActor(lookAtSubscribedObjectsPolicy, {
    actor: systemActor(objectAvailabilityProcess),
    now: kit.now(),
  });
  return lookAtSubscribedObjects(db, kit.now());
};

async function edit(owner: UserActor, objectId: string, change: object) {
  await run(updateObject, owner, {
    objectId,
    expectedVersion: await versionOf(objectId),
    ...change,
  });
}

async function restrict(owner: UserActor, objectId: string) {
  const { restrictionId } = await run(setObjectRestriction, owner, {
    objectId,
    period: null,
  });

  return () => run(liftObjectRestriction, owner, { objectId, restrictionId });
}

describe("subscribing (PS-OBJ-014)", () => {
  it("needs the object to be found in one of the caller's environments", async () => {
    const { environmentId, borrower, objectId, publicationId } =
      await published();
    const stranger = await user();

    await expect(subscribe(stranger, objectId)).rejects.toMatchObject(notFound);
    expect(await subscribe(borrower, objectId)).toEqual({
      objectId,
      subscribed: true,
    });
    // Again: nothing changes.
    await subscribe(borrower, objectId);

    const { subscriptions: list, nextCursor } = await subscriptions(borrower);
    expect(nextCursor).toBeNull();
    expect(list).toEqual([
      {
        id: expect.any(String),
        objectId,
        createdAt: expect.any(String),
        active: true,
        object: expect.objectContaining({
          title: "Tilhenger",
          availableForNewLoans: true,
          foundIn: [{ environmentId, publicationId }],
        }),
      },
    ]);
  });

  it("never reaches into a hidden environment the caller is not in", async () => {
    const admin = await user();
    const hidden = await environment(admin, {
      name: "Skjult",
      type: "hidden",
    });
    const owner = await member(hidden, admin);
    const objectId = await kit.create(owner);
    await run(publishObject, owner, { objectId, environmentId: hidden });

    await expect(subscribe(await user(), objectId)).rejects.toMatchObject(
      notFound,
    );
    await subscribe(await member(hidden, admin), objectId);
  });

  it("goes inactive when access goes, shows nothing then, and can still be ended", async () => {
    const { environmentId, owner, borrower, objectId } = await published();
    await subscribe(borrower, objectId);

    await run(leaveEnvironment, borrower, { environmentId });
    expect((await subscriptions(borrower)).subscriptions).toEqual([
      expect.objectContaining({ objectId, active: false, object: null }),
    ]);

    // Nothing about the object is told while it is inactive.
    const lift = await restrict(owner, objectId);
    await deliver();
    await lift();
    expect(await told(borrower)).toEqual([]);

    expect(await run(unsubscribeFromObject, borrower, { objectId })).toEqual({
      objectId,
      subscribed: false,
    });
    expect((await subscriptions(borrower)).subscriptions).toEqual([]);
  });

  it("follows access through another environment where the object is found", async () => {
    const { environmentId, owner, borrower, objectId } = await published();
    const otherAdmin = await user();
    const other = await environment(otherAdmin, { name: "Hagelaget" });
    await join(other, otherAdmin, owner);
    await join(other, otherAdmin, borrower);
    const { publicationId } = await run(publishObject, owner, {
      objectId,
      environmentId: other,
    });
    await subscribe(borrower, objectId);

    await run(leaveEnvironment, borrower, { environmentId });

    expect((await subscriptions(borrower)).subscriptions[0]).toMatchObject({
      active: true,
      object: { foundIn: [{ environmentId: other, publicationId }] },
    });
  });
});

describe("changes to the object's content (OD-0019)", () => {
  it("tell subscribers nothing while it is open which changes are told", async () => {
    const { owner, borrower, objectId } = await published();
    await subscribe(borrower, objectId);

    await edit(owner, objectId, { description: "Nå med nytt dekk." });
    await edit(owner, objectId, { title: "Tilhenger med dekk" });

    expect(await told(borrower)).toEqual([]);
    // What the subscription shows is the object as it is now.
    expect((await subscriptions(borrower)).subscriptions[0]).toMatchObject({
      active: true,
      object: { title: "Tilhenger med dekk" },
    });
  });
});

describe("becoming available again (vision 04, «Abonnement»)", () => {
  it("is told when a restriction on every date is lifted, and not before", async () => {
    const { owner, borrower, objectId } = await published();
    const lift = await restrict(owner, objectId);
    await subscribe(borrower, objectId);
    expect(
      (await subscriptions(borrower)).subscriptions[0]!.object,
    ).toMatchObject({ availableForNewLoans: false });

    await lookAgain();
    expect(await told(borrower)).toEqual([]);

    await lift();
    const [notification] = await told(borrower);
    expect(notification).toMatchObject({
      kind: "object.available",
      level: "information",
    });

    // Looking again tells nothing new; another round does, once the
    // restriction was seen. (Set and lifted before anyone looked, it never
    // made the object unavailable as far as subscribers know.)
    await lookAgain();
    await deliver();
    expect(await kinds(borrower)).toEqual(["object.available"]);
    const liftAgain = await restrict(owner, objectId);
    await deliver();
    await liftAgain();
    expect(await kinds(borrower)).toEqual([
      "object.available",
      "object.available",
    ]);
  });

  it("is not told to a subscriber the owner has blocked since", async () => {
    const { owner, borrower, objectId } = await published();
    const lift = await restrict(owner, objectId);
    await subscribe(borrower, objectId);
    await deliver();

    await run(blockUser, owner, { userId: borrower.userId });
    await lift();

    expect(await told(borrower)).toEqual([]);
    expect((await subscriptions(borrower)).subscriptions[0]).toMatchObject({
      active: false,
      object: null,
    });
  });

  it("is not told to a subscriber without access, nor later when access returns", async () => {
    const { admin, environmentId, owner, borrower, objectId } =
      await published();
    const lift = await restrict(owner, objectId);
    await subscribe(borrower, objectId);
    await deliver();

    await run(leaveEnvironment, borrower, { environmentId });
    await lift();
    expect(await told(borrower)).toEqual([]);

    await join(environmentId, admin, borrower);
    await lookAgain();
    expect(await told(borrower)).toEqual([]);
  });

  it("is told when an overdue object comes back, once the job saw it was gone", async () => {
    // Days 0–2 lent out, the rest of the time free.
    const { owner, borrower, objectId, loanId, environmentId, admin } =
      await reservedLoan(0, 2);
    const subscriber = await member(environmentId, admin);
    await subscribe(subscriber, objectId);
    await run(reportHandover, owner, {
      loanId,
      agreementVersion: 1,
      outcome: "handed_over",
    });
    await deliver();

    // The return day passes without a return: nobody knows where it is, so
    // it is not available. Only time changed that, and the job sees it.
    kit.advance(3 * oneDay);
    await lookAgain();
    expect(
      (await subscriptions(subscriber)).subscriptions[0]!.object,
    ).toMatchObject({ availableForNewLoans: false });
    expect(await told(subscriber)).toEqual([]);

    await run(reportReturn, owner, {
      loanId,
      agreementVersion: 1,
      outcome: "received",
      immediately: true,
    });
    expect(await kinds(subscriber)).toEqual(["object.available"]);
    expect(await told(borrower)).toEqual([]);
  });

  it("is told once when the job and an event look at the same time", async () => {
    const { owner, borrower, objectId } = await published();
    const lift = await restrict(owner, objectId);
    await subscribe(borrower, objectId);
    await deliver();

    await lift();
    await Promise.all([lookAgain(), deliver(), lookAgain(), deliver()]);

    expect(await kinds(borrower)).toEqual(["object.available"]);
  });
});

describe("racing the end of access (PS-OBJ-014)", () => {
  /**
   * A subscriber whose last look saw the object unavailable, so the next
   * look tells them it is available. Set directly, after the setup's events
   * were handled, so nothing else looks first.
   */
  async function aboutToBeTold() {
    const setup = await published();
    await subscribe(setup.borrower, setup.objectId);
    await deliver();
    await db
      .updateTable("app.object_subscriptions")
      .set({ available: false })
      .where("user_id", "=", setup.borrower.userId)
      .where("object_id", "=", setup.objectId)
      .execute();

    return setup;
  }

  /** What the availability watcher does for an event about the object. */
  const look = (objectId: string) => () =>
    lookAgainAt(
      db,
      { objectIds: [objectId] },
      `race:${randomUUID()}`,
      kit.now(),
    );

  it("tells nothing to a subscriber who loses access while it looks", async () => {
    const { environmentId, borrower, objectId } = await aboutToBeTold();

    const { changedAt } = await commitWhileRacing(
      db,
      endMembership(environmentId, borrower.userId, kit.now()),
      look(objectId),
    );

    expect(await notifiedSince(db, borrower.userId, changedAt)).toEqual([]);
  });

  it("tells nothing when the subscription ends while it looks", async () => {
    const { borrower, objectId } = await aboutToBeTold();

    const { changedAt } = await commitWhileRacing(
      db,
      (tx) =>
        tx
          .deleteFrom("app.object_subscriptions")
          .where("user_id", "=", borrower.userId)
          .where("object_id", "=", objectId)
          .execute(),
      look(objectId),
    );

    expect(await notifiedSince(db, borrower.userId, changedAt)).toEqual([]);
  });

  it("tells a subscriber whose access stays, so the race is real", async () => {
    const { borrower, objectId } = await aboutToBeTold();

    expect(await look(objectId)()).toBe(1);
    expect(await kinds(borrower)).toEqual(["object.available"]);
  });

  it("leaves nothing to deliver once access or the subscription is gone", async () => {
    const first = await aboutToBeTold();
    const second = await aboutToBeTold();
    await look(first.objectId)();
    await look(second.objectId)();
    const notifications = [
      { ...first, notification: (await told(first.borrower))[0]! },
      { ...second, notification: (await told(second.borrower))[0]! },
    ];
    const concerns = () =>
      Promise.all(
        notifications.map(({ borrower, notification }) =>
          stillConcerns(
            db,
            { recipientId: borrower.userId, target: notification.target },
            kit.now(),
          ),
        ),
      );
    expect(await concerns()).toEqual([true, true]);

    await run(leaveEnvironment, first.borrower, {
      environmentId: first.environmentId,
    });
    await run(unsubscribeFromObject, second.borrower, {
      objectId: second.objectId,
    });

    expect(await concerns()).toEqual([false, false]);
  });
});
