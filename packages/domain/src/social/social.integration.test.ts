import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import type { UserActor } from "../actor";
import { resolveUserActor } from "../account/identity";
import { deactivateAccount, reactivateAccount } from "../account/lifecycle";
import { type DomainContext, executeCommand } from "../commands/command";
import { executeQuery } from "../commands/query";
import { ConsumerRegistry } from "../outbox/consumer";
import { connectTestDatabase } from "../testing/database";
import { registerTestUser, testIdentity } from "../testing/identities";
import {
  acceptFriendRequest,
  blockUser,
  declineFriendRequest,
  liftUserBlock,
  removeFriend,
  sendFriendRequest,
  withdrawFriendRequest,
} from "./commands";
import { socialRelationBetween } from "./pair";
import { getSocialOverview, getSocialRelation } from "./queries";

const db = connectTestDatabase();
afterAll(() => db.destroy());
const domain: DomainContext = { db, consumers: new ConsumerRegistry() };

/** Every social command has the same shape. */
type SocialCommand = typeof sendFriendRequest;

const run = (
  command: SocialCommand,
  actor: UserActor,
  other: UserActor | string,
  idempotencyKey: string = randomUUID(),
) =>
  executeCommand(domain, command, {
    actor,
    input: { userId: typeof other === "string" ? other : other.userId },
    idempotencyKey,
  });

const relation = (actor: UserActor, other: UserActor | string) =>
  executeQuery(domain, getSocialRelation, {
    actor,
    input: { userId: typeof other === "string" ? other : other.userId },
  });

const overview = (actor: UserActor) =>
  executeQuery(domain, getSocialOverview, { actor, input: {} });

const ids = (contacts: readonly { userId: string }[]) =>
  contacts.map((contact) => contact.userId);

/** Three freshly registered users; tests use as many as they need. */
async function users(): Promise<[UserActor, UserActor, UserActor]> {
  const [a, b, c] = await Promise.all(
    [1, 2, 3].map(async () => (await registerTestUser(domain)).actor),
  );

  return [a!, b!, c!];
}

async function friends(a: UserActor, b: UserActor) {
  await run(sendFriendRequest, a, b);
  await run(acceptFriendRequest, b, a);
}

/** Every relation row between the two, oldest first. */
async function relationsBetween(a: UserActor, b: UserActor) {
  return db
    .selectFrom("app.friendships")
    .select(["id", "status", "requester_id", "end_reason"])
    .where((eb) =>
      eb.or([
        eb.and([
          eb("requester_id", "=", a.userId),
          eb("addressee_id", "=", b.userId),
        ]),
        eb.and([
          eb("requester_id", "=", b.userId),
          eb("addressee_id", "=", a.userId),
        ]),
      ]),
    )
    .orderBy("requested_at")
    .execute();
}

async function eventsFor(resourceIds: readonly string[]) {
  if (resourceIds.length === 0) {
    return [];
  }

  return db
    .selectFrom("app.audit_events")
    .select(["event_type", "kind", "actor_user_id", "payload"])
    .where("resource_id", "in", resourceIds)
    .orderBy("position")
    .execute();
}

describe("friendship (PS-USR-003)", () => {
  it("starts only when the recipient accepts, and either friend can end it", async () => {
    const [anna, bo] = await users();

    expect((await run(sendFriendRequest, anna, bo)).output).toEqual({
      userId: bo.userId,
      friendship: "outgoing_pending",
      blockedByMe: false,
      canRequest: false,
    });
    expect(await relation(bo, anna)).toEqual({
      userId: anna.userId,
      friendship: "incoming_pending",
      blockedByMe: false,
      canRequest: false,
    });
    expect(ids((await overview(anna)).outgoingRequests)).toEqual([bo.userId]);
    expect((await overview(bo)).incomingRequests).toEqual([
      {
        userId: anna.userId,
        realName: "Test Testesen",
        profileId: anna.userId,
        pictureId: null,
        since: expect.any(String),
      },
    ]);

    // The requester cannot accept their own request.
    await expect(run(acceptFriendRequest, anna, bo)).rejects.toMatchObject({
      code: "conflict",
    });

    expect((await run(acceptFriendRequest, bo, anna)).output).toMatchObject({
      friendship: "friends",
    });
    expect(ids((await overview(anna)).friends)).toEqual([bo.userId]);
    expect(ids((await overview(bo)).friends)).toEqual([anna.userId]);

    expect((await run(removeFriend, bo, anna)).output).toMatchObject({
      friendship: "none",
    });
    expect((await overview(anna)).friends).toEqual([]);

    const [ended] = await relationsBetween(anna, bo);
    expect(ended).toMatchObject({ status: "ended", end_reason: "removed" });
    expect(await eventsFor([ended!.id])).toEqual([
      {
        event_type: "friendship.requested",
        kind: "domain",
        actor_user_id: anna.userId,
        payload: {},
      },
      {
        event_type: "friendship.accepted",
        kind: "domain",
        actor_user_id: bo.userId,
        payload: {},
      },
      {
        event_type: "friendship.removed",
        kind: "domain",
        actor_user_id: bo.userId,
        payload: {},
      },
    ]);
  });

  it("lets the recipient decline and the requester withdraw, and never reopens an ended relation", async () => {
    const [anna, bo] = await users();

    await run(sendFriendRequest, anna, bo);
    expect((await run(declineFriendRequest, bo, anna)).output).toMatchObject({
      friendship: "none",
    });
    // The requester cannot decline, and the recipient cannot withdraw.
    await run(sendFriendRequest, bo, anna);
    await expect(run(declineFriendRequest, bo, anna)).rejects.toMatchObject({
      code: "conflict",
    });
    await expect(run(withdrawFriendRequest, anna, bo)).rejects.toMatchObject({
      code: "conflict",
    });
    expect((await run(withdrawFriendRequest, bo, anna)).output).toMatchObject({
      friendship: "none",
    });
    // A friendship cannot be removed before it exists.
    await run(sendFriendRequest, anna, bo);
    await expect(run(removeFriend, anna, bo)).rejects.toMatchObject({
      code: "conflict",
    });

    expect(
      (await relationsBetween(anna, bo)).map((row) => [
        row.status,
        row.end_reason,
      ]),
    ).toEqual([
      ["ended", "declined"],
      ["ended", "withdrawn"],
      ["pending", null],
    ]);
  });

  it("refuses requests to oneself, unknown users and unfinished accounts alike", async () => {
    const [anna] = await users();
    const unfinished = (await resolveUserActor(domain, testIdentity()))!;

    for (const target of [anna.userId, randomUUID(), unfinished.userId]) {
      await expect(run(sendFriendRequest, anna, target)).rejects.toMatchObject({
        code: "not_found",
      });
    }

    // An account that has not completed registration cannot make requests.
    await expect(
      run(sendFriendRequest, unfinished, anna),
    ).rejects.toMatchObject({ code: "registration_required" });
  });
});

describe("a declined request (PS-USR-012)", () => {
  /** The error a call fails with, as the caller gets it. */
  const refusal = (call: Promise<unknown>) =>
    call.then(
      () => null,
      (error: { code: string; message: string; fields: unknown }) => ({
        code: error.code,
        message: error.message,
        fields: error.fields,
      }),
    );

  it("holds the sender back, refused and shown like any request that cannot be sent now", async () => {
    const [anna, bo, cleo] = await users();
    await run(sendFriendRequest, anna, bo);
    await run(declineFriendRequest, bo, anna);
    const rows = await relationsBetween(anna, bo);
    const events = await eventsFor(rows.map((row) => row.id));

    // The same refusal as for a request to someone Anna blocks herself.
    await run(blockUser, anna, cleo);
    const toBlocked = await refusal(run(sendFriendRequest, anna, cleo));
    expect(await refusal(run(sendFriendRequest, anna, bo))).toEqual(toBlocked);
    expect(toBlocked).toMatchObject({ code: "forbidden" });

    // Nothing changed or was recorded, and nothing names the decline.
    expect(await relationsBetween(anna, bo)).toEqual(rows);
    expect(await eventsFor(rows.map((row) => row.id))).toEqual(events);
    expect(await relation(anna, bo)).toEqual({
      userId: bo.userId,
      friendship: "none",
      blockedByMe: false,
      canRequest: false,
    });
    expect(await overview(anna)).toEqual({
      friends: [],
      incomingRequests: [],
      outgoingRequests: [],
      blocked: [expect.objectContaining({ userId: cleo.userId })],
    });

    // Bo can still ask.
    expect(await relation(bo, anna)).toMatchObject({ canRequest: true });
    expect((await run(sendFriendRequest, bo, anna)).output).toMatchObject({
      friendship: "outgoing_pending",
    });
  });

  it("is lifted for good by the recipient's own request, even one that is withdrawn or declined", async () => {
    const [anna, bo, cleo] = await users();

    await run(sendFriendRequest, anna, bo);
    await run(declineFriendRequest, bo, anna);
    await run(sendFriendRequest, bo, anna);
    await run(withdrawFriendRequest, bo, anna);
    expect(await relation(anna, bo)).toMatchObject({ canRequest: true });
    expect((await run(sendFriendRequest, anna, bo)).output).toMatchObject({
      friendship: "outgoing_pending",
    });

    // Declining the recipient's request holds the recipient back, not Anna.
    await run(sendFriendRequest, anna, cleo);
    await run(declineFriendRequest, cleo, anna);
    await run(sendFriendRequest, cleo, anna);
    await run(declineFriendRequest, anna, cleo);
    expect(await relation(cleo, anna)).toMatchObject({ canRequest: false });
    expect((await run(sendFriendRequest, anna, cleo)).output).toMatchObject({
      friendship: "outgoing_pending",
    });
  });

  it("stays when either of them blocks and lifts the block", async () => {
    const [anna, bo] = await users();
    await run(sendFriendRequest, anna, bo);
    await run(declineFriendRequest, bo, anna);

    for (const [blocker, blocked] of [
      [bo, anna],
      [anna, bo],
    ] as const) {
      await run(blockUser, blocker, blocked);
      await run(liftUserBlock, blocker, blocked);
    }

    await expect(run(sendFriendRequest, anna, bo)).rejects.toMatchObject({
      code: "forbidden",
    });
    expect(await relation(anna, bo)).toMatchObject({ canRequest: false });
  });

  it("is not placed by a withdrawn request, a removed friendship or a request a block closed", async () => {
    const [anna, bo, cleo] = await users();

    await run(sendFriendRequest, anna, bo);
    await run(withdrawFriendRequest, anna, bo);
    await run(sendFriendRequest, anna, bo);
    await run(acceptFriendRequest, bo, anna);
    await run(removeFriend, bo, anna);
    expect((await run(sendFriendRequest, anna, bo)).output).toMatchObject({
      friendship: "outgoing_pending",
    });

    await run(sendFriendRequest, anna, cleo);
    await run(blockUser, cleo, anna);
    await run(liftUserBlock, cleo, anna);
    expect((await run(sendFriendRequest, anna, cleo)).output).toMatchObject({
      friendship: "outgoing_pending",
    });
  });

  it("refuses every one of several simultaneous attempts", async () => {
    const [anna, bo] = await users();
    await run(sendFriendRequest, anna, bo);
    await run(declineFriendRequest, bo, anna);

    const attempts = await Promise.all(
      [1, 2, 3].map(() => refusal(run(sendFriendRequest, anna, bo))),
    );

    expect(attempts.map((attempt) => attempt?.code)).toEqual([
      "forbidden",
      "forbidden",
      "forbidden",
    ]);
    expect(await relationsBetween(anna, bo)).toHaveLength(1);
  });
});

describe("retries, double taps and races", () => {
  it("replays a retried request with the same key", async () => {
    const [anna, bo] = await users();
    const key = randomUUID();

    const first = await run(sendFriendRequest, anna, bo, key);
    const retries = await Promise.all(
      Array.from({ length: 4 }, () => run(sendFriendRequest, anna, bo, key)),
    );

    expect(retries).toEqual(
      Array.from({ length: 4 }, () => ({
        output: first.output,
        replayed: true,
      })),
    );
    // The key cannot be reused for another person.
    const [cleo] = await users();
    await expect(run(sendFriendRequest, anna, cleo, key)).rejects.toMatchObject(
      { code: "idempotency_key_reused" },
    );
  });

  it("creates one request and one event for a double tap with new keys", async () => {
    const [anna, bo] = await users();

    const results = await Promise.all(
      Array.from({ length: 5 }, () => run(sendFriendRequest, anna, bo)),
    );

    expect(new Set(results.map((r) => r.output.friendship))).toEqual(
      new Set(["outgoing_pending"]),
    );
    const rows = await relationsBetween(anna, bo);
    expect(rows).toHaveLength(1);
    expect(await eventsFor(rows.map((row) => row.id))).toHaveLength(1);
  });

  it("turns crossing requests into one pending request that the other accepts", async () => {
    for (let round = 0; round < 3; round++) {
      const [anna, bo] = await users();

      const [fromAnna, fromBo] = await Promise.all([
        run(sendFriendRequest, anna, bo),
        run(sendFriendRequest, bo, anna),
      ]);

      const rows = await relationsBetween(anna, bo);
      expect(rows).toHaveLength(1);
      const requester = rows[0]!.requester_id === anna.userId ? anna : bo;
      const recipient = requester === anna ? bo : anna;
      expect(
        [fromAnna.output.friendship, fromBo.output.friendship].sort(),
      ).toEqual(["incoming_pending", "outgoing_pending"]);

      await run(acceptFriendRequest, recipient, requester);
      expect(await relation(requester, recipient)).toMatchObject({
        friendship: "friends",
      });
    }
  });

  it("accepts once when the recipient double taps", async () => {
    const [anna, bo] = await users();
    await run(sendFriendRequest, anna, bo);

    const results = await Promise.all(
      Array.from({ length: 4 }, () => run(acceptFriendRequest, bo, anna)),
    );

    expect(results.map((r) => r.output.friendship)).toEqual(
      Array.from({ length: 4 }, () => "friends"),
    );
    const [row] = await relationsBetween(anna, bo);
    expect(
      (await eventsFor([row!.id])).map((event) => event.event_type),
    ).toEqual(["friendship.requested", "friendship.accepted"]);
  });

  it("never leaves a friendship open when a block races an accept", async () => {
    for (let round = 0; round < 4; round++) {
      const [anna, bo] = await users();
      await run(sendFriendRequest, anna, bo);

      await Promise.allSettled([
        run(acceptFriendRequest, bo, anna),
        run(blockUser, anna, bo),
      ]);

      expect(
        (await relationsBetween(anna, bo)).map((row) => row.status),
      ).toEqual(["ended"]);
      expect(await relation(anna, bo)).toEqual({
        userId: bo.userId,
        friendship: "none",
        blockedByMe: true,
        canRequest: false,
      });
    }
  });

  it("never shows a half-applied block in the overview or relation", async () => {
    for (let round = 0; round < 4; round++) {
      const [anna, bo] = await users();
      await friends(anna, bo);

      const [, ...reads] = await Promise.all([
        run(blockUser, anna, bo),
        ...Array.from({ length: 6 }, () =>
          Promise.all([overview(anna), relation(anna, bo)]),
        ),
      ]);

      for (const [seen, pair] of reads) {
        const friendsWithBo = ids(seen.friends).includes(bo.userId);
        const blocksBo = ids(seen.blocked).includes(bo.userId);
        expect(friendsWithBo && blocksBo).toBe(false);
        expect(pair.friendship === "friends" && pair.blockedByMe).toBe(false);
      }
    }
  });

  it("keeps both blocks when two users block each other at the same time", async () => {
    const [anna, bo] = await users();
    await friends(anna, bo);

    await Promise.all([run(blockUser, anna, bo), run(blockUser, bo, anna)]);

    const [ended] = await relationsBetween(anna, bo);
    expect(ended).toMatchObject({ status: "ended", end_reason: "blocked" });
    expect(ids((await overview(anna)).blocked)).toEqual([bo.userId]);
    expect(ids((await overview(bo)).blocked)).toEqual([anna.userId]);
  });
});

describe("blocking (PS-USR-006, PS-USR-007)", () => {
  it("ends an existing friendship without telling the other why", async () => {
    const [anna, bo] = await users();
    await friends(anna, bo);

    expect((await run(blockUser, anna, bo)).output).toEqual({
      userId: bo.userId,
      friendship: "none",
      blockedByMe: true,
      canRequest: false,
    });

    expect((await overview(bo)).friends).toEqual([]);
    const [ended] = await relationsBetween(anna, bo);
    const block = await db
      .selectFrom("app.user_blocks")
      .select("id")
      .where("blocker_id", "=", anna.userId)
      .executeTakeFirstOrThrow();

    // The block and the closure are audit events without payload, separate
    // from the friendship's domain events.
    expect(await eventsFor([ended!.id, block.id])).toEqual([
      expect.objectContaining({ event_type: "friendship.requested" }),
      expect.objectContaining({ event_type: "friendship.accepted" }),
      {
        event_type: "user_block.created",
        kind: "audit",
        actor_user_id: anna.userId,
        payload: {},
      },
      {
        event_type: "friendship.closed_by_block",
        kind: "audit",
        actor_user_id: anna.userId,
        payload: {},
      },
    ]);
  });

  it("ends pending requests in either direction", async () => {
    const [anna, bo, cleo] = await users();
    await run(sendFriendRequest, bo, anna);
    await run(sendFriendRequest, anna, cleo);

    await run(blockUser, anna, bo);
    await run(blockUser, anna, cleo);

    expect(await overview(anna)).toMatchObject({
      incomingRequests: [],
      outgoingRequests: [],
    });
    expect((await overview(bo)).outgoingRequests).toEqual([]);
    expect((await overview(cleo)).incomingRequests).toEqual([]);
  });

  it("makes the blocker look like a missing user to every ordinary call", async () => {
    const [anna, bo] = await users();
    await friends(anna, bo);
    await run(blockUser, anna, bo);
    const nobody = randomUUID();

    for (const command of [
      sendFriendRequest,
      acceptFriendRequest,
      declineFriendRequest,
      withdrawFriendRequest,
      removeFriend,
    ]) {
      const toBlocker = await run(command, bo, anna).catch((error) => error);
      const toNobody = await run(command, bo, nobody).catch((error) => error);

      expect(toBlocker).toMatchObject({ code: "not_found" });
      expect(toBlocker.code).toBe(toNobody.code);
      expect(toBlocker.fields).toEqual(toNobody.fields);
    }

    await expect(relation(bo, anna)).rejects.toMatchObject({
      code: "not_found",
    });
    expect(await overview(bo)).toEqual({
      friends: [],
      incomingRequests: [],
      outgoingRequests: [],
      blocked: [],
    });
  });

  it("stops the blocker's own requests until they lift the block", async () => {
    const [anna, bo] = await users();
    await run(blockUser, anna, bo);

    await expect(run(sendFriendRequest, anna, bo)).rejects.toMatchObject({
      code: "forbidden",
    });
    // A block is not undone by blocking again.
    expect((await run(blockUser, anna, bo)).output).toMatchObject({
      blockedByMe: true,
    });

    await run(liftUserBlock, anna, bo);
    await run(sendFriendRequest, anna, bo);
    expect(await relation(bo, anna)).toMatchObject({
      friendship: "incoming_pending",
    });
  });

  it("lets the blocked user block back, independently", async () => {
    const [anna, bo] = await users();
    await run(blockUser, anna, bo);

    // Blocking answers the same whether or not the other blocks you.
    expect((await run(blockUser, bo, anna)).output).toEqual({
      userId: anna.userId,
      friendship: "none",
      blockedByMe: true,
      canRequest: false,
    });

    // Anna lifting her block leaves Bo's in force, and the reverse.
    await run(liftUserBlock, anna, bo);
    await expect(run(sendFriendRequest, anna, bo)).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(run(sendFriendRequest, bo, anna)).rejects.toMatchObject({
      code: "forbidden",
    });

    await run(liftUserBlock, bo, anna);
    expect((await run(sendFriendRequest, bo, anna)).output).toMatchObject({
      friendship: "outgoing_pending",
    });
  });

  it("restores neither the friendship nor the requests when lifted", async () => {
    const [anna, bo, cleo] = await users();
    await friends(anna, bo);
    await run(sendFriendRequest, cleo, anna);
    await run(blockUser, anna, bo);
    await run(blockUser, anna, cleo);

    await run(liftUserBlock, anna, bo);
    await run(liftUserBlock, anna, cleo);

    expect(await overview(anna)).toEqual({
      friends: [],
      incomingRequests: [],
      outgoingRequests: [],
      blocked: [],
    });
    expect(await relation(bo, anna)).toMatchObject({ friendship: "none" });
    // Lifting twice changes nothing.
    expect((await run(liftUserBlock, anna, bo)).output).toMatchObject({
      blockedByMe: false,
    });
    const lifts = await db
      .selectFrom("app.user_blocks")
      .select("lifted_at")
      .where("blocker_id", "=", anna.userId)
      .execute();
    expect(lifts.every((row) => row.lifted_at !== null)).toBe(true);
  });

  it("is reported to later domains for new contact, not as a social relation", async () => {
    const [anna, bo] = await users();
    await friends(anna, bo);
    expect(await socialRelationBetween(db, anna.userId, bo.userId)).toEqual({
      friends: true,
      blockedEitherWay: false,
    });

    await run(blockUser, bo, anna);
    for (const [a, b] of [
      [anna, bo],
      [bo, anna],
    ] as const) {
      expect(await socialRelationBetween(db, a.userId, b.userId)).toEqual({
        friends: false,
        blockedEitherWay: true,
      });
    }
  });
});

describe("manipulated calls", () => {
  it("cannot touch a relation the caller is not part of", async () => {
    const [anna, bo, mallory] = await users();
    await run(sendFriendRequest, anna, bo);

    // Mallory names Anna, but only ever reaches her own pair with Anna.
    for (const command of [
      acceptFriendRequest,
      declineFriendRequest,
      withdrawFriendRequest,
      removeFriend,
    ]) {
      await run(command, mallory, anna).catch(() => undefined);
      await run(command, mallory, bo).catch(() => undefined);
    }

    expect(await relation(bo, anna)).toMatchObject({
      friendship: "incoming_pending",
    });
  });

  it("rejects extra or malformed fields instead of acting on them", async () => {
    const [anna, bo, cleo] = await users();

    for (const input of [
      { userId: bo.userId, requesterId: cleo.userId },
      { userId: bo.userId, actorId: cleo.userId },
      { userId: "not-a-uuid" },
      {},
    ]) {
      await expect(
        executeCommand(domain, sendFriendRequest, {
          actor: anna,
          input,
          idempotencyKey: randomUUID(),
        }),
      ).rejects.toMatchObject({ code: "invalid_input" });
    }

    expect(await relationsBetween(anna, bo)).toEqual([]);
  });

  it("treats upper-case ids as the same user", async () => {
    const [anna, bo] = await users();
    await run(sendFriendRequest, anna, bo);

    expect(
      (await run(sendFriendRequest, anna, bo.userId.toUpperCase())).output,
    ).toEqual({
      userId: bo.userId,
      friendship: "outgoing_pending",
      blockedByMe: false,
      canRequest: false,
    });
    expect(await relationsBetween(anna, bo)).toHaveLength(1);
  });
});

describe("an account that is not active (PS-ADM-002)", () => {
  const account = () => registerTestUser(domain);
  type Account = Awaited<ReturnType<typeof account>>;
  const change = async (
    { identity }: Account,
    command: typeof deactivateAccount,
  ) =>
    executeCommand(domain, command, {
      actor: (await resolveUserActor(domain, identity))!,
      input: {},
      idempotencyKey: randomUUID(),
    });

  it("can still be said no to, asked no longer, and unfriended", async () => {
    const [{ actor: a }, b, c, friend] = (await Promise.all(
      [1, 2, 3, 4].map(account),
    )) as [Account, Account, Account, Account];
    await run(sendFriendRequest, b.actor, a);
    await run(sendFriendRequest, a, c.actor);
    await friends(a, friend.actor);
    for (const other of [b, c, friend]) {
      await change(other, deactivateAccount);
    }

    // Nothing waits that cannot be answered.
    const waiting = await overview(a);
    expect(ids(waiting.incomingRequests)).toEqual([]);
    expect(ids(waiting.outgoingRequests)).toEqual([]);
    expect(ids(waiting.friends)).toEqual([friend.actor.userId]);
    await expect(run(acceptFriendRequest, a, b.actor)).rejects.toMatchObject({
      code: "not_found",
    });

    // Ending works without the other's answer, and offers no new request.
    for (const [command, other] of [
      [declineFriendRequest, b],
      [withdrawFriendRequest, c],
      [removeFriend, friend],
    ] as const) {
      expect((await run(command, a, other.actor)).output).toMatchObject({
        friendship: "none",
        canRequest: false,
      });
    }
    for (const other of [b, c, friend]) {
      expect(
        (await relationsBetween(a, other.actor)).map((row) => row.status),
      ).toEqual(["ended"]);
    }
  });

  it("still looks missing when it blocks the caller", async () => {
    const [{ actor: a }, b] = (await Promise.all([1, 2].map(account))) as [
      Account,
      Account,
    ];
    await friends(a, b.actor);
    await run(blockUser, b.actor, a);
    await change(b, deactivateAccount);
    const nobody = randomUUID();

    for (const command of [
      declineFriendRequest,
      withdrawFriendRequest,
      removeFriend,
    ]) {
      const toBlocker = await run(command, a, b.actor).catch((error) => error);
      const toNobody = await run(command, a, nobody).catch((error) => error);

      expect(toBlocker).toMatchObject({ code: "not_found" });
      expect(toBlocker.fields).toEqual(toNobody.fields);
    }
  });

  it("brings a request back when the account is active again", async () => {
    const [{ actor: a }, b] = (await Promise.all([1, 2].map(account))) as [
      Account,
      Account,
    ];
    await run(sendFriendRequest, b.actor, a);
    await change(b, deactivateAccount);
    expect(ids((await overview(a)).incomingRequests)).toEqual([]);

    await change(b, reactivateAccount);
    expect(ids((await overview(a)).incomingRequests)).toEqual([b.actor.userId]);
  });
});
