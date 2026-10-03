import type { Notification } from "@lanbort/contracts";
import { afterAll, describe, expect, it } from "vitest";
import { systemActor, type UserActor } from "../actor";
import { executeQuery } from "../commands/query";
import { leaveEnvironment } from "../environment/membership-commands";
import { reportHandover } from "../loans/handover";
import { reportReturn } from "../loans/return";
import { markNotificationsRead } from "../notifications/commands";
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
import { objectAvailabilityWatcher } from "./availability";
import {
  lookAtSubscribedObjects,
  subscribeToObject,
  unsubscribeFromObject,
} from "./commands";
import { objectAvailabilityProcess } from "./policies";
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

const lookAgain = () =>
  run(lookAtSubscribedObjects, systemActor(objectAvailabilityProcess), {});

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
    await edit(owner, objectId, { title: "Ny tilhenger" });
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

describe("changes to the object (vision 06, «Informasjonsvarsler»)", () => {
  it("are told once until read, and not for availability alone", async () => {
    const { owner, borrower, objectId } = await published();
    await subscribe(borrower, objectId);
    const [subscription] = (await subscriptions(borrower)).subscriptions;

    await edit(owner, objectId, { description: "Nå med nytt dekk." });
    await edit(owner, objectId, { title: "Tilhenger med dekk" });
    const first = await told(borrower);
    expect(
      first.map(({ kind, level, target }) => ({ kind, level, target })),
    ).toEqual([
      {
        kind: "object.changed",
        level: "information",
        target: { type: "object_subscription", id: subscription!.id },
      },
    ]);

    await run(markNotificationsRead, borrower, {
      notificationIds: [first[0]!.id],
    });
    await edit(owner, objectId, {
      availability: [{ start: kit.day(0), end: kit.day(60) }],
    });
    expect(await told(borrower)).toHaveLength(1);

    await edit(owner, objectId, { loanTerms: "Må vaskes." });
    expect(await kinds(borrower)).toEqual(["object.changed", "object.changed"]);
    // The owner who made the change is not a subscriber and is told nothing.
    expect(await told(owner)).toEqual([]);
  });

  it("are not told to a subscriber the owner has blocked since", async () => {
    const { owner, borrower, objectId } = await published();
    await subscribe(borrower, objectId);

    await run(blockUser, owner, { userId: borrower.userId });
    await edit(owner, objectId, { description: "Ny beskrivelse." });

    expect(await told(borrower)).toEqual([]);
    expect((await subscriptions(borrower)).subscriptions[0]).toMatchObject({
      active: false,
      object: null,
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
