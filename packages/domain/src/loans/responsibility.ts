import {
  type CoOwnerLoanList,
  coOwnerLoanListSchema,
  offerResponsibilitySchema,
  type ResponsibilityTransfer,
  type ResponsibilityTransferResult,
  responsibilityTransferReferenceSchema,
  responsibilityTransferResultSchema,
  takeOverResponsibilitySchema,
} from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import type { Kysely, Transaction } from "kysely";
import { z } from "zod";
import type { Actor } from "../actor";
import { defineCommand } from "../commands/command";
import { defineQuery } from "../commands/query";
import { DomainError } from "../errors";
import type { EventRecorder } from "../events/recorder";
import { calendarDate } from "../objects/availability";
import { actingUserId, inSnapshot } from "../objects/state";
import { blockedWithAny, lockPair } from "../social/pair";
import {
  loanResponsibilityAnswered,
  loanResponsibilityDeclined,
  loanResponsibilityProposed,
  loanResponsibilityTransferred,
  loanResponsibilityWithdrawn,
} from "./events";
import { inReturnPhase, presentedLoanStatus, toApiPeriod } from "./model";
import {
  acceptResponsibilityTransferPolicy,
  declineResponsibilityTransferPolicy,
  listCoOwnerLoansPolicy,
  offerResponsibilityPolicy,
  type ResponsibilityTransferResource,
  takeOverResponsibilityPolicy,
  withdrawResponsibilityTransferPolicy,
} from "./policies";
import { type LoadedLoan, loadLockedLoan } from "./resources";
import { findLoan, type LoanRecord } from "./reservations";
import {
  type CoOwnerReach,
  coOwnerLoanIds,
  completeTransfer,
  findTransfer,
  fullyAnswered,
  insertTransfer,
  loadCoOwnerReach,
  openTransfersTo,
  recordAnswer,
  resolveTransfer,
  type TransferRecord,
} from "./responsibility-store";
import { findPendingReturns } from "./return-store";
import { lapseUnspokenReturns, settleDueReturns } from "./return";

/**
 * The transfer of the responsible lender (WP-35, PS-LOAN-009). A loan
 * always has one responsible lender; the role moves only by an explicit,
 * traceable transfer, and never back by itself:
 * - the responsible lender offers it to a co-owner, who accepts it or not:
 *   no co-owner is made responsible for someone else's loan against their
 *   will (vision 04, «Overføring av ansvar for et konkret lån»);
 * - while the responsible lender is established as really unavailable
 *   (OD-0016 decides when), a co-owner takes it over;
 * - a co-owner who joined after the loan was approved also needs the
 *   borrower's express consent; the borrower is told of every other change,
 *   without having to approve it (`loan.responsibility_transferred`).
 * The new lender steps into the lender's side as it stands: the agreement,
 * the statements and open proposals of that side stay, and nothing about
 * the loan's terms changes. A block between the recipient and the borrower,
 * or (for an offer) between the two co-owners, stops it: it would be new
 * contact (PS-USR-006).
 */
type Db = Kysely<Database>;

function conflict(message: string, fields: readonly string[] = []): never {
  throw new DomainError("conflict", message, fields);
}

const transferResult = (
  loan: Pick<LoanRecord, "id">,
  transfer: Pick<TransferRecord, "id">,
  status: ResponsibilityTransferResult["status"],
  responsibleLenderId: string,
): ResponsibilityTransferResult => ({
  loanId: loan.id,
  transferId: transfer.id,
  status,
  responsibleLenderId,
});

function requireObject(loan: LoanRecord): string {
  if (loan.objectId === null) {
    conflict("The loan has ended");
  }

  return loan.objectId;
}

/**
 * The loan as it is once due return confirmations are made (every loan
 * command does this first), still going: an ended loan has no lender role
 * left to move.
 */
async function settledLoan(
  tx: Db,
  loan: LoanRecord,
  now: Date,
  events: EventRecorder,
): Promise<LoanRecord> {
  const settled = (await settleDueReturns(tx, loan, now, events)).loan;

  if (settled.status === "ended") {
    conflict("The loan has ended");
  }

  return settled;
}

/**
 * The loan's open transfer, unless it can no longer complete: then it
 * lapses now, so a new one can start.
 */
async function openTransfer(
  tx: Db,
  loanId: string,
  now: Date,
): Promise<TransferRecord | null> {
  const open = await findTransfer(tx, loanId, { lock: true });

  if (open && !open.possible) {
    await resolveTransfer(tx, {
      transferId: open.id,
      status: "lapsed",
      byUserId: null,
      now,
    });
    return null;
  }

  return open;
}

/**
 * Moves the role: the transfer completes, the recipient is the responsible
 * lender from now on, and a confirmation the former lender left waiting
 * lapses rather than being made in someone else's name.
 */
async function complete(
  tx: Db,
  input: {
    readonly loan: LoanRecord;
    readonly transfer: TransferRecord;
    readonly byUserId: string;
    readonly now: Date;
  },
  events: EventRecorder,
): Promise<void> {
  const { loan, transfer, now } = input;

  await completeTransfer(tx, { transfer, byUserId: input.byUserId, now });
  await lapseUnspokenReturns(tx, loan.id, now);
  events.record(loanResponsibilityTransferred, {
    resourceId: loan.id,
    payload: {
      objectId: requireObject(loan),
      transferId: transfer.id,
      kind: transfer.kind,
      fromUserId: transfer.fromUserId,
      toUserId: transfer.toUserId,
    },
  });
}

/**
 * Locks the social pairs the transfer depends on, so a block cannot cross
 * it: the recipient with the borrower, and with the lender for an offer.
 */
async function lockTransferPairs(
  tx: Db,
  loan: Pick<LoanRecord, "borrowerUserId" | "responsibleLenderId">,
  toUserId: string,
) {
  await lockPair(tx, toUserId, loan.borrowerUserId);
  await lockPair(tx, toUserId, loan.responsibleLenderId);
}

/**
 * PS-LOAN-009: the responsible lender offers the role to a co-owner, in one
 * transaction:
 * 1. the object is locked, then the loan, then the social pairs, so leaving
 *    the object, a block and other loan commands run one after another;
 * 2. the loan has not ended, and no other transfer is open (one that can no
 *    longer happen lapses first); offering the same co-owner again returns
 *    the open offer;
 * 3. the recipient owns the object now, is not the borrower, and has no
 *    block with the borrower or the lender; a co-owner who joined after the
 *    approval also needs the borrower's consent;
 * 4. the offer waits for the recipient's acceptance (and the borrower's
 *    consent when needed): until then the role stays.
 * Anyone who cannot take the role gets the same neutral `conflict`, never
 * saying whether they do not own the object or a block stands in the way.
 */
export const offerResponsibility = defineCommand({
  name: "loan.offer_responsibility",
  input: offerResponsibilitySchema,
  output: responsibilityTransferResultSchema,
  policy: offerResponsibilityPolicy,
  idempotency: "required",
  load: ({ tx, input }) => loadLockedLoan(tx, input.loanId),
  execute: async ({ tx, input, resource, events, now }) => {
    const loan = await settledLoan(tx, resource.loan, now, events);
    const { toUserId } = input;

    if (toUserId !== loan.borrowerUserId) {
      await lockTransferPairs(tx, loan, toUserId);
    }

    const open = await openTransfer(tx, loan.id, now);

    if (open) {
      if (open.kind === "voluntary" && open.toUserId === toUserId) {
        return transferResult(loan, open, "proposed", loan.responsibleLenderId);
      }

      conflict("Another change of the responsible lender is open");
    }

    const reach = await loadCoOwnerReach(tx, loan.id, toUserId);

    if (
      reach.standing === null ||
      reach.lenderUnavailable ||
      (await blockedWithAny(tx, loan.responsibleLenderId, [toUserId]))
    ) {
      conflict("They cannot take the role", ["toUserId"]);
    }

    const needsBorrowerConsent = reach.standing === "later";
    const transferId = await insertTransfer(tx, {
      loanId: loan.id,
      kind: "voluntary",
      fromUserId: loan.responsibleLenderId,
      toUserId,
      needsBorrowerConsent,
      completed: false,
      now,
    });
    events.record(loanResponsibilityProposed, {
      resourceId: loan.id,
      payload: {
        objectId: requireObject(loan),
        transferId,
        kind: "voluntary",
        toUserId,
        needsBorrowerConsent,
      },
    });

    return transferResult(
      loan,
      { id: transferId },
      "proposed",
      loan.responsibleLenderId,
    );
  },
});

/**
 * The loan, locked, with what the caller could do for its lender side. The
 * pair with the borrower is locked before it is read, so a block cannot
 * cross the decision.
 */
async function loadTakeover(
  tx: Transaction<Database>,
  actor: Actor,
  loanId: string,
) {
  const loaded = await loadLockedLoan(tx, loanId);

  if (!loaded || actor.kind !== "user") {
    return null;
  }

  const { resource } = loaded;
  let reach: CoOwnerReach = {
    standing: null,
    lenderUnavailable: false,
    receivesForLender: false,
  };

  if (
    actor.userId !== resource.borrowerUserId &&
    actor.userId !== resource.responsibleLenderId
  ) {
    await lockPair(tx, actor.userId, resource.borrowerUserId);
    reach = await loadCoOwnerReach(tx, loanId, actor.userId);
  }

  return {
    resource: {
      ...resource,
      standing: reach.standing,
      lenderUnavailable: reach.lenderUnavailable,
    },
    context: undefined,
  };
}

/**
 * PS-LOAN-009: while the responsible lender is established as really
 * unavailable, a co-owner who can step in takes the role over, in one
 * transaction, locked as an offer is:
 * - a co-owner who owned the object when the loan was approved is the
 *   responsible lender at once; the borrower is told, but not asked;
 * - a co-owner who joined since waits for the borrower's express consent.
 * An offer the unavailable lender left open lapses: the takeover is the way
 * on, also for its recipient. Taking over again returns the same result.
 * Nothing else about the loan changes, and the role does not move back if
 * the former lender returns: only a new, explicit transfer moves it.
 */
export const takeOverResponsibility = defineCommand({
  name: "loan.take_over_responsibility",
  input: takeOverResponsibilitySchema,
  output: responsibilityTransferResultSchema,
  policy: takeOverResponsibilityPolicy,
  idempotency: "required",
  load: ({ tx, actor, input }) => loadTakeover(tx, actor, input.loanId),
  execute: async ({ tx, actor, resource, events, now }) => {
    const loan = await settledLoan(tx, resource.loan, now, events);
    const userId = actingUserId(actor);
    const open = await openTransfer(tx, loan.id, now);

    if (open) {
      if (open.kind === "takeover" && open.toUserId === userId) {
        return transferResult(loan, open, "proposed", loan.responsibleLenderId);
      }

      conflict("Another change of the responsible lender is open");
    }

    const needsBorrowerConsent = resource.standing === "later";
    const transfer: TransferRecord = {
      id: await insertTransfer(tx, {
        loanId: loan.id,
        kind: "takeover",
        fromUserId: loan.responsibleLenderId,
        toUserId: userId,
        needsBorrowerConsent,
        completed: !needsBorrowerConsent,
        now,
      }),
      loanId: loan.id,
      kind: "takeover",
      fromUserId: loan.responsibleLenderId,
      toUserId: userId,
      needsBorrowerConsent,
      proposedAt: now,
      recipientAcceptedAt: now,
      borrowerConsentedAt: null,
      status: needsBorrowerConsent ? "proposed" : "completed",
      possible: true,
    };

    if (needsBorrowerConsent) {
      events.record(loanResponsibilityProposed, {
        resourceId: loan.id,
        payload: {
          objectId: requireObject(loan),
          transferId: transfer.id,
          kind: "takeover",
          toUserId: userId,
          needsBorrowerConsent,
        },
      });

      return transferResult(
        loan,
        transfer,
        "proposed",
        loan.responsibleLenderId,
      );
    }

    await complete(tx, { loan, transfer, byUserId: userId, now }, events);

    return transferResult(loan, transfer, "completed", userId);
  },
});

interface LoadedTransfer extends LoadedLoan, ResponsibilityTransferResource {
  readonly record: TransferRecord;
}

/**
 * The transfer on its loan: the object is locked, then the loan, then the
 * pairs the transfer depends on, then the transfer itself.
 */
async function loadLockedTransfer({
  tx,
  input,
}: {
  tx: Transaction<Database>;
  input: { readonly loanId: string; readonly transferId: string };
}): Promise<{ resource: LoadedTransfer; context: undefined } | null> {
  const loaded = await loadLockedLoan(tx, input.loanId);
  const found =
    loaded &&
    (await findTransfer(tx, input.loanId, { transferId: input.transferId }));

  if (!loaded || !found) {
    return null;
  }

  await lockTransferPairs(tx, loaded.resource, found.toUserId);
  const record = await findTransfer(tx, input.loanId, {
    transferId: input.transferId,
    lock: true,
  });

  return (
    record && {
      resource: {
        ...loaded.resource,
        record,
        transfer: {
          kind: record.kind,
          fromUserId: record.fromUserId,
          toUserId: record.toUserId,
          needsBorrowerConsent: record.needsBorrowerConsent,
        },
      },
      context: undefined,
    }
  );
}

/**
 * The transfer as an answer finds it once due returns are made, read again
 * since ending the loan lapses it: a transfer that is still open but can no
 * longer complete lapses now, and the answer gets that.
 */
async function settledTransfer(
  tx: Db,
  resource: LoadedTransfer,
  now: Date,
  events: EventRecorder,
): Promise<{ loan: LoanRecord; transfer: TransferRecord }> {
  const { loan } = await settleDueReturns(tx, resource.loan, now, events);
  const transfer = await findTransfer(tx, loan.id, {
    transferId: resource.record.id,
  });

  if (!transfer) {
    throw new Error("A transfer that disappeared");
  }

  if (transfer.status === "proposed" && !transfer.possible) {
    await resolveTransfer(tx, {
      transferId: transfer.id,
      status: "lapsed",
      byUserId: null,
      now,
    });
    return { loan, transfer: { ...transfer, status: "lapsed" } };
  }

  return { loan, transfer };
}

const statusOf = (transfer: TransferRecord) =>
  transfer.status as ResponsibilityTransferResult["status"];

/**
 * PS-LOAN-009: the recipient accepts the role offered to them, or the
 * borrower consents to a co-owner who joined after the loan was approved,
 * in one transaction, locked as an offer is. Each gives their answer once;
 * once the transfer has every answer it needs, the role moves at once.
 * Answering again returns the transfer as it is; a transfer that can no
 * longer happen (the loan ended, the role moved, the recipient left the
 * object or a block came between them) lapses instead.
 */
export const acceptResponsibilityTransfer = defineCommand({
  name: "loan.accept_responsibility_transfer",
  input: responsibilityTransferReferenceSchema,
  output: responsibilityTransferResultSchema,
  policy: acceptResponsibilityTransferPolicy,
  idempotency: "required",
  load: loadLockedTransfer,
  execute: async ({ tx, actor, resource, events, now }) => {
    const { loan, transfer } = await settledTransfer(tx, resource, now, events);
    const userId = actingUserId(actor);

    if (transfer.status !== "proposed") {
      if (transfer.status === "completed" || transfer.status === "lapsed") {
        return transferResult(
          loan,
          transfer,
          statusOf(transfer),
          loan.responsibleLenderId,
        );
      }

      conflict("The change is no longer open");
    }

    const answer =
      userId === transfer.toUserId && transfer.recipientAcceptedAt === null
        ? "recipient"
        : userId === loan.borrowerUserId &&
            transfer.needsBorrowerConsent &&
            transfer.borrowerConsentedAt === null
          ? "borrower"
          : null;

    if (answer === null) {
      return transferResult(
        loan,
        transfer,
        "proposed",
        loan.responsibleLenderId,
      );
    }

    await recordAnswer(tx, { transferId: transfer.id, answer, now });
    events.record(loanResponsibilityAnswered, {
      resourceId: loan.id,
      payload: {
        objectId: requireObject(loan),
        transferId: transfer.id,
        answer,
      },
    });

    const answered: TransferRecord = {
      ...transfer,
      ...(answer === "recipient"
        ? { recipientAcceptedAt: now }
        : { borrowerConsentedAt: now }),
    };

    if (!fullyAnswered(answered)) {
      return transferResult(
        loan,
        transfer,
        "proposed",
        loan.responsibleLenderId,
      );
    }

    await complete(
      tx,
      { loan, transfer: answered, byUserId: userId, now },
      events,
    );

    return transferResult(loan, transfer, "completed", transfer.toUserId);
  },
});

/**
 * Defines declining (by an answerer) and withdrawing (by the proposer): the
 * transfer ends, the role stays where it is. Saying it again returns the
 * same; a transfer that can no longer happen lapses instead.
 */
function defineEnding(
  name: string,
  status: "declined" | "withdrawn",
  policy:
    | typeof declineResponsibilityTransferPolicy
    | typeof withdrawResponsibilityTransferPolicy,
  event: typeof loanResponsibilityDeclined,
) {
  return defineCommand({
    name,
    input: responsibilityTransferReferenceSchema,
    output: responsibilityTransferResultSchema,
    policy,
    idempotency: "required",
    load: loadLockedTransfer,
    execute: async ({ tx, actor, resource, events, now }) => {
      const { loan, transfer } = await settledTransfer(
        tx,
        resource,
        now,
        events,
      );

      if (transfer.status === status || transfer.status === "lapsed") {
        return transferResult(
          loan,
          transfer,
          statusOf(transfer),
          loan.responsibleLenderId,
        );
      }

      if (transfer.status !== "proposed") {
        conflict("The change is no longer open");
      }

      await resolveTransfer(tx, {
        transferId: transfer.id,
        status,
        byUserId: actingUserId(actor),
        now,
      });
      events.record(event, {
        resourceId: loan.id,
        payload: { objectId: requireObject(loan), transferId: transfer.id },
      });

      return transferResult(loan, transfer, status, loan.responsibleLenderId);
    },
  });
}

/** The recipient or the borrower says no; the role stays. */
export const declineResponsibilityTransfer = defineEnding(
  "loan.decline_responsibility_transfer",
  "declined",
  declineResponsibilityTransferPolicy,
  loanResponsibilityDeclined,
);

/** Whoever proposed the transfer takes it back. */
export const withdrawResponsibilityTransfer = defineEnding(
  "loan.withdraw_responsibility_transfer",
  "withdrawn",
  withdrawResponsibilityTransferPolicy,
  loanResponsibilityWithdrawn,
);

/** A transfer as those it concerns see it. */
export function presentTransfer(
  transfer: TransferRecord,
): ResponsibilityTransfer {
  return {
    id: transfer.id,
    kind: transfer.kind,
    fromUserId: transfer.fromUserId,
    toUserId: transfer.toUserId,
    needsBorrowerConsent: transfer.needsBorrowerConsent,
    recipientAccepted: transfer.recipientAcceptedAt !== null,
    borrowerConsented: transfer.borrowerConsentedAt !== null,
    proposedAt: transfer.proposedAt.toISOString(),
  };
}

/** One loan in a co-owner's list, with what they may do on it now. */
interface CoOwnerLoanRecord {
  readonly loan: LoanRecord;
  readonly objectId: string;
  readonly transfer: TransferRecord | null;
  readonly reach: CoOwnerReach;
  readonly openTransfer: boolean;
  readonly pending:
    Awaited<ReturnType<typeof findPendingReturns>>[number] | null;
}

/**
 * PS-LOAN-009, PS-LOAN-015: the loans a co-owner who is not their party may
 * act on now, and only what that needs: an offer of the role to them, their
 * own takeover waiting for the borrower, or, while the responsible lender
 * is established as unavailable, taking over or confirming the receipt.
 * Nothing else about the loan: not its parties' statements, proposals or
 * terms. The same rules as the commands decide each item.
 */
export const listCoOwnerLoans = defineQuery({
  name: "loan.list_for_co_owner",
  input: z.strictObject({}),
  policy: listCoOwnerLoansPolicy,
  load: ({ db, actor }) =>
    inSnapshot(db, async (tx) => {
      const userId = actingUserId(actor);
      const loanIds = await coOwnerLoanIds(tx, userId);
      const transfers = await openTransfersTo(tx, userId, loanIds);
      const items: CoOwnerLoanRecord[] = [];

      for (const loanId of loanIds) {
        const loan = await findLoan(tx, { loanId });

        if (!loan || loan.objectId === null) continue;

        const transfer = transfers.get(loanId) ?? null;
        const pending =
          (await findPendingReturns(tx, loanId)).find(
            (waiting) => waiting.userId === userId,
          ) ?? null;

        items.push({
          loan,
          objectId: loan.objectId,
          transfer: transfer?.possible ? transfer : null,
          reach: await loadCoOwnerReach(tx, loanId, userId),
          openTransfer: (await findTransfer(tx, loanId))?.possible ?? false,
          pending,
        });
      }

      return { resource: items, context: undefined };
    }),
  present: ({ resource, now }): CoOwnerLoanList => ({
    items: resource.flatMap((item) => {
      const { loan, reach } = item;
      const mayTakeOver =
        reach.standing !== null &&
        reach.lenderUnavailable &&
        !item.openTransfer;
      const mayConfirmReceipt =
        reach.receivesForLender && inReturnPhase(loan.status);

      if (!item.transfer && !mayTakeOver && !mayConfirmReceipt) {
        return [];
      }

      return [
        {
          loanId: loan.id,
          objectId: item.objectId,
          status: presentedLoanStatus(
            loan.status,
            loan.agreement.period,
            calendarDate(now),
          ),
          agreementVersion: loan.agreement.version,
          title: loan.agreement.title,
          period: toApiPeriod(loan.agreement.period),
          transfer: item.transfer && presentTransfer(item.transfer),
          mayTakeOver,
          mayConfirmReceipt,
          pending: item.pending && {
            outcome: item.pending.outcome,
            effectiveAt: item.pending.effectiveAt.toISOString(),
          },
        },
      ];
    }),
  }),
});
