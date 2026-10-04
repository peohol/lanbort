import {
  type HomeItem,
  type HomeItemKind,
  loanPageSize,
  loanRequestPageSize,
} from "@lanbort/contracts";
import { afterAll, describe, expect, it } from "vitest";
import type { UserActor } from "../actor";
import { executeQuery } from "../commands/query";
import {
  approveMembership,
  inviteMember,
  joinEnvironment,
} from "../environment/membership-commands";
import { inviteAdministrator } from "../environment/role-commands";
import { proposeLoanAmendment } from "../loans/amendments";
import { approveLoanRequest } from "../loans/approval";
import { reportHandover } from "../loans/handover";
import { listLoans } from "../loans/queries";
import { reportReturn } from "../loans/return";
import { inviteCoOwner } from "../objects/co-owners";
import { publishObject, setObjectApproval } from "../publications/commands";
import { submitLoanReview } from "../reviews/commands";
import { sendFriendRequest } from "../social/commands";
import { connectTestDatabase } from "../testing/database";
import { loanTestKit } from "../testing/loans";
import { readHome } from "./queries";

/**
 * WP-60: Home shows what asks something of the caller (UX-IA-005), each
 * part as the context it leads to shows it, and nothing to anyone else.
 */
const db = connectTestDatabase();
afterAll(() => db.destroy());

const kit = loanTestKit(db);
const {
  run,
  tick,
  user,
  environment,
  member,
  create,
  published,
  environmentOrigin,
  ask,
  dated,
  day,
  reservedLoan,
} = kit;

const oneDay = 24 * 60 * 60 * 1000;

const home = (actor: UserActor) =>
  executeQuery(tick(), readHome, { actor, input: {} });

/** The caller's Home items about `id`, as kind and section. */
async function about(actor: UserActor, id: string) {
  const { sections } = await home(actor);

  return sections.flatMap(({ section, items }) =>
    items
      .filter((item) => item.target.id === id)
      .map((item) => ({ section, kind: item.kind })),
  );
}

const only = (section: string, kind: HomeItemKind) => [{ section, kind }];

async function item(actor: UserActor, id: string): Promise<HomeItem> {
  const { sections } = await home(actor);
  const found = sections
    .flatMap(({ items }) => items)
    .find((candidate) => candidate.target.id === id);

  if (!found) throw new Error(`Nothing on Home about ${id}`);

  return found;
}

describe("loan requests on Home", () => {
  it("asks the owner to answer, and nobody else", async () => {
    const { owner, borrower, admin, objectId, environmentId } =
      await published();
    const { requestId } = await ask(
      borrower,
      objectId,
      environmentOrigin(environmentId),
    );

    expect(await about(owner, requestId)).toEqual(
      only("awaiting_you", "loan_request.answer"),
    );
    expect(await item(owner, requestId)).toMatchObject({
      title: "Tilhenger",
      role: "lender",
    });
    // The borrower waits for the owner; that asks nothing of them.
    expect(await about(borrower, requestId)).toEqual([]);
    expect(await about(admin, requestId)).toEqual([]);
  });
});

describe("loans on Home", () => {
  it("shows a reserved loan's handover day to both parties only", async () => {
    const { owner, borrower, admin, loanId } = await reservedLoan(2, 4);

    for (const party of [owner, borrower]) {
      expect(await about(party, loanId)).toEqual(
        only("upcoming", "loan.handover"),
      );
    }

    expect(await item(borrower, loanId)).toMatchObject({
      day: day(2),
      role: "borrower",
    });
    expect(await about(admin, loanId)).toEqual([]);
    expect(await about(await user(), loanId)).toEqual([]);
  });

  it("asks only the other side to answer a proposed change", async () => {
    const { owner, borrower, loanId } = await reservedLoan(2, 4);
    await run(proposeLoanAmendment, borrower, {
      loanId,
      agreementVersion: 1,
      period: { start: day(3), end: day(5) },
    });

    expect(await about(owner, loanId)).toEqual(
      only("awaiting_you", "loan.answer_amendment"),
    );
    expect(await about(borrower, loanId)).toEqual(
      only("upcoming", "loan.handover"),
    );
  });

  it("asks each party for their handover statement once the day is over", async () => {
    const { owner, borrower, loanId } = await reservedLoan(1, 3);
    kit.advance(2 * oneDay);

    for (const party of [owner, borrower]) {
      expect(await about(party, loanId)).toEqual(
        only("awaiting_you", "loan.report_handover"),
      );
    }

    await run(reportHandover, borrower, {
      loanId,
      agreementVersion: 1,
      outcome: "not_handed_over",
    });

    // The borrower waits now; the owner has until the deadline to answer.
    expect(await about(borrower, loanId)).toEqual(
      only("unresolved", "loan.awaiting_handover"),
    );
    expect(await about(owner, loanId)).toEqual(
      only("awaiting_you", "loan.report_handover"),
    );
    expect((await item(owner, loanId)).dueAt).not.toBeNull();
  });

  it("shows an active loan's return day, then asks for the return", async () => {
    const { owner, borrower, loanId } = await reservedLoan(0, 1);
    await run(reportHandover, owner, {
      loanId,
      agreementVersion: 1,
      outcome: "handed_over",
    });

    expect(await about(borrower, loanId)).toEqual(
      only("upcoming", "loan.return"),
    );

    kit.advance(2 * oneDay);

    expect(await about(borrower, loanId)).toEqual(
      only("awaiting_you", "loan.report_return"),
    );
    expect(await about(owner, loanId)).toEqual(
      only("awaiting_you", "loan.confirm_return"),
    );

    await run(reportReturn, borrower, {
      loanId,
      agreementVersion: 1,
      outcome: "still_has",
    });

    for (const party of [owner, borrower]) {
      expect(await about(party, loanId)).toEqual(
        only("unresolved", "loan.late"),
      );
    }
  });

  it("asks both to review after the return, until each has", async () => {
    const { owner, borrower, loanId } = await reservedLoan(0, 2);
    await run(reportHandover, owner, {
      loanId,
      agreementVersion: 1,
      outcome: "handed_over",
    });
    await run(reportReturn, owner, {
      loanId,
      agreementVersion: 1,
      outcome: "received",
      immediately: true,
    });

    for (const party of [owner, borrower]) {
      expect(await about(party, loanId)).toEqual(
        only("awaiting_you", "loan.write_review"),
      );
    }

    await run(submitLoanReview, borrower, {
      loanId,
      scores: [
        "available_at_handover",
        "available_for_return",
        "matches_description",
        "communication",
      ].map((dimension) => ({ dimension, score: 4 })),
    });

    expect(await about(borrower, loanId)).toEqual([]);
    expect(await about(owner, loanId)).toEqual(
      only("awaiting_you", "loan.write_review"),
    );
  });

  it("lists the caller's loans as party only, current or ended", async () => {
    const { owner, borrower, admin, loanId } = await reservedLoan(2, 4);
    const list = (actor: UserActor, input: object) =>
      executeQuery(tick(), listLoans, { actor, input });

    for (const party of [owner, borrower]) {
      const { loans } = await list(party, { state: "current" });
      expect(loans.map((loan) => loan.id)).toContain(loanId);
    }

    expect(
      (await list(owner, { state: "current", role: "borrower" })).loans,
    ).toEqual([]);
    expect((await list(owner, { state: "ended" })).loans).toEqual([]);
    expect((await list(admin, { state: "current" })).loans).toEqual([]);
  });
});

describe("relations on Home", () => {
  it("asks the addressee of a friend request, by name", async () => {
    const anna = await user();
    const bo = await user();
    await run(sendFriendRequest, anna, { userId: bo.userId });

    expect(await about(bo, anna.userId)).toEqual(
      only("awaiting_you", "social.answer_friend_request"),
    );
    expect((await item(bo, anna.userId)).title).not.toBeNull();
    expect(await about(anna, bo.userId)).toEqual([]);
  });

  it("asks an invited co-owner to answer", async () => {
    const owner = await user();
    const invited = await user();
    const objectId = await create(owner);
    const { invitationId } = await run(inviteCoOwner, owner, {
      objectId,
      userId: invited.userId,
    });

    expect(await about(invited, invitationId)).toEqual(
      only("awaiting_you", "object.answer_co_owner_invitation"),
    );
    expect(await about(owner, invitationId)).toEqual([]);
  });
});

describe("environments on Home", () => {
  it("asks an invitee to answer, and never shows a hidden environment to others", async () => {
    const admin = await user();
    const environmentId = await environment(admin, { type: "hidden" });
    const invitee = await user();
    await run(inviteMember, admin, {
      environmentId,
      userId: invitee.userId,
    });

    expect(await about(invitee, environmentId)).toEqual(
      only("awaiting_you", "environment.answer_invitation"),
    );
    expect(await about(await user(), environmentId)).toEqual([]);
    expect((await home(admin)).environments.map(({ id }) => id)).toContain(
      environmentId,
    );
    expect(
      (await home(invitee)).environments.map(({ id }) => id),
    ).not.toContain(environmentId);
  });

  it("asks the invited administrator to answer the role", async () => {
    const admin = await user();
    const environmentId = await environment(admin);
    const other = await member(environmentId, admin);
    await run(inviteAdministrator, admin, {
      environmentId,
      userId: other.userId,
    });

    expect(await about(other, environmentId)).toEqual(
      only("awaiting_you", "environment.answer_role_invitation"),
    );
  });

  it("gives administrators the applications to decide, but not their own", async () => {
    const admin = await user();
    const environmentId = await environment(admin, { type: "closed" });
    const applicant = await user();
    const { membershipId } = await run(joinEnvironment, applicant, {
      environmentId,
      answers: [],
    });

    expect(await item(admin, environmentId)).toMatchObject({
      kind: "environment.review_memberships",
      count: 1,
    });
    expect(await about(applicant, environmentId)).toEqual([]);

    await run(approveMembership, admin, { environmentId, membershipId });

    expect(await about(admin, environmentId)).toEqual([]);
  });

  it("gives administrators publications to approve, except of objects they own", async () => {
    const admin = await user();
    const environmentId = await environment(admin);
    await run(setObjectApproval, admin, { environmentId, required: true });
    const owner = await member(environmentId, admin);
    const plain = await member(environmentId, admin);

    await run(publishObject, admin, {
      objectId: await create(admin),
      environmentId,
    });
    expect(await about(admin, environmentId)).toEqual([]);

    await run(publishObject, owner, {
      objectId: await create(owner),
      environmentId,
    });
    expect(await item(admin, environmentId)).toMatchObject({
      kind: "environment.review_publications",
      count: 1,
    });
    expect(await about(plain, environmentId)).toEqual([]);
    expect(await about(owner, environmentId)).toEqual([]);
  });
});

describe("the order of Home", () => {
  it("has every section in order, what is due soonest first", async () => {
    const { owner, borrower, objectId, environmentId } = await published();
    const later = await ask(
      borrower,
      objectId,
      environmentOrigin(environmentId),
      dated(8, 9),
    );
    const sooner = await ask(
      borrower,
      objectId,
      environmentOrigin(environmentId),
      dated(5, 6),
    );
    const { sections } = await home(owner);

    expect(sections.map(({ section }) => section)).toEqual([
      "awaiting_you",
      "unresolved",
      "upcoming",
      "administration",
    ]);
    expect(
      sections[0]!.items
        .filter(({ target }) =>
          [later.requestId, sooner.requestId].includes(target.id),
        )
        .map(({ kind }) => kind),
    ).toEqual(["loan_request.answer", "loan_request.answer"]);
  });
});

describe("Home beyond the first page", () => {
  it("keeps the oldest requests and loans once newer ones fill a page", async () => {
    const { owner, borrower, objectId, environmentId } = await published();
    const count = Math.max(loanPageSize, loanRequestPageSize) + 1;
    const requestIds: string[] = [];

    // One-day requests on separate days, oldest first, so all can be approved.
    for (let index = 0; index < count; index += 1) {
      const { requestId } = await ask(
        borrower,
        objectId,
        environmentOrigin(environmentId),
        dated(2 * index + 2, 2 * index + 2),
      );
      requestIds.push(requestId);
    }

    const kinds = async (actor: UserActor, ids: readonly string[]) => {
      const { sections } = await home(actor);

      return sections
        .flatMap(({ items }) => items)
        .filter(({ target }) => ids.includes(target.id))
        .map(({ kind }) => kind);
    };

    expect(await kinds(owner, requestIds)).toEqual(
      Array(count).fill("loan_request.answer"),
    );

    const loanIds: string[] = [];

    for (const requestId of requestIds) {
      const { loanId } = await run(approveLoanRequest, owner, { requestId });
      loanIds.push(loanId);
    }

    for (const party of [owner, borrower]) {
      expect(await kinds(party, loanIds)).toEqual(
        Array(count).fill("loan.handover"),
      );
    }
    // Over a hundred commands one after another, alongside every other
    // integration file.
  }, 30_000);
});
