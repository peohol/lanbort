import { afterAll, describe, expect, it } from "vitest";
import type { UserActor } from "../actor";
import { executeQuery } from "../commands/query";
import { cancelLoan } from "../loans/cancellation";
import { consentToObjectDeletion } from "../objects/deletion";
import {
  acceptResponsibilityTransfer,
  offerResponsibility,
} from "../loans/responsibility";
import { publishObject } from "../publications/commands";
import { submitLoanReview } from "../reviews/commands";
import { connectTestDatabase } from "../testing/database";
import { loanTestKit } from "../testing/loans";
import { listCaseInterventions } from "../platform/intervention-commands";
import { completeAccountClosure } from "./deletion";
import {
  linkSamePerson,
  moveDuplicateObject,
  readAccountIdentityRecord,
  recordFalseIdentity,
  retireDuplicateAccount,
} from "./duplicates";
import { reinstateAccount, suspendAccount } from "./lifecycle";

/**
 * WP-55 (PS-ADM-009–010): a duplicate is retired and closed, never merged;
 * a false identity is recorded and linked, and rewrites no history.
 */
const db = connectTestDatabase();
afterAll(() => db.destroy());

const kit = loanTestKit(db);
const {
  run,
  user,
  steward,
  about,
  aboutObject,
  create,
  addCoOwner,
  friends,
  environment,
  join,
  published,
  reservedLoan,
  eventsFor,
} = kit;

const basis = "Samme person bekreftet med legitimasjon og e-post";

const statusOf = async (userId: string) =>
  (
    await db
      .selectFrom("app.users")
      .select("status")
      .where("id", "=", userId)
      .executeTakeFirstOrThrow()
  ).status;

const ownersOf = async (objectId: string) =>
  (
    await db
      .selectFrom("app.object_owners")
      .select("user_id")
      .where("object_id", "=", objectId)
      .orderBy("added_at")
      .execute()
  ).map((row) => row.user_id);

/** Everything social the account has: friendships, memberships, reviews. */
async function socialOf(userId: string) {
  const friendships = await db
    .selectFrom("app.friendships")
    .select(["status"])
    .where((eb) =>
      eb.or([eb("requester_id", "=", userId), eb("addressee_id", "=", userId)]),
    )
    .execute();
  const memberships = await db
    .selectFrom("app.environment_memberships")
    .select(["environment_id", "state"])
    .where("user_id", "=", userId)
    .execute();
  const reviews = await db
    .selectFrom("app.loan_reviews")
    .select(["loan_id", "author_role", "status"])
    .where("author_user_id", "=", userId)
    .execute();

  return { friendships, memberships, reviews };
}

/** No event of the account or object carries the steward's basis. */
async function basisInEvents(resourceType: string, resourceId: string) {
  return (await eventsFor(resourceType, resourceId)).some((event) =>
    JSON.stringify(event.payload).includes("legitimasjon"),
  );
}

const retire = async (
  platform: UserActor,
  retired: UserActor,
  continued: UserActor,
) =>
  run(retireDuplicateAccount, platform, {
    caseId: await about(platform, retired.userId),
    userId: retired.userId,
    continuedUserId: continued.userId,
    basis,
  });

const move = async (platform: UserActor, objectId: string) =>
  run(moveDuplicateObject, platform, {
    caseId: await aboutObject(platform, objectId),
    objectId,
    basis,
  });

describe("retiring a duplicate (PS-ADM-009)", () => {
  it("closes the duplicate, records the link with its basis, and moves nothing social", async () => {
    const platform = await steward();
    const [retired, continued, friend, admin] = await Promise.all([
      user(),
      user(),
      user(),
      user(),
    ]);
    await friends(retired, friend);
    const environmentId = await environment(admin);
    await join(environmentId, admin, retired);
    const before = await socialOf(retired.userId);

    expect(await retire(platform, retired, continued)).toEqual({
      userId: retired.userId,
      status: "closing",
    });

    expect(await statusOf(retired.userId)).toBe("closing");
    expect(await statusOf(continued.userId)).toBe("active");
    expect(
      await db
        .selectFrom("app.account_status_changes")
        .select(["to_status", "reason", "basis", "changed_by_user_id"])
        .where("user_id", "=", retired.userId)
        .execute(),
    ).toEqual([
      {
        to_status: "closing",
        reason: "platform",
        basis,
        changed_by_user_id: platform.userId,
      },
    ]);
    expect(
      await db
        .selectFrom("app.account_links")
        .select(["kind", "linked_user_id", "basis", "recorded_by_user_id"])
        .where("user_id", "=", retired.userId)
        .execute(),
    ).toEqual([
      {
        kind: "duplicate",
        linked_user_id: continued.userId,
        basis,
        recorded_by_user_id: platform.userId,
      },
    ]);
    expect(
      (await eventsFor("user", retired.userId)).map((e) => e.event_type),
    ).toEqual(
      expect.arrayContaining([
        "account.closure_started",
        "account.retired_as_duplicate",
      ]),
    );
    expect(await basisInEvents("user", retired.userId)).toBe(false);

    // The duplicate keeps its own relations; the continuing account gets
    // none of them.
    expect(await socialOf(retired.userId)).toEqual(before);
    expect(await socialOf(continued.userId)).toEqual({
      friendships: [],
      memberships: [],
      reviews: [],
    });
  });

  it("never retires a suspended account, nor into an account that is not active", async () => {
    const platform = await steward();
    const [suspended, inactive, other] = await Promise.all([
      user(),
      user(),
      user(),
    ]);
    await run(suspendAccount, platform, {
      caseId: await about(platform, suspended.userId),
      userId: suspended.userId,
      basis,
    });
    await run(suspendAccount, platform, {
      caseId: await about(platform, inactive.userId),
      userId: inactive.userId,
      basis,
    });

    await expect(retire(platform, suspended, other)).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(retire(platform, other, inactive)).rejects.toMatchObject({
      code: "forbidden",
    });
    expect(await statusOf(other.userId)).toBe("active");
  });

  it("retires an account only from a case about it, not one about the account that continues", async () => {
    const platform = await steward();
    const [retired, continued] = await Promise.all([user(), user()]);

    await expect(
      run(retireDuplicateAccount, platform, {
        caseId: await about(platform, continued.userId),
        userId: retired.userId,
        continuedUserId: continued.userId,
        basis,
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(await statusOf(retired.userId)).toBe("active");
  });

  it("retires an account into one other account only", async () => {
    const platform = await steward();
    const [retired, continued, third] = await Promise.all([
      user(),
      user(),
      user(),
    ]);
    await retire(platform, retired, continued);

    await expect(retire(platform, retired, third)).rejects.toMatchObject({
      code: "conflict",
    });

    // Into the same account again, after a closure was ended, the closure
    // starts again on the same link.
    await run(reinstateAccount, platform, {
      caseId: await about(platform, retired.userId),
      userId: retired.userId,
      basis,
    });
    expect(await retire(platform, retired, continued)).toEqual({
      userId: retired.userId,
      status: "closing",
    });
    expect(
      await db
        .selectFrom("app.account_links")
        .select("linked_user_id")
        .where("user_id", "=", retired.userId)
        .execute(),
    ).toEqual([{ linked_user_id: continued.userId }]);
  });

  it("is closed to every real session until stronger authentication is decided (OD-0010)", async () => {
    const platform = await steward();
    const [retired, continued] = await Promise.all([user(), user()]);

    await expect(
      retire(
        {
          ...platform,
          authentication: { ...platform.authentication, assurance: "aal1" },
        },
        retired,
        continued,
      ),
    ).rejects.toMatchObject({ code: "stronger_authentication_required" });
    await expect(retire(platform, platform, continued)).rejects.toMatchObject({
      code: "conflict_of_interest",
    });
  });
});

describe("moving a duplicate's objects (PS-ADM-009)", () => {
  it("shows the duplicate's case which account continues and which things are left to move", async () => {
    const platform = await steward();
    const [retired, continued, coOwner] = await Promise.all([
      user(),
      user(),
      user(),
    ]);
    const alone = await create(retired);
    const shared = await create(retired);
    const theirs = await create(retired);
    await addCoOwner(retired, shared, coOwner);
    await addCoOwner(retired, theirs, continued);
    const caseId = await about(platform, retired.userId);
    const subject = async () =>
      (
        await executeQuery(kit.domain, listCaseInterventions, {
          actor: platform,
          input: { caseId },
        })
      ).account;

    expect(await subject()).toMatchObject({ duplicateOf: null, objects: [] });

    await retire(platform, retired, continued);
    const before = await subject();
    expect(before?.duplicateOf).toEqual({
      userId: continued.userId,
      realName: expect.any(String),
    });
    // A thing the continuing account already owns has nothing left to move.
    expect(before?.objects).toHaveLength(2);
    expect(before?.objects).toEqual(
      expect.arrayContaining([
        { objectId: alone, title: expect.any(String), coOwners: [] },
        {
          objectId: shared,
          title: expect.any(String),
          coOwners: [{ userId: coOwner.userId, realName: expect.any(String) }],
        },
      ]),
    );

    await move(platform, alone);
    expect((await subject())?.objects.map(({ objectId }) => objectId)).toEqual([
      shared,
    ]);
  });

  it("moves an object with no loan, and ends its publications outside the continuing account's environments", async () => {
    const platform = await steward();
    const { admin, environmentId, owner, objectId, publicationId } =
      await published();
    const continued = await user();

    // Both are members of a second environment, where the object stays.
    const shared = await environment(admin);
    await join(shared, admin, owner);
    await join(shared, admin, continued);
    const { publicationId: sharedPublication } = await run(
      publishObject,
      owner,
      { objectId, environmentId: shared },
    );

    await retire(platform, owner, continued);
    expect(await move(platform, objectId)).toEqual({
      objectId,
      formerOwnerLeft: true,
    });

    expect(await ownersOf(objectId)).toEqual([continued.userId]);
    expect(
      await db
        .selectFrom("app.environment_publications")
        .select(["environment_id", "status", "end_reason"])
        .where("id", "in", [publicationId, sharedPublication])
        .orderBy("environment_id")
        .execute(),
    ).toEqual(
      [
        {
          environment_id: environmentId,
          status: "unpublished",
          end_reason: "access_lost",
        },
        { environment_id: shared, status: "active", end_reason: null },
      ].sort((a, b) => (a.environment_id < b.environment_id ? -1 : 1)),
    );
    expect(
      await db
        .selectFrom("app.account_object_transfers")
        .select(["from_user_id", "to_user_id", "basis", "moved_by_user_id"])
        .where("object_id", "=", objectId)
        .execute(),
    ).toEqual([
      {
        from_user_id: owner.userId,
        to_user_id: continued.userId,
        basis,
        moved_by_user_id: platform.userId,
      },
    ]);
    expect(
      (await eventsFor("object", objectId)).map((e) => e.event_type),
    ).toEqual(
      expect.arrayContaining([
        "object.moved_from_duplicate",
        "object.co_owner_left",
      ]),
    );
    expect(await basisInEvents("object", objectId)).toBe(false);

    // The memberships themselves stay where they were.
    expect(
      (await socialOf(continued.userId)).memberships.map(
        (m) => m.environment_id,
      ),
    ).toEqual([shared]);

    // Moving it again is refused: it is the continuing account's now.
    await expect(move(platform, objectId)).rejects.toMatchObject({
      code: "forbidden",
    });
  });

  it("keeps the record of the transfer when the object is deleted later (PS-ADM-014)", async () => {
    const platform = await steward();
    const [retired, continued] = await Promise.all([user(), user()]);
    const objectId = await create(retired);
    await retire(platform, retired, continued);
    await move(platform, objectId);
    const transfers = () =>
      db
        .selectFrom("app.account_object_transfers")
        .selectAll()
        .where("object_id", "=", objectId)
        .execute();
    const recorded = await transfers();
    expect(recorded).toMatchObject([
      {
        from_user_id: retired.userId,
        to_user_id: continued.userId,
        basis,
        moved_by_user_id: platform.userId,
      },
    ]);

    // The new owner deletes it like any other object: its content goes
    // (PS-OBJ-011), the record of the intervention stays.
    await run(consentToObjectDeletion, continued, { objectId });

    expect(
      await db
        .selectFrom("app.objects")
        .select("id")
        .where("id", "=", objectId)
        .execute(),
    ).toEqual([]);
    expect(await transfers()).toEqual(recorded);
    expect(
      (await eventsFor("object", objectId)).map((e) => e.event_type),
    ).toEqual(
      expect.arrayContaining(["object.moved_from_duplicate", "object.deleted"]),
    );
  });

  it("keeps the duplicate as co-owner while it is responsible for a loan, until the borrower agrees to the new lender", async () => {
    const platform = await steward();
    const { owner, borrower, objectId, loanId } = await reservedLoan();
    const continued = await user();

    await retire(platform, owner, continued);
    expect(await move(platform, objectId)).toEqual({
      objectId,
      formerOwnerLeft: false,
    });
    expect(await ownersOf(objectId)).toEqual([owner.userId, continued.userId]);

    // The loan is the borrower's agreement with the duplicate. The
    // continuing account joined after the approval, so the borrower decides
    // whether it takes the role over (PS-LOAN-009).
    const { transferId } = await run(offerResponsibility, owner, {
      loanId,
      toUserId: continued.userId,
    });
    await run(acceptResponsibilityTransfer, continued, { loanId, transferId });
    expect(
      await run(acceptResponsibilityTransfer, borrower, {
        loanId,
        transferId,
      }),
    ).toMatchObject({
      status: "completed",
      responsibleLenderId: continued.userId,
    });

    // Nothing binds the duplicate any more: its closure completes, and it
    // leaves the object then.
    await run(completeAccountClosure, platform, {
      caseId: await about(platform, owner.userId),
      userId: owner.userId,
      basis,
    });
    expect(await statusOf(owner.userId)).toBe("deleted");
    expect(await ownersOf(objectId)).toEqual([continued.userId]);
  });

  it("never moves an object other people own too, or one of an account that is no duplicate", async () => {
    const platform = await steward();
    const [retired, continued, coOwner, stranger] = await Promise.all([
      user(),
      user(),
      user(),
      user(),
    ]);
    const shared = await create(retired);
    await addCoOwner(retired, shared, coOwner);
    const unrelated = await create(stranger);
    await retire(platform, retired, continued);

    await expect(move(platform, shared)).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(move(platform, unrelated)).rejects.toMatchObject({
      code: "forbidden",
    });
    expect(await ownersOf(shared)).toEqual([retired.userId, coOwner.userId]);
  });

  it("never moves an object before the duplicate is under closure, or once it is reinstated", async () => {
    const platform = await steward();
    const [retired, continued] = await Promise.all([user(), user()]);
    const objectId = await create(retired);
    await retire(platform, retired, continued);
    await run(reinstateAccount, platform, {
      caseId: await about(platform, retired.userId),
      userId: retired.userId,
      basis,
    });

    await expect(move(platform, objectId)).rejects.toMatchObject({
      code: "forbidden",
    });
    expect(await ownersOf(objectId)).toEqual([retired.userId]);
  });
});

describe("false identity (PS-ADM-010)", () => {
  it("records the finding as an internal signal and changes no history", async () => {
    const platform = await steward();
    const { owner, borrower, loanId } = await reservedLoan();
    await run(cancelLoan, borrower, { loanId });
    await run(submitLoanReview, borrower, {
      loanId,
      scores: [{ dimension: "communication", score: 5 }],
    });
    const loanBefore = await db
      .selectFrom("app.loans")
      .selectAll()
      .where("id", "=", loanId)
      .executeTakeFirstOrThrow();
    const socialBefore = await socialOf(borrower.userId);

    const { id } = await run(recordFalseIdentity, platform, {
      caseId: await about(platform, borrower.userId),
      userId: borrower.userId,
      basis,
    });
    // Recording it again returns the same finding.
    expect(
      await run(recordFalseIdentity, platform, {
        caseId: await about(platform, borrower.userId),
        userId: borrower.userId,
        basis,
      }),
    ).toEqual({ id });

    expect(await statusOf(borrower.userId)).toBe("active");
    expect(
      await db
        .selectFrom("app.loans")
        .selectAll()
        .where("id", "=", loanId)
        .executeTakeFirstOrThrow(),
    ).toEqual(loanBefore);
    expect(await socialOf(borrower.userId)).toEqual(socialBefore);
    expect(await statusOf(owner.userId)).toBe("active");
    expect(await basisInEvents("user", borrower.userId)).toBe(false);
  });

  it("links a later account of the same person without carrying anything over", async () => {
    const platform = await steward();
    const [earlier, friend] = await Promise.all([user(), user()]);
    await friends(earlier, friend);
    await run(recordFalseIdentity, platform, {
      caseId: await about(platform, earlier.userId),
      userId: earlier.userId,
      basis,
    });
    await run(suspendAccount, platform, {
      caseId: await about(platform, earlier.userId),
      userId: earlier.userId,
      basis,
    });
    const later = await user();

    const { id } = await run(linkSamePerson, platform, {
      caseId: await about(platform, later.userId),
      userId: later.userId,
      linkedUserId: earlier.userId,
      basis,
    });
    // The same pair, either way round, is one link.
    expect(
      await run(linkSamePerson, platform, {
        caseId: await about(platform, earlier.userId),
        userId: earlier.userId,
        linkedUserId: later.userId,
        basis,
      }),
    ).toEqual({ id });

    expect(await statusOf(later.userId)).toBe("active");
    expect(await socialOf(later.userId)).toEqual({
      friendships: [],
      memberships: [],
      reviews: [],
    });

    const record = await executeQuery(kit.domain, readAccountIdentityRecord, {
      actor: platform,
      input: { userId: later.userId },
    });
    expect(record).toMatchObject({
      userId: later.userId,
      findings: [],
      links: [
        {
          id,
          kind: "same_person",
          role: "same_person",
          otherUserId: earlier.userId,
          basis,
          recordedByUserId: platform.userId,
        },
      ],
    });

    // A steward linked in a record cannot read it.
    await expect(
      executeQuery(kit.domain, readAccountIdentityRecord, {
        actor: platform,
        input: { userId: platform.userId },
      }),
    ).rejects.toMatchObject({ code: "conflict_of_interest" });
  });

  it("keeps the internal record when the duplicate is deleted", async () => {
    const platform = await steward();
    const [retired, continued] = await Promise.all([user(), user()]);
    await run(recordFalseIdentity, platform, {
      caseId: await about(platform, retired.userId),
      userId: retired.userId,
      basis,
    });
    await retire(platform, retired, continued);
    await run(completeAccountClosure, platform, {
      caseId: await about(platform, retired.userId),
      userId: retired.userId,
      basis,
    });

    const record = await executeQuery(kit.domain, readAccountIdentityRecord, {
      actor: platform,
      input: { userId: continued.userId },
    });
    expect(record.links).toMatchObject([
      { kind: "duplicate", role: "continued", otherUserId: retired.userId },
    ]);
    expect(
      (
        await executeQuery(kit.domain, readAccountIdentityRecord, {
          actor: platform,
          input: { userId: retired.userId },
        })
      ).findings,
    ).toMatchObject([{ finding: "false_identity", basis }]);
  });
});

describe("races", () => {
  it("retires only one of two accounts retired into each other at once", async () => {
    const platform = await steward();
    const [first, second] = await Promise.all([user(), user()]);

    const results = await Promise.allSettled([
      retire(platform, first, second),
      retire(platform, second, first),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      [await statusOf(first.userId), await statusOf(second.userId)].sort(),
    ).toEqual(["active", "closing"]);
    expect(
      await db
        .selectFrom("app.account_links")
        .select("id")
        .where("user_id", "in", [first.userId, second.userId])
        .execute(),
    ).toHaveLength(1);
  });

  it("never gives an object to an account that stopped being active meanwhile", async () => {
    const platform = await steward();
    const [retired, continued] = await Promise.all([user(), user()]);
    const objectId = await create(retired);
    await retire(platform, retired, continued);

    const results = await Promise.allSettled([
      move(platform, objectId),
      run(suspendAccount, platform, {
        caseId: await about(platform, continued.userId),
        userId: continued.userId,
        basis,
      }),
    ]);

    expect(results[1].status).toBe("fulfilled");
    const owners = await ownersOf(objectId);

    if (results[0].status === "fulfilled") {
      // The move came first; the suspension found the account owning it.
      expect(owners).toEqual([continued.userId]);
    } else {
      expect(owners).toEqual([retired.userId]);
    }
  });
});
