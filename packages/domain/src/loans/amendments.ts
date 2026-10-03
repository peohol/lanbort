import {
  type LoanAmendmentResult,
  loanAmendmentReferenceSchema,
  loanAmendmentResultSchema,
  proposeLoanAmendmentSchema,
} from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import type { Kysely } from "kysely";
import { defineCommand } from "../commands/command";
import { DomainError } from "../errors";
import { calendarDate, type DateInterval } from "../objects/availability";
import { actingUserId, type ObjectState } from "../objects/state";
import {
  agreeLoanPeriod,
  answerAmendment,
  findOpenAmendment,
  insertAmendment,
  type LoanAmendmentRecord,
} from "./amendment-store";
import { endCollidingRequests } from "./approval";
import {
  loanAmendmentAccepted,
  loanAmendmentDeclined,
  loanAmendmentProposed,
  loanAmendmentWithdrawn,
} from "./events";
import {
  amendmentFits,
  beforeHandover,
  fromApiPeriod,
  type LoanPeriodInterval,
  samePeriod,
} from "./model";
import {
  acceptLoanAmendmentPolicy,
  declineLoanAmendmentPolicy,
  loanRoleOf,
  proposeLoanAmendmentPolicy,
  withdrawLoanAmendmentPolicy,
} from "./policies";
import { type LoadedLoan, loadAmendment, loadLockedLoan } from "./resources";
import { loadDerivedAvailability } from "./store";

function conflict(message: string, fields: readonly string[] = []): never {
  throw new DomainError("conflict", message, fields);
}

const amendmentResult = (
  amendment: Pick<LoanAmendmentRecord, "id" | "loanId" | "status">,
  agreementVersion: number,
): LoanAmendmentResult => ({
  loanId: amendment.loanId,
  amendmentId: amendment.id,
  status: amendment.status,
  agreementVersion,
});

type Db = Kysely<Database>;

type ChangeableLoan = LoadedLoan & { readonly object: ObjectState };

/**
 * The agreement can still change: the loan is reserved and its handover day
 * is not over (`beforeHandover`). Later stages bring their own changes.
 */
function requireChangeable(
  resource: LoadedLoan,
  today: string,
): asserts resource is ChangeableLoan {
  if (resource.loan.status !== "reserved" || !resource.object) {
    conflict("The loan has ended");
  }

  if (!beforeHandover(resource.loan.agreement.period, today)) {
    conflict("The handover day has passed", ["handover"]);
  }
}

/**
 * Scenario 26: the period can become `proposed` only if every day it adds
 * is actually available now, so it never reaches into another approved
 * loan's reservation or a co-owner's restriction ({@link amendmentFits}).
 * Returns the availability it was checked against.
 */
async function requireFits(
  db: Db,
  { loan, object }: ChangeableLoan,
  proposed: LoanPeriodInterval,
  today: string,
): Promise<DateInterval[]> {
  const { effective } = await loadDerivedAvailability(
    db,
    object.objectId,
    today,
    object.status,
  );

  if (!amendmentFits(loan.agreement.period, proposed, effective, today)) {
    conflict("The object is not available then", ["period"]);
  }

  return effective;
}

/**
 * PS-LOAN-010: either party proposes a new period for the agreement they
 * saw (`agreementVersion`): a new handover day, a new return date, or both.
 * The proposal changes nothing, neither the agreement nor the reservation,
 * until the other party accepts it. One proposal waits at a time; a party
 * who wants something else declines or withdraws it first. A period that is
 * not available now is refused already here (scenario 26), and checked
 * again on acceptance. Proposing the same again while it waits returns the
 * waiting proposal, so a retry never makes a second one.
 */
export const proposeLoanAmendment = defineCommand({
  name: "loan.propose_amendment",
  input: proposeLoanAmendmentSchema,
  output: loanAmendmentResultSchema,
  policy: proposeLoanAmendmentPolicy,
  idempotency: "required",
  load: ({ tx, input }) => loadLockedLoan(tx, input.loanId),
  execute: async ({ tx, actor, input, resource, events, now }) => {
    const { loan } = resource;
    const role = loanRoleOf(actor, resource);
    const today = calendarDate(now);
    const period = fromApiPeriod(input.period);

    if (!role) {
      throw new Error("The policy allows only a party of the loan");
    }

    requireChangeable(resource, today);

    if (input.agreementVersion !== loan.agreement.version) {
      conflict("The agreement has changed", ["agreementVersion"]);
    }

    const waiting = await findOpenAmendment(tx, loan.id);

    if (waiting) {
      if (waiting.proposerRole === role && samePeriod(waiting.period, period)) {
        return amendmentResult(waiting, loan.agreement.version);
      }

      conflict("Another change waits for an answer", ["amendment"]);
    }

    if (samePeriod(period, loan.agreement.period)) {
      throw new DomainError("invalid_input", "Nothing changes", ["period"]);
    }

    if (period.from < today) {
      throw new DomainError("invalid_input", "The start has passed", [
        "period.start",
      ]);
    }

    await requireFits(tx, resource, period, today);

    const amendmentId = await insertAmendment(tx, {
      loanId: loan.id,
      baseVersion: loan.agreement.version,
      userId: actingUserId(actor),
      role,
      period,
      now,
    });

    events.record(loanAmendmentProposed, {
      resourceId: loan.id,
      payload: {
        objectId: resource.object.objectId,
        amendmentId,
        baseVersion: loan.agreement.version,
      },
    });

    return amendmentResult(
      { id: amendmentId, loanId: loan.id, status: "proposed" },
      loan.agreement.version,
    );
  },
});

const loadLockedAmendment = ({
  tx,
  input,
}: {
  tx: Db;
  input: { loanId: string; amendmentId: string };
}) => loadAmendment(tx, input, { lock: true });

/**
 * PS-LOAN-010, scenario 26: the other party agrees, in one transaction
 * (docs/architecture/05):
 * 1. the object is locked, then the loan and the proposal, so an agreed
 *    change, a cancellation and approvals of the object run one after
 *    another;
 * 2. the proposal is still open and on the current agreement, and the loan
 *    can still change;
 * 3. every day the new period adds is actually available now: an approved
 *    loan's reservation is never moved or ended to make room, so the
 *    acceptance is refused while the collision lasts, and the proposal
 *    stays open;
 * 4. the agreement gets its next version, a copy with the new period, and
 *    the reservation moves to that period; earlier versions never change;
 * 5. open requests the new period collides with end neutrally, as on
 *    approval (PS-LOAN-007).
 * The database refuses a period another loan holds even without the lock
 * (exclusion constraint), and a reservation that differs from the current
 * agreement at commit. Accepting it again returns the same agreement.
 */
export const acceptLoanAmendment = defineCommand({
  name: "loan.accept_amendment",
  input: loanAmendmentReferenceSchema,
  output: loanAmendmentResultSchema,
  policy: acceptLoanAmendmentPolicy,
  idempotency: "required",
  load: loadLockedAmendment,
  execute: async ({ tx, actor, resource, events, now }) => {
    const { loan, amendment } = resource;

    if (amendment.status === "accepted") {
      return amendmentResult(amendment, amendment.baseVersion + 1);
    }

    if (amendment.status !== "proposed") {
      conflict("The proposal is no longer open");
    }

    const today = calendarDate(now);
    requireChangeable(resource, today);

    if (amendment.baseVersion !== loan.agreement.version) {
      conflict("The agreement has changed");
    }

    const effective = await requireFits(tx, resource, amendment.period, today);
    const version = loan.agreement.version + 1;

    await agreeLoanPeriod(tx, {
      loanId: loan.id,
      amendmentId: amendment.id,
      acceptedByUserId: actingUserId(actor),
      version: loan.agreement.version,
      period: amendment.period,
      now,
    });

    events.record(loanAmendmentAccepted, {
      resourceId: loan.id,
      payload: {
        objectId: resource.object.objectId,
        amendmentId: amendment.id,
        agreementVersion: version,
      },
    });

    await endCollidingRequests(
      tx,
      {
        objectId: resource.object.objectId,
        approvedId: loan.requestId,
        period: amendment.period,
        effectiveBefore: effective,
        today,
        now,
      },
      events,
    );

    return amendmentResult({ ...amendment, status: "accepted" }, version);
  },
});

/**
 * Answers an open proposal without changing the agreement: the other party
 * declines it, or the proposing side withdraws it. Answering it the same
 * way again returns the same answer.
 */
function defineAnswer(
  name: string,
  status: "declined" | "withdrawn",
  policy:
    typeof declineLoanAmendmentPolicy | typeof withdrawLoanAmendmentPolicy,
  event: typeof loanAmendmentDeclined | typeof loanAmendmentWithdrawn,
) {
  return defineCommand({
    name,
    input: loanAmendmentReferenceSchema,
    output: loanAmendmentResultSchema,
    policy,
    idempotency: "required",
    load: loadLockedAmendment,
    execute: async ({ tx, actor, resource, events, now }) => {
      const { loan, amendment } = resource;

      if (amendment.status === status) {
        return amendmentResult(amendment, loan.agreement.version);
      }

      if (amendment.status !== "proposed" || loan.objectId === null) {
        conflict("The proposal is no longer open");
      }

      await answerAmendment(tx, {
        amendmentId: amendment.id,
        status,
        userId: actingUserId(actor),
        now,
      });

      events.record(event, {
        resourceId: loan.id,
        payload: { objectId: loan.objectId, amendmentId: amendment.id },
      });

      return amendmentResult({ ...amendment, status }, loan.agreement.version);
    },
  });
}

/** PS-LOAN-010: the other party says no; the agreement stands as it was. */
export const declineLoanAmendment = defineAnswer(
  "loan.decline_amendment",
  "declined",
  declineLoanAmendmentPolicy,
  loanAmendmentDeclined,
);

/** The proposing side takes its proposal back. */
export const withdrawLoanAmendment = defineAnswer(
  "loan.withdraw_amendment",
  "withdrawn",
  withdrawLoanAmendmentPolicy,
  loanAmendmentWithdrawn,
);
