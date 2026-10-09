import {
  answerLoanConditionSchema,
  type LoanConditionReport,
  type LoanConditionReports,
  type LoanConditionResult,
  loanConditionResultSchema,
  loanReferenceSchema,
  type LoanRequestRole,
  reportLoanConditionSchema,
} from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import type { Kysely } from "kysely";
import { realNames } from "../account/store";
import type { Actor } from "../actor";
import { defineCommand } from "../commands/command";
import { defineQuery } from "../commands/query";
import { DomainError } from "../errors";
import { actingUserId, inSnapshot } from "../objects/state";
import { loanConditionAnswered, loanConditionReported } from "./events";
import {
  answerLoanConditionPolicy,
  loanRoleOf,
  readLoanConditionReportsPolicy,
  reportLoanConditionPolicy,
} from "./policies";
import { type LoadedLoan, loadLoan } from "./resources";
import type { LoanRecord } from "./reservations";

/**
 * PS-LOAN-023 (OD-0033): damage, deficiency and loss as the parties'
 * traceable statements. Either party registers one, at the return or at any
 * time later; the other party may answer it once, disagreeing or adding
 * their explanation, as a statement of its own that never changes the
 * report. Nothing here is a loan status, an accusation, a claim or a trust
 * score: the loan, its ending and its reviews are untouched. The texts are
 * seen by the parties only, and never put in events or logs.
 */

type Db = Kysely<Database>;

function conflict(message: string): never {
  throw new DomainError("conflict", message);
}

/**
 * Whether the loan's object has been with the borrower, so damage can be
 * reported (`app.loan_condition_reportable`): handed over and in its return
 * phase, or ended after the handover (returned, or unresolved). Not before
 * the handover, while it is disputed, or after a cancelled, stopped or not
 * completed loan.
 */
export function conditionReportable(loan: LoanRecord): boolean {
  switch (loan.status) {
    case "active":
    case "awaiting_return":
    case "late":
    case "return_disputed":
      return true;
    case "ended":
      return (
        loan.ending?.reason === "returned" ||
        loan.ending?.reason === "unresolved"
      );
    default:
      return false;
  }
}

const otherSide = (role: LoanRequestRole): LoanRequestRole =>
  role === "borrower" ? "lender" : "borrower";

/** The acting party's side; the policy has made sure they have one. */
function sideOf(actor: Actor, loaded: LoadedLoan): LoanRequestRole {
  const role = loanRoleOf(actor, loaded);

  if (role === null) {
    throw new Error("Only a party speaks on the loan");
  }

  return role;
}

const statementColumns = [
  "id",
  "loan_id",
  "reported_by_user_id",
  "reporter_role",
  "responds_to_id",
  "answer_kind",
  "description",
  "reported_at",
] as const;

/**
 * A report (not an answer) on the loan, or null if there is none. With
 * `lock`, its row is locked, so answers to it run one after another.
 */
async function findReport(
  db: Db,
  loanId: string,
  reportId: string,
  options: { lock?: boolean } = {},
) {
  let query = db
    .selectFrom("app.loan_condition_reports")
    .select(statementColumns)
    .where("id", "=", reportId)
    .where("loan_id", "=", loanId)
    .where("responds_to_id", "is", null);

  if (options.lock) {
    query = query.forUpdate();
  }

  return (await query.executeTakeFirst()) ?? null;
}

/**
 * PS-LOAN-023: a party registers a concrete damage, deficiency or loss for
 * their side, from the handover on and with no deadline, also after the
 * loan ended. It does not change the loan's status, hold up its ending or
 * touch anyone's trust.
 */
export const reportLoanCondition = defineCommand({
  name: "loan.report_condition",
  input: reportLoanConditionSchema,
  output: loanConditionResultSchema,
  policy: reportLoanConditionPolicy,
  idempotency: "required",
  load: async ({ tx, input }) => {
    const loaded = await loadLoan(tx, input.loanId);

    return loaded && { resource: loaded, context: undefined };
  },
  execute: async ({
    tx,
    actor,
    input,
    resource,
    events,
    now,
  }): Promise<LoanConditionResult> => {
    const { loan } = resource;

    if (!conditionReportable(loan)) {
      conflict("The loan's object has not been with the borrower");
    }

    const role = sideOf(actor, resource);
    const { id } = await tx
      .insertInto("app.loan_condition_reports")
      .values({
        loan_id: loan.id,
        reported_by_user_id: actingUserId(actor),
        reporter_role: role,
        description: input.description,
        reported_at: now,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    events.record(loanConditionReported, {
      resourceId: loan.id,
      payload: { objectId: loan.objectId, reportId: id, role },
    });

    return { loanId: loan.id, reportId: id, answerId: null };
  },
});

/**
 * PS-LOAN-023: the other party answers a report once, disagreeing with it
 * or adding their own explanation. The answer points to the report and
 * never changes it. Any report on the loan may be answered while it has no
 * answer, whatever the loan's status.
 */
export const answerLoanCondition = defineCommand({
  name: "loan.answer_condition",
  input: answerLoanConditionSchema,
  output: loanConditionResultSchema,
  policy: answerLoanConditionPolicy,
  idempotency: "required",
  load: async ({ tx, input }) => {
    const loaded = await loadLoan(tx, input.loanId);
    const report =
      loaded &&
      (await findReport(tx, input.loanId, input.reportId, { lock: true }));

    return loaded && report
      ? {
          resource: {
            ...loaded,
            report,
            reporterRole: report.reporter_role as LoanRequestRole,
          },
          context: undefined,
        }
      : null;
  },
  execute: async ({
    tx,
    actor,
    input,
    resource,
    events,
    now,
  }): Promise<LoanConditionResult> => {
    const { loan, report } = resource;
    const answered = await tx
      .selectFrom("app.loan_condition_reports")
      .select("id")
      .where("responds_to_id", "=", report.id)
      .executeTakeFirst();

    if (answered) {
      conflict("The report has already been answered");
    }

    const role = otherSide(resource.reporterRole);
    const { id } = await tx
      .insertInto("app.loan_condition_reports")
      .values({
        loan_id: loan.id,
        reported_by_user_id: actingUserId(actor),
        reporter_role: role,
        responds_to_id: report.id,
        answer_kind: input.kind,
        description: input.description,
        reported_at: now,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    events.record(loanConditionAnswered, {
      resourceId: loan.id,
      payload: {
        objectId: loan.objectId,
        reportId: report.id,
        answerId: id,
        role,
        kind: input.kind,
      },
    });

    return { loanId: loan.id, reportId: report.id, answerId: id };
  },
});

async function loadConditionReports(db: Db, loanId: string) {
  const loaded = await loadLoan(db, loanId);

  if (!loaded) {
    return null;
  }

  const rows = await db
    .selectFrom("app.loan_condition_reports")
    .select(statementColumns)
    .where("loan_id", "=", loanId)
    .orderBy("position")
    .execute();
  const names = await realNames(
    db,
    rows.map((row) => row.reported_by_user_id),
  );

  return { ...loaded, rows, names };
}

type ConditionResource = NonNullable<
  Awaited<ReturnType<typeof loadConditionReports>>
>;

function presentConditionReports(
  actor: Actor,
  resource: ConditionResource,
): LoanConditionReports {
  const role = loanRoleOf(actor, resource);
  const statement = (row: ConditionResource["rows"][number]) => ({
    id: row.id,
    side: row.reporter_role as LoanRequestRole,
    you: actor.kind === "user" && actor.userId === row.reported_by_user_id,
    realName: resource.names.get(row.reported_by_user_id) ?? null,
    description: row.description,
    reportedAt: row.reported_at.toISOString(),
  });
  const answers = new Map(
    resource.rows.flatMap((row) =>
      row.responds_to_id === null ? [] : [[row.responds_to_id, row] as const],
    ),
  );
  const reports = resource.rows
    .filter((row) => row.responds_to_id === null)
    .map((row): LoanConditionReport => {
      const answer = answers.get(row.id);

      return {
        ...statement(row),
        answer: answer
          ? {
              ...statement(answer),
              kind: answer.answer_kind as "disagreement" | "explanation",
            }
          : null,
        answerable:
          !answer &&
          role !== null &&
          role === otherSide(row.reporter_role as LoanRequestRole),
      };
    });

  return { reports, mayReport: conditionReportable(resource.loan) };
}

/**
 * PS-LOAN-023: the loan's reports of damage, deficiency or loss with their
 * answers, oldest first, for its parties now (as `loan.read`).
 */
export const readLoanConditionReports = defineQuery({
  name: "loan.read_condition_reports",
  input: loanReferenceSchema,
  policy: readLoanConditionReportsPolicy,
  load: ({ db, input }) =>
    inSnapshot(db, async (tx) => {
      const reports = await loadConditionReports(tx, input.loanId);

      return reports && { resource: reports, context: undefined };
    }),
  present: ({ actor, resource }): LoanConditionReports =>
    presentConditionReports(actor, resource),
});
