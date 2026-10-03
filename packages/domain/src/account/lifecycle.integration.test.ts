import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { type AccountStatus, systemActor, type UserActor } from "../actor";
import {
  openCaseRound,
  openEnvironmentContact,
  requestLoanMediation,
  writeCaseEntry,
} from "../cases/commands";
import { listOwnCases, readCase } from "../cases/queries";
import { executeQuery } from "../commands/query";
import { approveLoanRequest } from "../loans/approval";
import { proposeLoanAmendment } from "../loans/amendments";
import { EventRecorder } from "../events/recorder";
import { reportHandover } from "../loans/handover";
import { readLoan } from "../loans/queries";
import { acceptCoOwnerInvitation, inviteCoOwner } from "../objects/co-owners";
import { sendFriendRequest } from "../social/commands";
import { connectTestDatabase } from "../testing/database";
import { testIdentity } from "../testing/identities";
import { loanTestKit } from "../testing/loans";
import { resolveUserActor } from "./identity";
import {
  changeAccountStatus,
  deactivateAccount,
  loadAccountForChange,
  makeAccountDormant,
  reactivateAccount,
  reinstateAccount,
  startAccountClosure,
  suspendAccount,
} from "./lifecycle";
import { accountInactivityProcess } from "./policies";

/**
 * WP-53 (PS-ADM-001–003, PS-ADM-014): an account's states and what leaving
 * the active state stops, while the loans already under way go on with
 * minimum access.
 */
const db = connectTestDatabase();
afterAll(() => db.destroy());

const kit = loanTestKit(db);
const {
  run,
  user,
  create,
  addCoOwner,
  friends,
  ask,
  dated,
  environment,
  published,
  environmentOrigin,
  reservedLoan,
  stored,
  eventsFor,
} = kit;

const oneDay = 24 * 60 * 60 * 1000;

/** The actor as the next request would see them, with the stored state. */
async function current(actor: UserActor): Promise<UserActor> {
  const { status } = await db
    .selectFrom("app.users")
    .select("status")
    .where("id", "=", actor.userId)
    .executeTakeFirstOrThrow();

  return { ...actor, accountStatus: status as AccountStatus };
}

const account = (userId: string) =>
  db
    .selectFrom("app.users")
    .select(["status", "status_reason"])
    .where("id", "=", userId)
    .executeTakeFirstOrThrow();

const changes = (userId: string) =>
  db
    .selectFrom("app.account_status_changes")
    .select([
      "from_status",
      "to_status",
      "reason",
      "changed_by_user_id",
      "changed_by_process",
      "basis",
    ])
    .where("user_id", "=", userId)
    .orderBy("position")
    .execute();

const loanStatus = (loanId: string) =>
  db
    .selectFrom("app.loans")
    .select(["status", "end_reason", "ended_by_user_id"])
    .where("id", "=", loanId)
    .executeTakeFirstOrThrow();

/**
 * A steward whose session has the stronger authentication the role needs.
 * No real session gets it until OD-0010 is decided (see the last test);
 * these tests show what the interventions do once one can.
 */
async function steward(): Promise<UserActor> {
  const actor = await user();
  await db
    .insertInto("app.platform_role_grants")
    .values({
      user_id: actor.userId,
      role: "platform_steward",
      granted_at: new Date(),
      granted_by_process: "ops.platform_roles",
      grant_reason: "Test",
    })
    .execute();

  return {
    ...actor,
    platformRoles: ["platform_steward"],
    authentication: { ...actor.authentication, assurance: "aal2" },
  };
}

const deactivate = (actor: UserActor) => run(deactivateAccount, actor, {});

describe("deactivation (PS-ADM-002)", () => {
  it("records the change with its reason and actor, and keeps it apart from the state", async () => {
    const actor = await user();

    expect(await deactivate(actor)).toEqual({
      userId: actor.userId,
      status: "deactivated",
    });
    expect(await account(actor.userId)).toEqual({
      status: "deactivated",
      status_reason: "user_request",
    });
    expect(await changes(actor.userId)).toEqual([
      {
        from_status: "active",
        to_status: "deactivated",
        reason: "user_request",
        changed_by_user_id: actor.userId,
        changed_by_process: null,
        basis: null,
      },
    ]);
    expect(await eventsFor("user", actor.userId)).toContainEqual({
      event_type: "account.deactivated",
      payload: { from: "active" },
    });
  });

  it("replays a retry and refuses a second deactivation", async () => {
    const actor = await user();
    const key = randomUUID();

    const first = await run(deactivateAccount, actor, {}, key);
    expect(await run(deactivateAccount, actor, {}, key)).toEqual(first);
    await expect(
      run(deactivateAccount, await current(actor), {}),
    ).rejects.toMatchObject({ code: "account_inactive" });
    // Even with an actor read before the change: the locked state decides.
    await expect(run(deactivateAccount, actor, {})).rejects.toMatchObject({
      code: "account_inactive",
    });
    expect(await changes(actor.userId)).toHaveLength(1);
  });

  it("ends what waited for the account to start something new", async () => {
    const owner = await user();
    const coOwner = await user();
    const borrower = await user();
    await friends(borrower, owner);
    const alone = await create(owner);
    const shared = await create(owner);
    await addCoOwner(owner, shared, coOwner);
    const direct = { kind: "direct" };

    // Its own request as a borrower.
    const lender = await user();
    await friends(owner, lender);
    const own = await ask(owner, await create(lender), direct);
    // Requests for its objects: nobody can lend the first one any more; the
    // second has an active co-owner, but the borrower is only the deactivated
    // owner's friend.
    const forAlone = await ask(borrower, alone, direct);
    const forShared = await ask(borrower, shared, direct);

    await deactivate(owner);

    expect(await stored(own.requestId)).toMatchObject({
      status: "ended",
      end_reason: "access_lost",
    });
    expect(await stored(forAlone.requestId)).toMatchObject({
      status: "ended",
      end_reason: "object_unavailable",
    });
    expect(await stored(forShared.requestId)).toMatchObject({
      status: "ended",
      end_reason: "access_lost",
    });
  });

  it("keeps an environment request open while another owner can lend", async () => {
    const setup = await published();
    const coOwner = await kit.join(
      setup.environmentId,
      setup.admin,
      await user(),
    );
    await addCoOwner(setup.owner, setup.objectId, coOwner);
    const { requestId } = await ask(
      setup.borrower,
      setup.objectId,
      environmentOrigin(setup.environmentId),
    );

    await deactivate(setup.owner);

    expect(await stored(requestId)).toMatchObject({ status: "requested" });
    await run(approveLoanRequest, coOwner, { requestId });
  });

  it("releases its environment roles into the continuity model (PS-ENV-014)", async () => {
    const owner = await user();
    const environmentId = await environment(owner);

    await deactivate(owner);

    const grants = await db
      .selectFrom("app.environment_role_grants")
      .select(["role", "revoked_at", "revoke_reason"])
      .where("environment_id", "=", environmentId)
      .where("user_id", "=", owner.userId)
      .execute();
    expect(grants.every((grant) => grant.revoked_at !== null)).toBe(true);
    // Without another administrator to take it over, it winds down.
    expect(
      await db
        .selectFrom("app.environment_wind_downs")
        .select(["reason", "started_by_user_id"])
        .where("environment_id", "=", environmentId)
        .executeTakeFirst(),
    ).toEqual({ reason: "ownerless", started_by_user_id: null });
  });

  it("keeps taking part in an open case as a party, and opens none (PS-ADM-002)", async () => {
    const { owner, borrower, admin, loanId, environmentId } =
      await reservedLoan(1, 3);
    kit.advance(2 * oneDay);
    for (const [actor, outcome] of [
      [owner, "handed_over"],
      [borrower, "not_handed_over"],
    ] as const) {
      await run(reportHandover, actor, {
        loanId,
        agreementVersion: 1,
        outcome,
      });
    }
    const { caseId } = await run(requestLoanMediation, borrower, {
      loanId,
      body: "Jeg fikk den aldri.",
    });

    await deactivate(borrower);
    const resting = await current(borrower);
    const query = { actor: resting, input: { caseId } };
    expect(
      (await executeQuery(kit.tick(), readCase, query)).entries.map(
        (entry) => entry.body,
      ),
    ).toEqual(["Jeg fikk den aldri."]);
    expect(
      (
        await executeQuery(kit.tick(), listOwnCases, {
          actor: resting,
          input: {},
        })
      ).items,
    ).toEqual([expect.objectContaining({ id: caseId })]);
    await run(openCaseRound, admin, { caseId, userId: borrower.userId });
    await run(writeCaseEntry, resting, { caseId, body: "Jeg var hjemme." });

    await expect(
      run(openEnvironmentContact, resting, {
        environmentId,
        body: "Hei",
      }),
    ).rejects.toMatchObject({ code: "account_inactive" });
  });

  it("keeps the minimum access to loans already under way, and nothing new", async () => {
    const { owner, borrower, loanId, objectId } = await reservedLoan(0, 3);

    await deactivate(borrower);
    const inactive = await current(borrower);

    // The loan is still theirs to see and to finish.
    expect(
      await executeQuery(kit.tick(), readLoan, {
        actor: inactive,
        input: { loanId },
      }),
    ).toMatchObject({ status: "reserved" });
    await run(reportHandover, inactive, {
      loanId,
      agreementVersion: 1,
      outcome: "handed_over",
    });
    await run(reportHandover, owner, {
      loanId,
      agreementVersion: 1,
      outcome: "handed_over",
    });
    expect(await loanStatus(loanId)).toMatchObject({ status: "active" });

    // Nothing that makes a new commitment.
    await expect(
      run(proposeLoanAmendment, inactive, {
        loanId,
        agreementVersion: 1,
        period: dated(0, 5),
      }),
    ).rejects.toMatchObject({ code: "account_inactive" });
    await expect(
      ask(inactive, objectId, { kind: "direct" }),
    ).rejects.toMatchObject({ code: "account_inactive" });
  });

  it("hides the object from discovery and refuses new requests when no owner can lend", async () => {
    const setup = await published();

    await deactivate(setup.owner);

    await expect(
      ask(
        setup.borrower,
        setup.objectId,
        environmentOrigin(setup.environmentId),
      ),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("reactivation", () => {
  it("makes the account active again without restoring what ended", async () => {
    const owner = await user();
    const borrower = await user();
    await friends(borrower, owner);
    const objectId = await create(owner);
    const { requestId } = await ask(borrower, objectId, { kind: "direct" });

    await deactivate(owner);
    expect(
      await run(reactivateAccount, await current(owner), {}),
    ).toMatchObject({ status: "active" });

    expect(await account(owner.userId)).toEqual({
      status: "active",
      status_reason: null,
    });
    expect(await stored(requestId)).toMatchObject({ status: "ended" });
    // New activity works again.
    await ask(borrower, objectId, { kind: "direct" });
  });

  it("wakes a dormant account; only the inactivity process puts it to rest", async () => {
    const actor = await user();
    const process = systemActor(accountInactivityProcess);

    await expect(
      run(makeAccountDormant, systemActor("outbox.worker"), {
        userId: actor.userId,
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await run(makeAccountDormant, process, { userId: actor.userId });
    expect(await account(actor.userId)).toEqual({
      status: "dormant",
      status_reason: "inactivity",
    });
    await expect(
      run(makeAccountDormant, process, { userId: actor.userId }),
    ).rejects.toMatchObject({ code: "forbidden" });

    await run(reactivateAccount, await current(actor), {});
    expect(await changes(actor.userId)).toMatchObject([
      { to_status: "dormant", changed_by_process: accountInactivityProcess },
      { to_status: "active", reason: "user_request" },
    ]);
  });
});

describe("suspension (PS-ADM-003, PS-ADM-014)", () => {
  it("stops reserved loans before handover and lets handed-over ones run to return", async () => {
    const platform = await steward();
    const later = await reservedLoan(3, 5);
    const handedOver = await reservedLoan(0, 4);
    const pastHandover = await reservedLoan(0, 2);
    await run(reportHandover, handedOver.owner, {
      loanId: handedOver.loanId,
      agreementVersion: 1,
      outcome: "handed_over",
    });
    await run(reportHandover, handedOver.borrower, {
      loanId: handedOver.loanId,
      agreementVersion: 1,
      outcome: "handed_over",
    });

    await run(suspendAccount, platform, {
      userId: later.borrower.userId,
      basis: "Gjentatte brudd på vilkårene",
    });
    await run(suspendAccount, platform, {
      userId: handedOver.borrower.userId,
      basis: "Gjentatte brudd på vilkårene",
    });
    kit.advance(oneDay);
    await run(suspendAccount, platform, {
      userId: pastHandover.borrower.userId,
      basis: "Gjentatte brudd på vilkårene",
    });

    expect(await loanStatus(later.loanId)).toEqual({
      status: "ended",
      end_reason: "stopped",
      ended_by_user_id: null,
    });
    expect(await eventsFor("loan", later.loanId)).toContainEqual({
      event_type: "loan.stopped",
      payload: { objectId: later.objectId },
    });
    // Already handed over: followed to its return with minimum access.
    expect(await loanStatus(handedOver.loanId)).toMatchObject({
      status: "active",
    });
    // Its handover day is over: it awaits clarification instead.
    expect(await loanStatus(pastHandover.loanId)).toMatchObject({
      status: "reserved",
    });
  });

  it("keeps the basis with the change only, and a steward never acts on themselves", async () => {
    const platform = await steward();
    const target = await user();
    const basis = "Melding fra politiet om bedrageri";

    await run(suspendAccount, platform, { userId: target.userId, basis });

    expect(await changes(target.userId)).toEqual([
      {
        from_status: "active",
        to_status: "suspended",
        reason: "platform",
        changed_by_user_id: platform.userId,
        changed_by_process: null,
        basis,
      },
    ]);
    expect(
      JSON.stringify(await eventsFor("user", target.userId)),
    ).not.toContain(basis);
    await expect(
      run(suspendAccount, platform, { userId: platform.userId, basis }),
    ).rejects.toMatchObject({ code: "conflict_of_interest" });
    // The user cannot end it themselves.
    await expect(
      run(reactivateAccount, await current(target), {}),
    ).rejects.toMatchObject({ code: "forbidden" });

    await run(reinstateAccount, platform, {
      userId: target.userId,
      basis: "Saken er avklart",
    });
    expect(await account(target.userId)).toEqual({
      status: "active",
      status_reason: null,
    });
  });

  it("starts a controlled closure that stops new activity", async () => {
    const platform = await steward();
    const target = await user();

    await run(startAccountClosure, platform, {
      userId: target.userId,
      basis: "Kontrollert avslutning etter henvendelse",
    });

    expect(await account(target.userId)).toEqual({
      status: "closing",
      status_reason: "platform",
    });
    await expect(
      run(deactivateAccount, await current(target), {}),
    ).rejects.toMatchObject({ code: "account_inactive" });
  });

  it("stays closed to every real session until stronger authentication is decided (OD-0010)", async () => {
    const identity = testIdentity({
      authentication: {
        sessionId: randomUUID(),
        assurance: "aal2",
        methods: [{ method: "totp", at: new Date() }],
      },
    });
    const registered = (await resolveUserActor(kit.domain, identity))!;
    await db
      .updateTable("app.users")
      .set({ status: "active", adult_confirmed_at: new Date() })
      .where("id", "=", registered.userId)
      .execute();
    await db
      .insertInto("app.platform_role_grants")
      .values({
        user_id: registered.userId,
        role: "platform_steward",
        granted_at: new Date(),
        granted_by_process: "ops.platform_roles",
        grant_reason: "Test",
      })
      .execute();
    const real = (await resolveUserActor(kit.domain, identity))!;
    const target = await user();

    await expect(
      run(suspendAccount, real, { userId: target.userId, basis: "Test" }),
    ).rejects.toMatchObject({ code: "stronger_authentication_required" });
    expect(await account(target.userId)).toMatchObject({ status: "active" });
  });
});

/**
 * Runs `attempt` while the account's change to `to` holds its lock, and
 * checks that it waits for the change instead of building on the state from
 * before it. Returns the attempt's outcome once the change has committed.
 */
async function duringChange(
  actor: UserActor,
  to: "deactivated" | "deleted",
  attempt: () => Promise<unknown>,
): Promise<unknown> {
  let outcome: Promise<unknown> = Promise.resolve();

  await db.transaction().execute(async (tx) => {
    const loaded = await loadAccountForChange(tx, actor.userId);
    await changeAccountStatus(
      tx,
      { account: loaded!.resource, to, reason: "user_request", actor },
      new EventRecorder(),
      kit.now(),
    );

    outcome = attempt();
    const state = await Promise.race([
      outcome.then(
        () => "settled",
        () => "settled",
      ),
      new Promise((resolve) => setTimeout(() => resolve("waiting"), 300)),
    ]);
    expect(state).toBe("waiting");
  });

  return outcome;
}

describe("races", () => {
  for (const to of ["deactivated", "deleted"] as const) {
    it(`holds the account's own new activity until it is ${to}, then refuses it`, async () => {
      const owner = await user();
      const inactive = { code: "account_inactive" };

      await expect(
        duringChange(owner, to, () => create(owner)),
      ).rejects.toMatchObject(inactive);
      const founder = await user();
      await expect(
        duringChange(founder, to, () => environment(founder)),
      ).rejects.toMatchObject(inactive);

      const other = await user();
      await expect(
        duringChange(other, to, () =>
          run(sendFriendRequest, other, { userId: owner.userId }),
        ),
      ).rejects.toMatchObject(inactive);
      for (const id of [owner.userId, founder.userId, other.userId]) {
        expect(await account(id)).toMatchObject({ status: to });
      }
    });

    it(`never binds an account that is ${to} meanwhile to someone else's new activity`, async () => {
      const owner = await user();
      const objectId = await create(owner);
      const conflict = { code: "conflict" };

      // A co-ownership invitation to it, and a friend request.
      const invited = await user();
      await expect(
        duringChange(invited, to, () =>
          run(inviteCoOwner, owner, { objectId, userId: invited.userId }),
        ),
      ).rejects.toMatchObject(conflict);
      const addressee = await user();
      await expect(
        duringChange(addressee, to, () =>
          run(sendFriendRequest, owner, { userId: addressee.userId }),
        ),
      ).rejects.toMatchObject(conflict);

      // Its acceptance of a co-ownership offered before.
      const accepting = await user();
      const { invitationId } = await run(inviteCoOwner, owner, {
        objectId,
        userId: accepting.userId,
      });
      await expect(
        duringChange(accepting, to, () =>
          run(acceptCoOwnerInvitation, accepting, { invitationId }),
        ),
      ).rejects.toMatchObject({ code: "account_inactive" });

      expect(
        await db
          .selectFrom("app.object_owners")
          .select("user_id")
          .where("object_id", "=", objectId)
          .execute(),
      ).toEqual([{ user_id: owner.userId }]);
      expect(
        await db
          .selectFrom("app.friendships")
          .select("id")
          .where("addressee_id", "=", addressee.userId)
          .execute(),
      ).toEqual([]);
    });
  }

  it("never approves a loan for a borrower who deactivated meanwhile", async () => {
    for (let round = 0; round < 5; round++) {
      const setup = await published();
      const { requestId } = await ask(
        setup.borrower,
        setup.objectId,
        environmentOrigin(setup.environmentId),
      );

      const [approval] = await Promise.allSettled([
        run(approveLoanRequest, setup.owner, { requestId }),
        deactivate(setup.borrower),
      ]);

      const request = await stored(requestId);
      if (approval.status === "fulfilled") {
        // The approval came first; the loan goes on with minimum access.
        expect(request.status).toBe("approved");
      } else {
        expect(request).toMatchObject({
          status: "ended",
          end_reason: "access_lost",
        });
        expect(
          await db
            .selectFrom("app.loans")
            .select("id")
            .where("request_id", "=", requestId)
            .execute(),
        ).toEqual([]);
      }
      expect(await account(setup.borrower.userId)).toMatchObject({
        status: "deactivated",
      });
    }
  });

  it("never opens a request on an object whose only owner deactivated meanwhile", async () => {
    for (let round = 0; round < 5; round++) {
      const owner = await user();
      const borrower = await user();
      await friends(borrower, owner);
      const objectId = await create(owner);

      const [request] = await Promise.allSettled([
        ask(borrower, objectId, { kind: "direct" }),
        deactivate(owner),
      ]);

      if (request.status === "fulfilled") {
        // It came first, and the deactivation ended it.
        expect(await stored(request.value.requestId)).toMatchObject({
          status: "ended",
          end_reason: "object_unavailable",
        });
      }
      expect(
        await db
          .selectFrom("app.loan_requests")
          .select("id")
          .where("object_id", "=", objectId)
          .where("status", "<>", "ended")
          .execute(),
      ).toEqual([]);
    }
  });
});
