import {
  approveLoanRequestSchema,
  loanApprovalResultSchema,
  responsibilityDeclarationVersion,
} from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import type { Kysely } from "kysely";
import { defineCommand } from "../commands/command";
import { DomainError } from "../errors";
import type { EventRecorder } from "../events/recorder";
import { calendarDate, type DateInterval } from "../objects/availability";
import { actingUserId } from "../objects/state";
import { loanRequestApproved, loanRequestEnded, loanReserved } from "./events";
import {
  collidingRequests,
  earliestPeriod,
  isOpen,
  type LoanPeriodInterval,
  type LoanRequestRecord,
  toApiPeriod,
} from "./model";
import { approveLoanRequestPolicy } from "./policies";
import { loadRequest } from "./resources";
import { findLoan, reserveLoan } from "./reservations";
import {
  endLoanRequests,
  findOpenLoanRequests,
  loadAcceptances,
  loadDerivedAvailability,
  termsDiffer,
} from "./store";

type Db = Kysely<Database>;

function conflict(message: string, fields: readonly string[] = []): never {
  throw new DomainError("conflict", message, fields);
}

const approvalResult = (loan: {
  readonly requestId: string;
  readonly loanId: string;
  readonly period: LoanPeriodInterval;
}) => ({
  requestId: loan.requestId,
  loanId: loan.loanId,
  status: "approved" as const,
  period: toApiPeriod(loan.period),
});

/**
 * PS-LOAN-003: both parties of a direct request have accepted the current
 * declaration: the borrower, and the owner who approves, themselves.
 */
async function requireDeclaration(
  db: Db,
  request: LoanRequestRecord,
  lenderId: string,
): Promise<void> {
  const acceptances = (await loadAcceptances(db, [request.id])).get(request.id);
  const accepted = (userId: string) =>
    (acceptances ?? []).some(
      (acceptance) =>
        acceptance.userId === userId &&
        acceptance.declarationVersion === responsibilityDeclarationVersion,
    );

  if (!accepted(request.borrowerUserId) || !accepted(lenderId)) {
    conflict("Both parties must accept the declaration", ["responsibility"]);
  }
}

/**
 * PS-LOAN-007: ends the other open requests that collide with the period
 * just reserved, neutrally. Those that do not collide stay open.
 */
async function endCollidingRequests(
  db: Db,
  input: {
    readonly objectId: string;
    readonly approvedId: string;
    readonly period: LoanPeriodInterval;
    readonly effectiveBefore: readonly DateInterval[];
    readonly today: string;
    readonly now: Date;
  },
  events: EventRecorder,
): Promise<void> {
  const others = (await findOpenLoanRequests(db, input.objectId)).filter(
    (request) => request.id !== input.approvedId,
  );
  const colliding = collidingRequests(
    others,
    input.period,
    input.effectiveBefore,
    input.today,
  );
  const ended = await endLoanRequests(
    db,
    colliding.map((request) => request.id),
    "period_unavailable",
    null,
    input.now,
  );

  for (const requestId of ended) {
    events.record(loanRequestEnded, {
      resourceId: requestId,
      payload: { objectId: input.objectId, reason: "period_unavailable" },
    });
  }
}

/**
 * PS-LOAN-006–008, PS-NFR-004: an owner who sees the request approves it,
 * in one transaction (docs/architecture/05):
 * 1. the object is locked, then everything the request's access builds on,
 *    then the request, so concurrent approvals of the object, and whatever
 *    would end the access, run one after another;
 * 2. the request is still `requested`: not ended, not waiting for the
 *    borrower to confirm new terms, not held by its environment, and its
 *    access still holds (`assessOrigin`);
 * 3. for a direct request, both parties accepted the current declaration;
 * 4. the period is the one asked for, «as soon as possible» from the
 *    earliest day it fits whole (`earliestPeriod`), within actual
 *    availability now;
 * 5. the loan, its agreement snapshot, the approver as responsible lender
 *    and the reservation are made, and the request is approved;
 * 6. colliding open requests end neutrally;
 * 7. events are written with the transaction.
 * Approving a request that is already approved returns its loan, so a retry
 * (with or without the same key) never makes a second one.
 */
export const approveLoanRequest = defineCommand({
  name: "loan_request.approve",
  input: approveLoanRequestSchema,
  output: loanApprovalResultSchema,
  policy: approveLoanRequestPolicy,
  idempotency: "required",
  load: ({ tx, actor, input, now }) =>
    loadRequest(tx, actor, input.requestId, now, { lock: true, assess: true }),
  execute: async ({ tx, actor, resource, events, now }) => {
    const { request, object, assessment } = resource;

    if (request.status === "approved") {
      const loan = await findLoan(tx, { requestId: request.id });

      if (!loan) {
        throw new Error("An approved loan request without its loan");
      }

      return approvalResult({
        requestId: request.id,
        loanId: loan.id,
        period: loan.agreement.period,
      });
    }

    if (
      !isOpen(request.status) ||
      !object ||
      !assessment ||
      request.termsVersion === null ||
      assessment.standing.kind === "ended"
    ) {
      conflict("The request has ended");
    }

    if (assessment.standing.kind === "on_hold") {
      conflict("The request is on hold");
    }

    if (
      request.status === "awaiting_terms_confirmation" ||
      (await termsDiffer(
        tx,
        object.objectId,
        request.termsVersion,
        object.version,
      ))
    ) {
      conflict("The borrower has not confirmed the current terms", [
        "termsVersion",
      ]);
    }

    const lenderId = actingUserId(actor);

    if (request.origin === "direct") {
      await requireDeclaration(tx, request, lenderId);
    }

    const today = calendarDate(now);
    const { effective } = await loadDerivedAvailability(
      tx,
      object.objectId,
      today,
    );
    const period = earliestPeriod(request.start, request.end, effective, today);

    if (!period) {
      conflict("The object is not available then", ["start"]);
    }

    const loanId = await reserveLoan(tx, {
      requestId: request.id,
      object,
      borrowerUserId: request.borrowerUserId,
      lenderUserId: lenderId,
      termsVersion: request.termsVersion,
      responsibilityDeclarationVersion:
        request.origin === "direct" ? responsibilityDeclarationVersion : null,
      period,
      now,
    });

    events.record(loanRequestApproved, {
      resourceId: request.id,
      payload: { objectId: object.objectId, loanId },
    });
    events.record(loanReserved, {
      resourceId: loanId,
      payload: {
        objectId: object.objectId,
        requestId: request.id,
        agreementVersion: 1,
      },
    });

    await endCollidingRequests(
      tx,
      {
        objectId: object.objectId,
        approvedId: request.id,
        period,
        effectiveBefore: effective,
        today,
        now,
      },
      events,
    );

    return approvalResult({ requestId: request.id, loanId, period });
  },
});
