import type {
  LoanRequestRole,
  NotificationKind,
  NotificationTarget,
} from "@lanbort/contracts";
import { sql } from "kysely";
import {
  loanAmendmentAccepted,
  loanAmendmentDeclined,
  loanAmendmentProposed,
  loanAmendmentWithdrawn,
  loanCancelled,
  loanHandoverDisputed,
  loanHandoverReported,
  loanNotCompleted,
  loanRequestCreated,
  loanRequestDeclined,
  loanRequestEnded,
  loanRequestTermsConfirmed,
  loanReserved,
  loanResponsibilityDeclined,
  loanResponsibilityProposed,
  loanResponsibilityTransferred,
  loanResponsibilityWithdrawn,
  loanReturnDisputed,
  loanReturnReported,
} from "../../loans/events";
import { loadLenderScope, visibleToLender } from "../../loans/store";
import { objectReverted, objectUpdated } from "../../objects/events";
import { type Db, notifyOn, type RuleInput, tell } from "../rule";

interface Parties {
  readonly borrower: string;
  readonly lender: string;
}

const loanTarget = (id: string): NotificationTarget => ({ type: "loan", id });

/** The borrower and the responsible lender of each loan, as they are now. */
async function partiesOf(db: Db, loanIds: readonly string[]) {
  const rows =
    loanIds.length === 0
      ? []
      : await db
          .selectFrom("app.loans")
          .select(["id", "borrower_user_id", "responsible_lender_id"])
          .where("id", "in", [...loanIds])
          .execute();

  return new Map(
    rows.map((row) => [
      row.id,
      { borrower: row.borrower_user_id, lender: row.responsible_lender_id },
    ]),
  );
}

async function loanParties(db: Db, loanId: string): Promise<Parties | null> {
  return (await partiesOf(db, [loanId])).get(loanId) ?? null;
}

const otherSide = (role: LoanRequestRole): LoanRequestRole =>
  role === "borrower" ? "lender" : "borrower";

/** A notification about the loan for the parties on the given sides. */
function toSides<P>(
  kind: NotificationKind,
  sides: (payload: P) => readonly LoanRequestRole[],
  detail: (payload: P) => string | null = () => null,
) {
  return async ({ db, event, payload }: RuleInput<P>) => {
    const parties = await loanParties(db, event.resourceId);

    return parties
      ? tell(
          sides(payload).map((side) => parties[side]),
          kind,
          loanTarget(event.resourceId),
          detail(payload),
        )
      : [];
  };
}

/** Both parties: the actor, if a party, is left out by the generator. */
const bothSides = (): readonly LoanRequestRole[] => ["borrower", "lender"];

/**
 * The parties of loans of the same object that were approved before its
 * possession became uncertain (scenarios 58 and 61): they keep their loan,
 * and learn that it may be at risk, without learning anything about the
 * other loan.
 */
async function possessionUncertain(db: Db, otherLoanIds: readonly string[]) {
  const parties = await partiesOf(db, otherLoanIds);

  return otherLoanIds.flatMap((loanId) => {
    const loan = parties.get(loanId);
    return loan
      ? tell(
          [loan.borrower, loan.lender],
          "loan.possession_uncertain",
          loanTarget(loanId),
        )
      : [];
  });
}

/**
 * The owners who see the request as a lender now (`visibleToLender`), so a
 * notification never reveals a request, a borrower or a hidden origin an
 * owner could not see otherwise.
 */
async function requestLenders(db: Db, requestId: string, now: Date) {
  const request = await db
    .selectFrom("app.loan_requests")
    .select(["object_id", "former_owner_ids"])
    .where("id", "=", requestId)
    .executeTakeFirst();

  if (!request) {
    return [];
  }

  const owners =
    request.object_id === null
      ? []
      : await db
          .selectFrom("app.object_owners")
          .select("user_id")
          .where("object_id", "=", request.object_id)
          .execute();
  const lenders: string[] = [];

  for (const candidate of new Set([
    ...owners.map((owner) => owner.user_id),
    ...(request.former_owner_ids ?? []),
  ])) {
    const seen = await db
      .selectFrom("app.loan_requests as request")
      .select("request.id")
      .where("request.id", "=", requestId)
      .where(visibleToLender(await loadLenderScope(db, candidate, now)))
      .executeTakeFirst();

    if (seen) {
      lenders.push(candidate);
    }
  }

  return lenders;
}

async function requestBorrower(db: Db, requestId: string) {
  const request = await db
    .selectFrom("app.loan_requests")
    .select("borrower_user_id")
    .where("id", "=", requestId)
    .executeTakeFirst();

  return request ? [request.borrower_user_id] : [];
}

const requestTarget = (id: string): NotificationTarget => ({
  type: "loan_request",
  id,
});

const toLenders =
  (kind: "loan_request.received" | "loan_request.terms_confirmed") =>
  async ({ db, event, now }: RuleInput<unknown>) =>
    tell(
      await requestLenders(db, event.resourceId, now),
      kind,
      requestTarget(event.resourceId),
    );

/**
 * PS-LOAN-005: an edit changed the terms, and open requests that were made
 * on other terms wait for their borrower to confirm the new ones. Only an
 * edit of the terms themselves tells them, and only while they still wait.
 */
async function termsChanged({
  db,
  event,
  payload,
}: RuleInput<{ version: number }>) {
  const waiting = await db
    .selectFrom("app.loan_requests")
    .select(["id", "borrower_user_id"])
    .where("object_id", "=", event.resourceId)
    .where("status", "=", "awaiting_terms_confirmation")
    .where(
      sql<boolean>`app.loan_terms_differ(object_id, terms_version, ${payload.version}::integer)`,
    )
    .where(
      sql<boolean>`app.loan_terms_differ(object_id, ${payload.version - 1}::integer, ${payload.version}::integer)`,
    )
    .execute();

  return waiting.flatMap((request) =>
    tell(
      [request.borrower_user_id],
      "loan_request.terms_changed",
      requestTarget(request.id),
    ),
  );
}

async function transferOf(db: Db, transferId: string) {
  return db
    .selectFrom("app.loan_lender_transfers")
    .select(["from_user_id", "to_user_id", "borrower_consent_required"])
    .where("id", "=", transferId)
    .executeTakeFirst();
}

/**
 * The others involved in a change of the responsible lender: who offered
 * or took it, who was to receive it, and the borrower when their consent
 * was asked for.
 */
async function transferInvolved(
  db: Db,
  loanId: string,
  transferId: string,
  { withProposer }: { withProposer: boolean },
) {
  const [transfer, parties] = await Promise.all([
    transferOf(db, transferId),
    loanParties(db, loanId),
  ]);

  if (!transfer || !parties) {
    return [];
  }

  return [
    ...(withProposer ? [transfer.from_user_id] : []),
    transfer.to_user_id,
    ...(transfer.borrower_consent_required ? [parties.borrower] : []),
  ];
}

export const loanRules = [
  notifyOn(loanRequestCreated, toLenders("loan_request.received")),
  notifyOn(
    loanRequestTermsConfirmed,
    toLenders("loan_request.terms_confirmed"),
  ),
  notifyOn(loanRequestDeclined, async ({ db, event }) =>
    tell(
      await requestBorrower(db, event.resourceId),
      "loan_request.declined",
      requestTarget(event.resourceId),
    ),
  ),
  notifyOn(loanRequestEnded, async ({ db, event, payload }) =>
    tell(
      await requestBorrower(db, event.resourceId),
      "loan_request.ended",
      requestTarget(event.resourceId),
      payload.reason,
    ),
  ),
  notifyOn(objectUpdated, termsChanged),
  notifyOn(objectReverted, termsChanged),
  notifyOn(
    loanReserved,
    toSides("loan.approved", () => ["borrower"]),
  ),
  notifyOn(
    loanCancelled,
    toSides("loan.cancelled", ({ role }) => [otherSide(role)]),
  ),
  notifyOn(
    loanAmendmentProposed,
    toSides("loan.amendment_proposed", bothSides),
  ),
  notifyOn(
    loanAmendmentAccepted,
    toSides("loan.amendment_accepted", bothSides),
  ),
  notifyOn(
    loanAmendmentDeclined,
    toSides("loan.amendment_declined", bothSides),
  ),
  notifyOn(
    loanAmendmentWithdrawn,
    toSides("loan.amendment_withdrawn", bothSides),
  ),
  // What one party said about the handover tells the other; the status it
  // led to (handed over, disputed, not completed by agreement) is the same
  // command and is not told twice.
  notifyOn(
    loanHandoverReported,
    toSides(
      "loan.handover_reported",
      ({ role }) => [otherSide(role)],
      ({ outcome }) => outcome,
    ),
  ),
  // Ended because the answer did not come in time: nobody acted, so both
  // parties are told (PS-LOAN-012).
  notifyOn(loanNotCompleted, async (input) =>
    input.payload.basis === "unanswered"
      ? toSides("loan.not_completed", bothSides)(input)
      : [],
  ),
  notifyOn(loanHandoverDisputed, ({ db, payload }) =>
    possessionUncertain(db, payload.otherLoanIds),
  ),
  // The other side, and the responsible lender too when a co-owner
  // confirmed the receipt in the narrow role (PS-LOAN-015).
  notifyOn(
    loanReturnReported,
    toSides(
      "loan.return_reported",
      ({ role, reportedAs }) =>
        reportedAs === "co_owner" ? bothSides() : [otherSide(role)],
      ({ outcome }) => outcome,
    ),
  ),
  notifyOn(loanReturnDisputed, ({ db, payload }) =>
    possessionUncertain(db, payload.otherLoanIds),
  ),
  notifyOn(loanResponsibilityProposed, async ({ db, event, payload }) => {
    const parties = await loanParties(db, event.resourceId);
    const target = loanTarget(event.resourceId);

    return [
      ...(payload.kind === "voluntary"
        ? tell([payload.toUserId], "loan.responsibility_offered", target)
        : []),
      ...(payload.needsBorrowerConsent && parties
        ? tell(
            [parties.borrower],
            "loan.responsibility_consent_requested",
            target,
          )
        : []),
    ];
  }),
  // The borrower is told clearly, without having to approve (PS-LOAN-009);
  // so are the lender who handed it on and the one who took it.
  notifyOn(loanResponsibilityTransferred, async ({ db, event, payload }) => {
    const parties = await loanParties(db, event.resourceId);

    return tell(
      [
        ...(parties ? [parties.borrower] : []),
        payload.fromUserId,
        payload.toUserId,
      ],
      "loan.responsibility_transferred",
      loanTarget(event.resourceId),
    );
  }),
  notifyOn(loanResponsibilityDeclined, async ({ db, event, payload }) =>
    tell(
      await transferInvolved(db, event.resourceId, payload.transferId, {
        withProposer: true,
      }),
      "loan.responsibility_declined",
      loanTarget(event.resourceId),
    ),
  ),
  notifyOn(loanResponsibilityWithdrawn, async ({ db, event, payload }) =>
    tell(
      await transferInvolved(db, event.resourceId, payload.transferId, {
        withProposer: false,
      }),
      "loan.responsibility_withdrawn",
      loanTarget(event.resourceId),
    ),
  ),
];
