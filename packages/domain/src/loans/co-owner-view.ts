import { type CoOwnerLoanView, loanReadQuerySchema } from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import type { Kysely } from "kysely";
import { takesNewActivity } from "../account/model";
import { realNames } from "../account/store";
import type { Actor } from "../actor";
import { defineQuery } from "../commands/query";
import { calendarDate } from "../objects/availability";
import { currentImages, inSnapshot } from "../objects/state";
import { linkIn, personLinks } from "../people/queries";
import { presentedLoanStatus, toApiPeriod } from "./model";
import { readLoanAsCoOwnerPolicy } from "./policies";
import { presentTransfer } from "./responsibility";
import { findTransfer, type TransferRecord } from "./responsibility-store";
import {
  findControlConfirmation,
  findLoan,
  type LoanRecord,
} from "./reservations";

type Db = Kysely<Database>;

/**
 * The open offer of the lender's role to `userId` that can still complete
 * (`app.lender_transfer_possible`), if any.
 */
async function offerTo(
  db: Db,
  loanId: string,
  userId: string,
): Promise<TransferRecord | null> {
  const open = await findTransfer(db, loanId);

  return open?.possible && open.toUserId === userId ? open : null;
}

/**
 * Whether `userId`, who is not a party, sees the loan as a co-owner
 * (UX-PRIV-013): they own its object now, and owned it when the loan was
 * approved or are asked to become its responsible lender. Someone who left
 * the object sees nothing, and neither does a later co-owner who was not
 * asked: co-ownership gives no insight into loans by itself.
 */
async function seesAsCoOwner(
  db: Db,
  loan: LoanRecord,
  userId: string,
  offer: TransferRecord | null,
): Promise<boolean> {
  if (loan.objectId === null) {
    return false;
  }

  const row = await db
    .selectFrom("app.loans as loan")
    .innerJoin(
      "app.object_owners as owner",
      "owner.object_id",
      "loan.object_id",
    )
    .select("loan.owner_ids_at_approval")
    .where("loan.id", "=", loan.id)
    .where("owner.user_id", "=", userId)
    .executeTakeFirst();

  return (
    row !== undefined &&
    (row.owner_ids_at_approval.includes(userId) || offer !== null)
  );
}

/**
 * Everything the restricted view shows, read only for a caller who may see
 * it: nothing more is read for callers the policy will turn away.
 */
async function loadView(db: Db, actor: Actor, loanId: string, now: Date) {
  const loan = await findLoan(db, { loanId });

  if (!loan) {
    return null;
  }

  const parties = {
    borrowerUserId: loan.borrowerUserId,
    responsibleLenderId: loan.responsibleLenderId,
  };
  const userId = actor.kind === "user" ? actor.userId : null;

  if (
    userId === null ||
    [loan.borrowerUserId, loan.responsibleLenderId].includes(userId)
  ) {
    return { ...parties, seesAsCoOwner: false, view: null };
  }

  const offer = await offerTo(db, loan.id, userId);

  if (!(await seesAsCoOwner(db, loan, userId, offer))) {
    return { ...parties, seesAsCoOwner: false, view: null };
  }

  const people = [loan.borrowerUserId, loan.responsibleLenderId];
  const names = await realNames(db, people);
  const links = await personLinks(db, userId, people, now);
  const person = (id: string) => ({
    realName: names.get(id) ?? null,
    ...linkIn(links, id),
  });
  const awaitingControl =
    loan.ending?.reason === "unresolved" &&
    (await findControlConfirmation(db, loan.id)) === null;

  return {
    ...parties,
    seesAsCoOwner: true,
    view: {
      loan,
      images: await currentImages(db, loan.objectId),
      offer,
      awaitingControl,
      parties: {
        borrower: person(loan.borrowerUserId),
        lender: person(loan.responsibleLenderId),
      },
    },
  };
}

type LoadedView = NonNullable<
  NonNullable<Awaited<ReturnType<typeof loadView>>>["view"]
>;

/** The view as of `now`, with only the caller's own steps. */
function presentView(
  actor: Actor,
  { loan, images, offer, awaitingControl, parties }: LoadedView,
  now: Date,
): CoOwnerLoanView {
  if (loan.objectId === null || actor.kind !== "user") {
    throw new Error("Only a current owner sees a loan as a co-owner");
  }

  // Only an offer the caller has not accepted yet asks them anything; a
  // later co-owner who accepted waits for the borrower (PS-LOAN-009).
  const answering =
    offer?.kind === "voluntary" && offer.recipientAcceptedAt === null;

  return {
    id: loan.id,
    objectId: loan.objectId,
    status: presentedLoanStatus(
      loan.status,
      loan.agreement.period,
      calendarDate(now),
    ),
    ending: loan.ending && {
      reason: loan.ending.reason,
      endedAt: loan.ending.endedAt.toISOString(),
    },
    period: toApiPeriod(loan.agreement.period),
    title: loan.agreement.title,
    categoryId: loan.agreement.categoryId,
    loanTerms: loan.agreement.loanTerms,
    images,
    parties,
    responsibilityTransfer: offer && presentTransfer(offer),
    actions: {
      responsibility: answering
        ? takesNewActivity(actor.accountStatus)
          ? ["accept", "decline"]
          : ["decline"]
        : [],
      confirmControl: awaitingControl,
    },
  };
}

/**
 * UX-PRIV-013: a loan as a co-owner who is not its party sees it, for one
 * who owned the object when the loan was approved and still owns it, or
 * who is asked to become its responsible lender. A notification about the
 * offered role or the return leads here, never to the parties' full view.
 * It has the status, the period, the object as agreed with its pictures as
 * they are now (PS-OBJ-021), the agreed terms and the parties' names, and
 * only the steps the caller may take: answering the offer of the role, and
 * confirming having the object back after the loan ended unresolved
 * (PS-LOAN-019). Taking the role over waits for
 * OD-0016 and is not offered. The request's message, the private chat, the
 * parties' statements and explanations, the timeline and the reviews are
 * never part of it (`loan.read_history` and `loan_review.read` stay with
 * the parties).
 */
export const readLoanAsCoOwner = defineQuery({
  name: "loan.read_as_co_owner",
  input: loanReadQuerySchema,
  policy: readLoanAsCoOwnerPolicy,
  load: ({ db, actor, input, now }) =>
    inSnapshot(db, async (tx) => {
      const loaded = await loadView(tx, actor, input.loanId, now);

      return loaded && { resource: loaded, context: undefined };
    }),
  present: ({ actor, resource, now }): CoOwnerLoanView => {
    if (!resource.view) {
      throw new Error("The policy allows only a co-owner who sees the loan");
    }

    return presentView(actor, resource.view, now);
  },
});
