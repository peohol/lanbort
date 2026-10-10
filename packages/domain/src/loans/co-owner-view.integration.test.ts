import { randomUUID } from "node:crypto";
import { coOwnerLoanViewSchema, loanSchema } from "@lanbort/contracts";
import { afterAll, describe, expect, it } from "vitest";
import type { UserActor } from "../actor";
import { executeQuery } from "../commands/query";
import { leaveObject } from "../index";
import { readLoanReviews } from "../reviews/queries";
import { connectTestDatabase } from "../testing/database";
import { loanTestKit } from "../testing/loans";
import { approveLoanRequest } from "./approval";
import { readLoanAsCoOwner } from "./co-owner-view";
import { reportHandover } from "./handover";
import { readLoanHistory } from "./history";
import { readLoan } from "./queries";
import {
  acceptResponsibilityTransfer,
  offerResponsibility,
  withdrawResponsibilityTransfer,
} from "./responsibility";
import { reportReturn } from "./return";

/**
 * UX-PRIV-013: a co-owner who is not a party sees a loan only when they
 * owned the object at its approval and still do, or are asked to become its
 * responsible lender, and then only the restricted view. Later co-owners
 * who were not asked, and former co-owners, learn nothing, exactly as for
 * a loan that does not exist; the parties' own view is unchanged.
 */
const db = connectTestDatabase();
afterAll(() => db.destroy());

const kit = loanTestKit(db);
const {
  run,
  tick,
  user,
  published,
  addCoOwner,
  ask,
  environmentOrigin,
  dated,
  reservedLoan,
  day,
} = kit;

const notFound = { code: "not_found" };
const forbidden = { code: "forbidden" };

const viewOf = async (actor: UserActor, loanId: string) =>
  coOwnerLoanViewSchema.parse(
    await executeQuery(tick(), readLoanAsCoOwner, {
      actor,
      input: { loanId },
    }),
  );

const loanOf = (actor: UserActor, loanId: string) =>
  executeQuery(tick(), readLoan, { actor, input: { loanId } });

/**
 * A loan approved while `circle` co-owned the object with the lender: the
 * borrower asks for days 0–2 through the environment, with a message.
 */
async function loanWithCircle() {
  const setup = await published();
  const circle = await user();
  await addCoOwner(setup.owner, setup.objectId, circle);
  const { requestId } = await ask(
    setup.borrower,
    setup.objectId,
    environmentOrigin(setup.environmentId),
    { ...dated(0, 2), message: "Hemmelig melding til utlåneren" },
  );
  const { loanId } = await run(approveLoanRequest, setup.owner, {
    requestId,
  });

  return { ...setup, circle, requestId, loanId };
}

describe("a co-owner who owned the object when the loan was approved", () => {
  it("sees only the status, period, object, terms and the parties' names", async () => {
    const { owner, borrower, circle, loanId, objectId } =
      await loanWithCircle();

    const view = await viewOf(circle, loanId);
    expect(view).toEqual({
      id: loanId,
      objectId,
      status: "reserved",
      ending: null,
      period: { start: day(0), end: day(2) },
      title: expect.any(String),
      categoryId: expect.any(String),
      loanTerms: "Må vaskes etter bruk.",
      images: [],
      parties: {
        borrower: expect.objectContaining({ realName: "Test Testesen" }),
        lender: expect.objectContaining({ realName: "Test Testesen" }),
      },
      responsibilityTransfer: null,
      actions: { responsibility: [], confirmControl: false },
    });
    // Nothing of the request, the parties' statements or their ids.
    const text = JSON.stringify(view);
    expect(text).not.toContain("Hemmelig melding");
    expect(text).not.toContain(borrower.userId);
    expect(text).not.toContain(owner.userId);

    // The parties' own reads stay theirs.
    await expect(loanOf(circle, loanId)).rejects.toMatchObject(notFound);
    await expect(
      executeQuery(tick(), readLoanHistory, {
        actor: circle,
        input: { loanId },
      }),
    ).rejects.toMatchObject(notFound);
    await expect(
      executeQuery(tick(), readLoanReviews, {
        actor: circle,
        input: { loanId },
      }),
    ).rejects.toMatchObject(notFound);
  });

  it("follows the loan as it goes on and after it ended", async () => {
    const { owner, borrower, circle, loanId } = await loanWithCircle();

    await run(reportHandover, owner, {
      loanId,
      agreementVersion: 1,
      outcome: "handed_over",
    });
    expect((await viewOf(circle, loanId)).status).toBe("active");

    await run(reportReturn, borrower, {
      loanId,
      agreementVersion: 1,
      outcome: "returned",
      immediately: true,
    });
    await run(reportReturn, owner, {
      loanId,
      agreementVersion: 1,
      outcome: "received",
      immediately: true,
    });
    const ended = await viewOf(circle, loanId);
    expect(ended.status).toBe("ended");
    expect(ended.ending).toEqual({
      reason: "returned",
      endedAt: expect.any(String),
    });
  });

  it("sees nothing once they left the object", async () => {
    const { circle, objectId, loanId } = await loanWithCircle();
    await run(leaveObject, circle, { objectId });

    await expect(viewOf(circle, loanId)).rejects.toMatchObject(notFound);
  });
});

describe("a co-owner who joined after the approval", () => {
  it("sees nothing unless asked, exactly as for a loan that does not exist", async () => {
    const { owner, objectId, loanId } = await reservedLoan(2, 4);
    const later = await user();
    await addCoOwner(owner, objectId, later);

    const unknown = await viewOf(later, randomUUID()).catch(
      (error: unknown) => error,
    );
    const real = await viewOf(later, loanId).catch((error: unknown) => error);
    expect(real).toMatchObject(notFound);
    expect(JSON.stringify(real)).toBe(JSON.stringify(unknown));
  });

  it("sees the loan while the lender's role is offered to them, with their own answers", async () => {
    const { owner, objectId, loanId } = await reservedLoan(2, 4);
    const later = await user();
    await addCoOwner(owner, objectId, later);
    const { transferId } = await run(offerResponsibility, owner, {
      loanId,
      toUserId: later.userId,
    });

    const offered = await viewOf(later, loanId);
    expect(offered.responsibilityTransfer).toMatchObject({
      id: transferId,
      kind: "voluntary",
      toUserId: later.userId,
      needsBorrowerConsent: true,
      recipientAccepted: false,
    });
    expect(offered.actions.responsibility).toEqual(["accept", "decline"]);

    // Accepted, the offer waits for the borrower: nothing left to answer.
    await run(acceptResponsibilityTransfer, later, { loanId, transferId });
    expect((await viewOf(later, loanId)).actions.responsibility).toEqual([]);

    // Withdrawn, the loan is not theirs to see any more.
    await run(withdrawResponsibilityTransfer, owner, { loanId, transferId });
    await expect(viewOf(later, loanId)).rejects.toMatchObject(notFound);
  });
});

describe("the parties", () => {
  it("keep their full view, and are told the co-owner's view is not theirs", async () => {
    const { owner, borrower, loanId } = await loanWithCircle();

    for (const party of [owner, borrower]) {
      const loan = loanSchema.parse(await loanOf(party, loanId));
      expect(loan.agreement.version).toBe(1);
      await expect(viewOf(party, loanId)).rejects.toMatchObject(forbidden);
    }
  });

  it("are joined by nobody else: a stranger learns nothing", async () => {
    const { loanId } = await loanWithCircle();
    const stranger = await user();

    await expect(viewOf(stranger, loanId)).rejects.toMatchObject(notFound);
  });
});
