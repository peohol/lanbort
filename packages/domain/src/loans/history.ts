import {
  type LoanHistory,
  type LoanHistoryEntry,
  type LoanHistoryEvent,
  type LoanHistoryPerson,
  loanHistoryPageSize,
  loanHistoryQuerySchema,
} from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import { type Kysely, sql } from "kysely";
import { realNames } from "../account/store";
import type { Actor } from "../actor";
import { defineQuery } from "../commands/query";
import type { EventDefinition } from "../events/catalog";
import { inSnapshot } from "../objects/state";
import {
  loanAmendmentAccepted,
  loanAmendmentDeclined,
  loanAmendmentProposed,
  loanAmendmentWithdrawn,
  loanCancelled,
  loanConditionAnswered,
  loanConditionReported,
  loanControlConfirmed,
  loanEndedUnresolved,
  loanHandedOver,
  loanHandoverDisputed,
  loanHandoverReported,
  loanNotCompleted,
  loanRequestCreated,
  loanRequestResponsibilityAccepted,
  loanRequestTermsConfirmed,
  loanReserved,
  loanResponsibilityAnswered,
  loanResponsibilityDeclined,
  loanResponsibilityProposed,
  loanResponsibilityTransferred,
  loanResponsibilityWithdrawn,
  loanReturnDisputed,
  loanReturned,
  loanReturnReported,
  loanStopped,
} from "./events";
import { type LoanPeriodInterval, toApiPeriod } from "./model";
import { readLoanHistoryPolicy } from "./policies";
import { findLoan } from "./reservations";

type Db = Kysely<Database>;

/** What an entry needs besides its event: the people and the periods. */
interface HistoryContext {
  readonly person: (userId: string) => LoanHistoryPerson;
  readonly amendmentPeriods: ReadonlyMap<string, LoanPeriodInterval>;
  readonly agreementPeriods: ReadonlyMap<number, LoanPeriodInterval>;
}

type Details = Omit<LoanHistoryEntry, "id" | "at" | "event" | "actor">;

interface TimelineEvent {
  readonly definition: EventDefinition<unknown>;
  readonly event: LoanHistoryEvent;
  /** What the parties may know of the payload; nothing else of it is shown. */
  readonly details: (payload: unknown, context: HistoryContext) => Details;
}

/** The payload reaches `details` only after its own schema parsed it. */
const timelineEvent = <P>(
  definition: EventDefinition<P>,
  event: LoanHistoryEvent,
  details: (payload: P, context: HistoryContext) => Details = () => ({}),
): TimelineEvent => ({
  definition: definition as EventDefinition<unknown>,
  event,
  details: (payload, context) => details(payload as P, context),
});

const periodOf = (period: LoanPeriodInterval | undefined) =>
  period ? { period: toApiPeriod(period) } : {};

/**
 * UX-INT-008, docs/architecture/06: the loan's domain events its parties
 * may see, each with what it says to them. Payload fields that are not
 * named here, such as the other loans of the object a dispute blocks
 * (`otherLoanIds`), never reach the timeline. Administrative and audit
 * events, cases and reviews are not part of it.
 */
const timelineEvents: readonly TimelineEvent[] = [
  timelineEvent(loanRequestCreated, "requested"),
  timelineEvent(loanRequestTermsConfirmed, "terms_confirmed"),
  timelineEvent(
    loanRequestResponsibilityAccepted,
    "responsibility_accepted",
    ({ role }) => ({ side: role }),
  ),
  timelineEvent(loanReserved, "reserved"),
  timelineEvent(loanCancelled, "cancelled", ({ role }) => ({ side: role })),
  timelineEvent(loanStopped, "stopped"),
  timelineEvent(
    loanAmendmentProposed,
    "amendment_proposed",
    ({ amendmentId }, { amendmentPeriods }) =>
      periodOf(amendmentPeriods.get(amendmentId)),
  ),
  timelineEvent(
    loanAmendmentAccepted,
    "amendment_accepted",
    ({ agreementVersion }, { agreementPeriods }) =>
      periodOf(agreementPeriods.get(agreementVersion)),
  ),
  timelineEvent(loanAmendmentDeclined, "amendment_declined"),
  timelineEvent(loanAmendmentWithdrawn, "amendment_withdrawn"),
  timelineEvent(
    loanHandoverReported,
    "handover_reported",
    ({ role, outcome }) => ({ side: role, outcome }),
  ),
  timelineEvent(loanHandedOver, "handed_over"),
  timelineEvent(loanHandoverDisputed, "handover_disputed"),
  timelineEvent(loanNotCompleted, "not_completed", ({ basis }) => ({ basis })),
  timelineEvent(
    loanReturnReported,
    "return_reported",
    ({ role, outcome, reportedAs }) => ({
      side: role,
      outcome,
      byCoOwner: reportedAs === "co_owner",
    }),
  ),
  timelineEvent(loanReturned, "returned", ({ early }) => ({ early })),
  timelineEvent(loanReturnDisputed, "return_disputed", ({ reopened }) => ({
    reopened,
  })),
  timelineEvent(
    loanResponsibilityProposed,
    "responsibility_proposed",
    ({ kind, toUserId }, { person }) => ({
      transfer: { kind, from: null, to: person(toUserId) },
    }),
  ),
  timelineEvent(
    loanResponsibilityAnswered,
    "responsibility_answered",
    ({ answer }) => ({ answeredAs: answer }),
  ),
  timelineEvent(
    loanResponsibilityTransferred,
    "responsibility_transferred",
    ({ kind, fromUserId, toUserId }, { person }) => ({
      transfer: { kind, from: person(fromUserId), to: person(toUserId) },
    }),
  ),
  timelineEvent(loanResponsibilityDeclined, "responsibility_declined"),
  timelineEvent(loanResponsibilityWithdrawn, "responsibility_withdrawn"),
  timelineEvent(loanEndedUnresolved, "ended_unresolved"),
  timelineEvent(loanControlConfirmed, "control_confirmed"),
  // PS-LOAN-023: that a party reported damage or answered a report, never
  // what they wrote; the parties read that in the reports themselves.
  timelineEvent(loanConditionReported, "condition_reported", ({ role }) => ({
    side: role,
  })),
  timelineEvent(
    loanConditionAnswered,
    "condition_answered",
    ({ role, kind }) => ({ side: role, answerKind: kind }),
  ),
];

const byType = new Map(
  timelineEvents.map((entry) => [entry.definition.type, entry]),
);
const requestTypes = timelineEvents
  .filter(({ definition }) => definition.resourceType === "loan_request")
  .map(({ definition }) => definition.type);
const loanTypes = timelineEvents
  .filter(({ definition }) => definition.resourceType === "loan")
  .map(({ definition }) => definition.type);

/**
 * SQL: the domain events of the loan and of the request it came from that
 * the timeline shows.
 */
function ofLoan(loan: { id: string; requestId: string }) {
  return sql<boolean>`event.kind = 'domain' and (
    (event.resource_type = 'loan' and event.resource_id = ${loan.id}
      and event.event_type in (${sql.join(loanTypes)}))
    or (event.resource_type = 'loan_request'
      and event.resource_id = ${loan.requestId}
      and event.event_type in (${sql.join(requestTypes)}))
  )`;
}

const periodColumns = [
  sql<string>`lower(period)::text`.as("from"),
  sql<string>`upper(period)::text`.as("until"),
] as const;

/**
 * Everyone who has been the loan's responsible lender: the lender of each
 * agreed version, and each transfer's sides. They are named in the
 * timeline like the borrower; other co-owners are not.
 */
async function loadLenders(db: Db, loan: { id: string }) {
  const agreements = await db
    .selectFrom("app.loan_agreements")
    .select(["version", "lender_user_id", ...periodColumns])
    .where("loan_id", "=", loan.id)
    .execute();
  const transfers = await db
    .selectFrom("app.loan_lender_transfers")
    .select(["from_user_id", "to_user_id"])
    .where("loan_id", "=", loan.id)
    .where("status", "=", "completed")
    .execute();

  return {
    lenderIds: new Set([
      ...agreements.map((row) => row.lender_user_id),
      ...transfers.flatMap((row) => [row.from_user_id, row.to_user_id]),
    ]),
    agreementPeriods: new Map(
      agreements.map((row) => [
        row.version,
        { from: row.from, until: row.until },
      ]),
    ),
  };
}

/**
 * Who made each return statement, by its event. A confirmation whose undo
 * time ran out is recorded by whichever command or job comes next, so the
 * event's own actor may be someone else; the statement row keeps who made
 * it. Each statement is recorded with exactly one event, in the same order
 * (`makeStatement`), so the two lists pair up. If they ever did not, no
 * statement is attributed to anyone rather than to the wrong person.
 */
async function loadReturnReporters(
  db: Db,
  loanId: string,
): Promise<ReadonlyMap<string, string>> {
  const events = await db
    .selectFrom("app.audit_events")
    .select("id")
    .where("resource_type", "=", "loan")
    .where("resource_id", "=", loanId)
    .where("event_type", "=", loanReturnReported.type)
    .orderBy("position")
    .execute();
  const statements = await db
    .selectFrom("app.loan_return_reports")
    .select("reported_by_user_id")
    .where("loan_id", "=", loanId)
    .orderBy("position")
    .execute();

  return events.length === statements.length
    ? new Map(
        events.map((event, index) => [
          event.id,
          statements[index]!.reported_by_user_id,
        ]),
      )
    : new Map();
}

async function loadHistory(db: Db, loanId: string, cursor: string | undefined) {
  const loan = await findLoan(db, { loanId });

  if (!loan) {
    return null;
  }

  const rows = await db
    .selectFrom("app.audit_events as event")
    .select([
      "event.id",
      "event.occurred_at",
      "event.event_type",
      "event.event_version",
      "event.actor_user_id",
      "event.payload",
    ])
    .where(ofLoan(loan))
    .where(
      cursor === undefined
        ? sql<boolean>`true`
        : sql<boolean>`event.position < (
            select position from app.audit_events as event
            where event.id = ${cursor} and ${ofLoan(loan)}
          )`,
    )
    .orderBy("event.position", "desc")
    .limit(loanHistoryPageSize + 1)
    .execute();
  const { lenderIds, agreementPeriods } = await loadLenders(db, loan);
  const amendments = await db
    .selectFrom("app.loan_amendments")
    .select(["id", ...periodColumns])
    .where("loan_id", "=", loan.id)
    .execute();
  const reporters = await loadReturnReporters(db, loan.id);
  const names = await realNames(db, [loan.borrowerUserId, ...lenderIds]);

  return {
    ...loan,
    rows,
    lenderIds,
    reporters,
    names,
    agreementPeriods,
    amendmentPeriods: new Map(
      amendments.map((row) => [row.id, { from: row.from, until: row.until }]),
    ),
  };
}

type HistoryResource = NonNullable<Awaited<ReturnType<typeof loadHistory>>>;

/**
 * Who someone is to the caller in this loan. Only the borrower and the
 * lenders are named (UX-INT-004); a former user has no name (UX-PRIV-010).
 */
function personFor(actor: Actor, resource: HistoryResource) {
  return (userId: string): LoanHistoryPerson => {
    const role =
      userId === resource.borrowerUserId
        ? "borrower"
        : resource.lenderIds.has(userId)
          ? "lender"
          : "co_owner";

    return {
      you: actor.kind === "user" && actor.userId === userId,
      role,
      realName:
        role === "co_owner" ? null : (resource.names.get(userId) ?? null),
    };
  };
}

/** Who did it: for a return statement, whoever made the statement. */
function actorOf(
  row: HistoryResource["rows"][number],
  resource: HistoryResource,
  context: HistoryContext,
): LoanHistoryPerson | null {
  const userId =
    row.event_type === loanReturnReported.type
      ? (resource.reporters.get(row.id) ?? null)
      : row.actor_user_id;

  return userId ? context.person(userId) : null;
}

function presentHistory(actor: Actor, resource: HistoryResource): LoanHistory {
  const context: HistoryContext = {
    person: personFor(actor, resource),
    amendmentPeriods: resource.amendmentPeriods,
    agreementPeriods: resource.agreementPeriods,
  };
  const page = resource.rows.slice(0, loanHistoryPageSize);
  const entries = page.flatMap((row): LoanHistoryEntry[] => {
    const timeline = byType.get(row.event_type);
    const payload =
      timeline && row.event_version === timeline.definition.version
        ? timeline.definition.payload.safeParse(row.payload)
        : null;

    // An event the timeline does not know how to read is left out rather
    // than shown wrongly.
    if (!timeline || !payload?.success) {
      return [];
    }

    return [
      {
        id: row.id,
        at: row.occurred_at.toISOString(),
        event: timeline.event,
        actor: actorOf(row, resource, context),
        ...timeline.details(payload.data, context),
      },
    ];
  });

  return {
    entries,
    nextCursor:
      resource.rows.length > loanHistoryPageSize
        ? (page.at(-1)?.id ?? null)
        : null,
  };
}

/**
 * UX-IA-008, UX-INT-008: what happened in the loan, newest first, for its
 * parties only (as `loan.read`): human events with who did them and when,
 * from the request on. It is built from the append-only domain events
 * (docs/architecture/06), so it never changes after the fact; a correction
 * is a later entry (PS-LOAN-017). Someone who was a party before, such as
 * a responsible lender who handed the role on, no longer sees it.
 */
export const readLoanHistory = defineQuery({
  name: "loan.read_history",
  input: loanHistoryQuerySchema,
  policy: readLoanHistoryPolicy,
  load: ({ db, input }) =>
    inSnapshot(db, async (tx) => {
      const history = await loadHistory(tx, input.loanId, input.cursor);

      return history && { resource: history, context: undefined };
    }),
  present: ({ actor, resource }): LoanHistory =>
    presentHistory(actor, resource),
});
