import { afterAll, describe, expect, it } from "vitest";
import { systemActor, type UserActor } from "../actor";
import { resolveUserActor } from "../account/identity";
import { claimCase, closeCase } from "../cases/commands";
import { listPlatformCaseQueue, readCase } from "../cases/queries";
import { executeQuery } from "../commands/query";
import {
  acceptRoleInvitation,
  inviteAdministrator,
} from "../environment/role-commands";
import { approveLoanRequest } from "../loans/approval";
import { reportHandover } from "../loans/handover";
import { reportReturn } from "../loans/return";
import { grantPlatformRole } from "../platform/commands";
import { platformRoleOpsProcess } from "../platform/policies";
import { publishObject } from "../publications/commands";
import { listEnvironmentObjects } from "../publications/queries";
import { respondToLoanReview, submitLoanReview } from "../reviews/commands";
import { readLoanReviews } from "../reviews/queries";
import { blockUser, sendFriendRequest } from "../social/commands";
import { readTrustProfile } from "../trust/queries";
import { connectTestDatabase } from "../testing/database";
import { registerTestUser } from "../testing/identities";
import { loanTestKit } from "../testing/loans";
import {
  escalateReport,
  reportInEnvironment,
  reportToPlatform,
  takeModerationMeasure,
} from "./commands";
import { listCaseMeasures } from "./queries";

/**
 * WP-52: moderation (PS-TRUST-013–016). A report is a case for the
 * environment's administrators or the platform stewards; nobody involved
 * handles it and whoever it is about never sees it. A measure records its
 * basis, scope, reason, decision maker and time, and has its effect at once:
 * locally on the environment's publication only, globally only through the
 * platform. A moderated review is not rewritten silently: what was removed
 * is kept for the handlers, and the rest of a valid review stands.
 */
const db = connectTestDatabase();
afterAll(() => db.destroy());

// The review tests publish every review whose window is over as of their
// clock, which they move weeks ahead; the reviews reported here must stay
// open past where they get.
const kit = loanTestKit(db, { startInDays: 1500 });
const {
  run,
  tick,
  user,
  create,
  friends,
  member,
  environment,
  published,
  ask,
  environmentOrigin,
  dated,
  reservedLoan,
  eventsFor,
} = kit;

const notFound = { code: "not_found" };
const forbidden = { code: "forbidden" };
const conflict = { code: "conflict" };
const strongerAuthentication = { code: "stronger_authentication_required" };

const read = (actor: UserActor, caseId: string) =>
  executeQuery(tick(), readCase, { actor, input: { caseId } });

const measuresOf = (actor: UserActor, caseId: string) =>
  executeQuery(tick(), listCaseMeasures, { actor, input: { caseId } });

const measure = (
  actor: UserActor,
  caseId: string,
  kind: string,
  extra: object = {},
) =>
  run(takeModerationMeasure, actor, {
    caseId,
    measure: kind,
    reason: "Bryter med reglene.",
    ...extra,
  });

const publicationStatus = async (publicationId: string) =>
  (
    await db
      .selectFrom("app.environment_publications")
      .select("status")
      .where("id", "=", publicationId)
      .executeTakeFirstOrThrow()
  ).status;

const ops = systemActor(platformRoleOpsProcess);

/**
 * A platform steward. Their stronger authentication is simulated: which
 * mechanism provides it is open (OD-0010), so in the product no session has
 * it yet and every steward action stays rejected.
 */
async function steward() {
  const { identity } = await registerTestUser(kit.domain);
  await run(grantPlatformRole, ops, {
    email: identity.email,
    role: "platform_steward",
    reason: "Pilot steward",
  });
  const actor = (await resolveUserActor(kit.domain, identity)) as UserActor;

  return {
    weak: actor,
    actor: {
      ...actor,
      authentication: { ...actor.authentication, assurance: "aal2" },
    } satisfies UserActor,
  };
}

/** Makes `actor` an administrator of the environment. */
async function administrator(
  environmentId: string,
  owner: UserActor,
  actor: UserActor,
) {
  const { invitationId } = await run(inviteAdministrator, owner, {
    environmentId,
    userId: actor.userId,
  });
  await run(acceptRoleInvitation, actor, { environmentId, invitationId });

  return actor;
}

describe("reports in an environment (PS-TRUST-013, PS-OBJ-017)", () => {
  it("are handled by its administrators and moderated locally, with basis and reason", async () => {
    const { admin, environmentId, owner, borrower, objectId, publicationId } =
      await published();
    // The same object in a second environment is not touched (PS-OBJ-017).
    const elsewhere = await environment(admin);
    await kit.join(elsewhere, admin, owner);
    const other = await run(publishObject, owner, {
      objectId,
      environmentId: elsewhere,
    });

    const opened = await run(reportInEnvironment, borrower, {
      environmentId,
      target: { kind: "object", objectId },
      body: "Annonsen ser ut som svindel.",
    });
    expect(opened).toMatchObject({ created: true });

    // The reporter waits for the handler after their first entry; another
    // report about the same object writes into the same case.
    await expect(
      run(reportInEnvironment, borrower, {
        environmentId,
        target: { kind: "object", objectId },
        body: "Og prisen er rar.",
      }),
    ).rejects.toMatchObject(conflict);

    // The owner never learns of the report through the case.
    await expect(read(owner, opened.caseId)).rejects.toMatchObject(notFound);

    await run(claimCase, admin, { caseId: opened.caseId });
    const local = await measure(admin, opened.caseId, "publication_blocked");
    expect(local).toMatchObject({ measure: "publication_blocked" });
    expect(await publicationStatus(publicationId)).toBe("blocked");
    expect(await publicationStatus(other.publicationId)).toBe("active");

    // Nothing global is taken on a local report.
    await expect(
      measure(admin, opened.caseId, "object_blocked"),
    ).rejects.toMatchObject(conflict);
    // What is no longer live cannot be blocked again.
    await expect(
      measure(admin, opened.caseId, "publication_rejected"),
    ).rejects.toMatchObject(conflict);

    // PS-TRUST-016: what, scope, reason, who and when.
    expect((await measuresOf(admin, opened.caseId)).items).toEqual([
      expect.objectContaining({
        id: local.measureId,
        kind: "publication_blocked",
        scope: "environment",
        environmentId,
        objectId,
        reason: "Bryter med reglene.",
        decidedByUserId: admin.userId,
        removedText: null,
      }),
    ]);
    // The reporter sees the case, not the internal history.
    await expect(measuresOf(borrower, opened.caseId)).rejects.toMatchObject(
      forbidden,
    );
    expect(await read(borrower, opened.caseId)).toMatchObject({
      kind: "environment_report",
      reportTarget: "object",
      objectId,
      handling: "assigned",
    });

    expect(
      (await eventsFor("moderation_measure", local.measureId)).map((event) => [
        event.event_type,
        event.payload,
      ]),
    ).toEqual([
      [
        "moderation.measure_taken",
        {
          caseId: opened.caseId,
          measure: "publication_blocked",
          scope: "environment",
          environmentId,
          objectId,
          reviewId: null,
          dimension: null,
        },
      ],
    ]);

    // A closed report takes no more measures.
    await run(closeCase, admin, {
      caseId: opened.caseId,
      body: "Saken er avsluttet.",
    });
    await expect(
      measure(admin, opened.caseId, "publication_rejected"),
    ).rejects.toMatchObject(conflict);
  });

  it("is never handled by someone involved, and reaches only what the reporter can see", async () => {
    const { admin, environmentId, owner, borrower, objectId } =
      await published();
    // The object's owner is also an administrator: they may not handle it.
    await administrator(environmentId, admin, owner);

    const opened = await run(reportInEnvironment, borrower, {
      environmentId,
      target: { kind: "object", objectId },
      body: "Objektet er farlig.",
    });
    await expect(
      run(claimCase, owner, { caseId: opened.caseId }),
    ).rejects.toMatchObject(notFound);
    await expect(
      measure(owner, opened.caseId, "publication_blocked"),
    ).rejects.toMatchObject(notFound);

    // An owner reports nothing about their own object; nobody reports
    // themselves or someone who is not a member.
    await expect(
      run(reportInEnvironment, owner, {
        environmentId,
        target: { kind: "object", objectId },
        body: "Test.",
      }),
    ).rejects.toMatchObject(notFound);
    await expect(
      run(reportInEnvironment, borrower, {
        environmentId,
        target: { kind: "user", userId: borrower.userId },
        body: "Test.",
      }),
    ).rejects.toMatchObject(notFound);
    await expect(
      run(reportInEnvironment, borrower, {
        environmentId,
        target: { kind: "user", userId: (await user()).userId },
        body: "Test.",
      }),
    ).rejects.toMatchObject(notFound);
    // A non-member reports nothing there.
    await expect(
      run(reportInEnvironment, await user(), {
        environmentId,
        target: { kind: "object", objectId },
        body: "Test.",
      }),
    ).rejects.toMatchObject(forbidden);
  });

  it("goes to the platform only as a separate report (PS-TRUST-016)", async () => {
    const { admin, environmentId, owner, borrower } = await published();
    const { actor: handler, weak } = await steward();

    const local = await run(reportInEnvironment, borrower, {
      environmentId,
      target: { kind: "user", userId: owner.userId },
      body: "Han truet meg.",
    });
    // The reported member never sees it, also after blocking the reporter.
    await run(blockUser, owner, { userId: borrower.userId });
    await expect(read(owner, local.caseId)).rejects.toMatchObject(notFound);

    // Only the acting administrator takes it further.
    await expect(
      run(escalateReport, borrower, {
        caseId: local.caseId,
        body: "Til plattformen.",
      }),
    ).rejects.toMatchObject(forbidden);
    const escalated = await run(escalateReport, admin, {
      caseId: local.caseId,
      body: "Trusler hører hjemme hos plattformen.",
    });
    expect(escalated).toMatchObject({ created: true });

    const platformCase = await read(admin, escalated.caseId);
    expect(platformCase).toMatchObject({
      kind: "platform_report",
      viewer: "party",
      reportTarget: "user",
      subjectUserId: owner.userId,
      escalatedFromCaseId: local.caseId,
      environmentId: null,
    });
    // The local report goes on as it was.
    expect(await read(admin, local.caseId)).toMatchObject({
      status: "open",
      kind: "environment_report",
    });

    // Stewards handle it, only with stronger authentication (OD-0010).
    expect(
      (
        await executeQuery(tick(), listPlatformCaseQueue, {
          actor: handler,
          input: {},
        })
      ).items.map((item) => item.id),
    ).toContain(escalated.caseId);
    await expect(
      run(claimCase, weak, { caseId: escalated.caseId }),
    ).rejects.toMatchObject(strongerAuthentication);
    await run(claimCase, handler, { caseId: escalated.caseId });
    expect(
      (await eventsFor("case", local.caseId)).map((event) => event.event_type),
    ).toContain("moderation.report_escalated");
  });
});

describe("platform measures on an object (PS-OBJ-017, PS-TRUST-013)", () => {
  it("block new loans everywhere until lifted, while approved loans go on", async () => {
    const loan = await reservedLoan(1, 2);
    const { owner, objectId, environmentId } = loan;
    const { actor: handler } = await steward();
    const other = await member(environmentId, loan.admin);

    const opened = await run(reportToPlatform, other, {
      target: { kind: "object", objectId },
      body: "Dette er et ulovlig våpen.",
    });
    await run(claimCase, handler, { caseId: opened.caseId });
    await measure(handler, opened.caseId, "object_blocked", {
      reason: "Ulovlig gjenstand.",
    });
    await expect(
      measure(handler, opened.caseId, "object_blocked"),
    ).rejects.toMatchObject(conflict);

    // Left out of discovery, and no new request.
    const listed = await executeQuery(tick(), listEnvironmentObjects, {
      actor: other,
      input: { environmentId },
    });
    expect(listed.objects.map((item) => item.objectId)).not.toContain(objectId);
    await expect(
      ask(other, objectId, environmentOrigin(environmentId), dated(5, 6)),
    ).rejects.toMatchObject(notFound);

    // The loan already approved is handed over as agreed.
    kit.advance(24 * 60 * 60 * 1000);
    await run(reportHandover, owner, {
      loanId: loan.loanId,
      agreementVersion: 1,
      outcome: "handed_over",
    });

    await measure(handler, opened.caseId, "object_unblocked", {
      reason: "Avklart: lovlig.",
    });
    const request = await ask(
      other,
      objectId,
      environmentOrigin(environmentId),
      dated(5, 6),
    );
    expect(request).toMatchObject({ requestId: expect.any(String) });
  });

  it("is reported only by someone who has met the object, never its owner", async () => {
    const { owner, objectId } = await published();

    await expect(
      run(reportToPlatform, await user(), {
        target: { kind: "object", objectId },
        body: "Test.",
      }),
    ).rejects.toMatchObject(notFound);
    await expect(
      run(reportToPlatform, owner, {
        target: { kind: "object", objectId },
        body: "Test.",
      }),
    ).rejects.toMatchObject(notFound);
    await expect(
      run(reportToPlatform, owner, {
        target: { kind: "user", userId: (await user()).userId },
        body: "Test.",
      }),
    ).rejects.toMatchObject(notFound);
  });
});

describe("reports after a block (PS-USR-006, PS-TRUST-013)", () => {
  const reportUser = (actor: UserActor, userId: string) =>
    run(reportToPlatform, actor, {
      target: { kind: "user", userId },
      body: "Sender truende meldinger.",
    });

  it("keep the context a friendship or the other's request gave", async () => {
    const [anna, bo, cia] = await Promise.all([user(), user(), user()]);
    // A friendship Anna ends by blocking Bo.
    await friends(anna, bo);
    const objectId = await create(bo);
    await run(blockUser, anna, { userId: bo.userId });
    await expect(reportUser(anna, bo.userId)).resolves.toMatchObject({
      caseId: expect.any(String),
    });
    await expect(
      run(reportToPlatform, anna, {
        target: { kind: "object", objectId },
        body: "Farlig.",
      }),
    ).resolves.toMatchObject({ caseId: expect.any(String) });

    // A request Bo sent Cia, which her block ends.
    await run(sendFriendRequest, bo, { userId: cia.userId });
    await run(blockUser, cia, { userId: bo.userId });
    await expect(reportUser(cia, bo.userId)).resolves.toMatchObject({
      caseId: expect.any(String),
    });
    // Sending it gave Bo no context with Cia.
    await expect(reportUser(bo, cia.userId)).rejects.toMatchObject(notFound);
  });

  it("are never opened by a block or a request alone", async () => {
    const [dag, eva, finn] = await Promise.all([user(), user(), user()]);
    await run(blockUser, dag, { userId: eva.userId });
    await expect(reportUser(dag, eva.userId)).rejects.toMatchObject(notFound);
    await run(sendFriendRequest, dag, { userId: finn.userId });
    await expect(reportUser(dag, finn.userId)).rejects.toMatchObject(notFound);
    // The same answer as for an id nobody has.
    await expect(
      reportUser(dag, "00000000-0000-4000-8000-00000000dead"),
    ).rejects.toMatchObject(notFound);
  });
});

describe("moderation of reviews (PS-TRUST-014–015)", () => {
  /** A returned loan whose parties reviewed each other, published. */
  async function reviewedLoan() {
    const setup = await published();
    const { requestId } = await ask(
      setup.borrower,
      setup.objectId,
      environmentOrigin(setup.environmentId),
      dated(0, 2),
    );
    const { loanId } = await run(approveLoanRequest, setup.owner, {
      requestId,
    });
    await run(reportHandover, setup.owner, {
      loanId,
      agreementVersion: 1,
      outcome: "handed_over",
    });
    await run(reportReturn, setup.owner, {
      loanId,
      agreementVersion: 1,
      outcome: "received",
      immediately: true,
    });
    await run(submitLoanReview, setup.owner, {
      loanId,
      scores: [
        { dimension: "pickup_on_time", score: 5 },
        { dimension: "return_on_time", score: 2 },
        { dimension: "condition_at_return", score: 4 },
        { dimension: "communication", score: 5 },
      ],
      text: "Kom sent. Naboen Kari sa han er upålitelig.",
    });
    await run(submitLoanReview, setup.borrower, {
      loanId,
      scores: [
        { dimension: "available_at_handover", score: 5 },
        { dimension: "available_for_return", score: 5 },
        { dimension: "matches_description", score: 5 },
        { dimension: "communication", score: 5 },
      ],
    });
    const reviews = await executeQuery(tick(), readLoanReviews, {
      actor: setup.borrower,
      input: { loanId },
    });

    return {
      ...setup,
      loanId,
      reviewId: reviews.received?.id as string,
      ownReviewId: reviews.own?.id as string,
    };
  }

  const reviewsOf = (actor: UserActor, loanId: string) =>
    executeQuery(tick(), readLoanReviews, { actor, input: { loanId } });

  /** The person's own trust profile (WP-51): what aggregates count. */
  const trustOf = (actor: UserActor) =>
    executeQuery(tick(), readTrustProfile, {
      actor,
      input: { userId: actor.userId },
    });
  const dimensionOf = (
    profile: Awaited<ReturnType<typeof trustOf>>,
    dimension: string,
  ) =>
    profile.asBorrower.dimensions.find((item) => item.dimension === dimension);

  it("removes text or a score through a traceable measure, and the rest stands", async () => {
    const { owner, borrower, loanId, reviewId } = await reviewedLoan();
    const { actor: handler } = await steward();

    // Only the reviewed party reports the review about them.
    await expect(
      run(reportToPlatform, owner, {
        target: { kind: "review", reviewId },
        body: "Test.",
      }),
    ).rejects.toMatchObject(notFound);
    expect(
      dimensionOf(await trustOf(borrower), "return_on_time"),
    ).toMatchObject({ count: 1, mean: 2 });
    const opened = await run(reportToPlatform, borrower, {
      target: { kind: "review", reviewId },
      body: "Anmeldelsen nevner en tredjeperson.",
    });
    // The author never learns of it through the case.
    await expect(read(owner, opened.caseId)).rejects.toMatchObject(notFound);

    await run(claimCase, handler, { caseId: opened.caseId });
    await measure(handler, opened.caseId, "review_text_removed", {
      reason: "Tredjepartsopplysninger.",
    });
    await measure(handler, opened.caseId, "review_score_removed", {
      dimension: "return_on_time",
      reason: "Bygger på opplysninger fra en tredjeperson.",
    });
    // A dimension is named only for a score, and a removed one is gone.
    await expect(
      measure(handler, opened.caseId, "review_text_removed"),
    ).rejects.toMatchObject(conflict);
    await expect(
      measure(handler, opened.caseId, "review_score_removed", {
        dimension: "return_on_time",
      }),
    ).rejects.toMatchObject(conflict);
    await expect(
      measure(handler, opened.caseId, "review_removed", {
        dimension: "communication",
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    // A response's measure does not fit a report about the review.
    await expect(
      measure(handler, opened.caseId, "review_response_removed"),
    ).rejects.toMatchObject(conflict);

    for (const party of [owner, borrower]) {
      const seen = await reviewsOf(party, loanId);
      const review = party === owner ? seen.own : seen.received;
      expect(review).toMatchObject({
        status: "published",
        text: null,
        moderated: {
          textRemoved: true,
          removedDimensions: ["return_on_time"],
        },
      });
      expect(review?.scores.map(({ dimension }) => dimension)).toEqual([
        "pickup_on_time",
        "condition_at_return",
        "communication",
      ]);
    }

    // What was removed is kept for the handlers only.
    expect(
      (await measuresOf(handler, opened.caseId)).items.map((item) => [
        item.kind,
        item.removedText,
        item.removedScore,
      ]),
    ).toEqual([
      [
        "review_text_removed",
        "Kom sent. Naboen Kari sa han er upålitelig.",
        null,
      ],
      ["review_score_removed", null, 2],
    ]);

    // The aggregates no longer count the removed score (PS-TRUST-014), and
    // the profile shows the review without its text.
    const trust = await trustOf(borrower);
    expect(trust.asBorrower.reviews).toBe(1);
    expect(dimensionOf(trust, "return_on_time")).toMatchObject({
      count: 0,
      mean: null,
    });
    expect(dimensionOf(trust, "communication")).toMatchObject({ count: 1 });
    expect(trust.reviews).toEqual([
      expect.objectContaining({ id: reviewId, text: null }),
    ]);
    expect(
      trust.reviews[0]?.scores.map(({ dimension }) => dimension),
    ).not.toContain("return_on_time");
  });

  it("removes a whole review, which then counts nowhere", async () => {
    const { owner, borrower, loanId, reviewId } = await reviewedLoan();
    const { actor: handler } = await steward();
    const opened = await run(reportToPlatform, borrower, {
      target: { kind: "review", reviewId },
      body: "Hele anmeldelsen er hevn.",
    });
    await run(claimCase, handler, { caseId: opened.caseId });
    await measure(handler, opened.caseId, "review_removed");

    expect((await reviewsOf(borrower, loanId)).received).toMatchObject({
      status: "removed",
      scores: [],
      text: null,
    });
    expect((await reviewsOf(owner, loanId)).own).toMatchObject({
      status: "removed",
    });
    // Nor in the trust profile or its aggregates.
    const trust = await trustOf(borrower);
    expect(trust.asBorrower.reviews).toBe(0);
    expect(trust.asBorrower.dimensions.every(({ count }) => count === 0)).toBe(
      true,
    );
    expect(trust.reviews).toEqual([]);
    // A removed review is answered no more, and takes no further measure.
    await expect(
      run(respondToLoanReview, borrower, { loanId, text: "Uenig." }),
    ).rejects.toMatchObject(conflict);
    await expect(
      measure(handler, opened.caseId, "review_text_removed"),
    ).rejects.toMatchObject(conflict);
  });

  it("removes a response's text; it stays the one response", async () => {
    const { owner, borrower, loanId, reviewId } = await reviewedLoan();
    const { actor: handler } = await steward();
    await run(respondToLoanReview, borrower, {
      loanId,
      text: "Kari er en løgner.",
    });

    // Only the review's author reports the response to it.
    await expect(
      run(reportToPlatform, borrower, {
        target: { kind: "review_response", reviewId },
        body: "Test.",
      }),
    ).rejects.toMatchObject(notFound);
    const opened = await run(reportToPlatform, owner, {
      target: { kind: "review_response", reviewId },
      body: "Svaret henger ut en tredjeperson.",
    });
    await run(claimCase, handler, { caseId: opened.caseId });
    await measure(handler, opened.caseId, "review_response_removed");

    expect((await reviewsOf(owner, loanId)).own?.response).toMatchObject({
      text: null,
      removed: true,
    });
    await expect(
      run(respondToLoanReview, borrower, { loanId, text: "Nytt svar." }),
    ).rejects.toMatchObject(conflict);
    // The review itself stands.
    expect((await reviewsOf(borrower, loanId)).received).toMatchObject({
      status: "published",
      text: "Kom sent. Naboen Kari sa han er upålitelig.",
    });
    expect((await trustOf(borrower)).reviews).toEqual([
      expect.objectContaining({ id: reviewId, response: null }),
    ]);
  });

  it("is never handled by a steward who is a party", async () => {
    const { borrower, owner, reviewId } = await reviewedLoan();
    const opened = await run(reportToPlatform, borrower, {
      target: { kind: "review", reviewId },
      body: "Usant.",
    });
    // The author, made a steward, still never sees the report.
    await run(grantPlatformRole, ops, {
      email: (
        await db
          .selectFrom("app.verified_contacts")
          .select("address")
          .where("user_id", "=", owner.userId)
          .where("kind", "=", "email")
          .executeTakeFirstOrThrow()
      ).address,
      role: "platform_steward",
      reason: "Pilot steward",
    });
    const strongOwner = {
      ...owner,
      platformRoles: ["platform_steward" as const],
      authentication: { ...owner.authentication, assurance: "aal2" as const },
    } satisfies UserActor;
    await expect(
      run(claimCase, strongOwner, { caseId: opened.caseId }),
    ).rejects.toMatchObject(notFound);
  });
});
