import type { NotificationKind } from "@lanbort/contracts";
import { sql } from "kysely";
import { z } from "zod";
import { defineCommand } from "../commands/command";
import {
  type LoanPeriodInterval,
  presentedLoanStatus,
  type StoredLoanStatus,
} from "../loans/model";
import { addDays, calendarDate } from "../objects/availability";
import { notifyLoanDeadlinesPolicy } from "./policies";
import { tell } from "./rule";
import { recordNotifications } from "./store";

/**
 * The days of a loan that tell both parties something without anyone
 * acting (vision 06, «Påkrevde varsler»):
 * - the handover day is over and the loan was not handed over: it awaits
 *   the handover clarification (PS-LOAN-012);
 * - the agreed last day has come («kommende returtid»): the object is due
 *   back today;
 * - the last day is over and the return is not settled: it awaits the
 *   return clarification (PS-LOAN-014).
 * None of them changes the loan; they follow its derived status.
 */
export function dueLoanDeadline(
  status: StoredLoanStatus,
  period: LoanPeriodInterval,
  today: string,
): { kind: NotificationKind; day: string } | null {
  switch (presentedLoanStatus(status, period, today)) {
    case "awaiting_handover":
      return { kind: "loan.handover_day_passed", day: period.from };
    case "awaiting_return":
      return { kind: "loan.return_day_passed", day: period.until };
    case "active":
      return today === addDays(period.until, -1)
        ? { kind: "loan.return_due", day: today }
        : null;
    default:
      return null;
  }
}

/**
 * Tells the parties of every loan that reached one of its days
 * ({@link dueLoanDeadline}). Each day of each loan is told once, keyed by
 * the day itself, so an agreed new day is told again and a repeated run is
 * not. Safe to run repeatedly and concurrently; it changes no loan.
 */
export const notifyLoanDeadlines = defineCommand({
  name: "notification.notify_loan_deadlines",
  input: z.strictObject({}),
  output: z.strictObject({ notified: z.int().nonnegative() }),
  policy: notifyLoanDeadlinesPolicy,
  idempotency: "none",
  load: async () => ({ resource: undefined, context: undefined }),
  execute: async ({ tx, now }) => {
    const today = calendarDate(now);
    const loans = await tx
      .selectFrom("app.loans as loan")
      .innerJoin(
        "app.loan_agreements as agreement",
        "agreement.loan_id",
        "loan.id",
      )
      .select([
        "loan.id",
        "loan.status",
        "loan.borrower_user_id",
        "loan.responsible_lender_id",
        sql<string>`lower(agreement.period)::text`.as("from"),
        sql<string>`upper(agreement.period)::text`.as("until"),
      ])
      .where(
        "agreement.version",
        "=",
        sql<number>`(select max(version) from app.loan_agreements where loan_id = loan.id)`,
      )
      .where((eb) =>
        eb.or([
          eb.and([
            eb("loan.status", "=", "reserved"),
            sql<boolean>`lower(agreement.period) < ${today}::date`,
          ]),
          eb.and([
            eb("loan.status", "=", "active"),
            sql<boolean>`upper(agreement.period) <= ${addDays(today, 1)}::date`,
          ]),
        ]),
      )
      .execute();
    let notified = 0;

    for (const loan of loans) {
      const due = dueLoanDeadline(
        loan.status as StoredLoanStatus,
        { from: loan.from, until: loan.until },
        today,
      );

      if (due) {
        notified += await recordNotifications(
          tx,
          `deadline:${due.day}`,
          now,
          tell([loan.borrower_user_id, loan.responsible_lender_id], due.kind, {
            type: "loan",
            id: loan.id,
          }),
        );
      }
    }

    return { notified };
  },
});
