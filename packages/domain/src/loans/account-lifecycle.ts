import type { Database } from "@lanbort/database";
import { type Kysely, sql } from "kysely";
import type { AccountBindingSource } from "../account/bindings";
import type { EventRecorder } from "../events/recorder";
import { calendarDate } from "../objects/availability";
import { loanStopped } from "./events";
import { beforeHandover } from "./model";
import { endLoan } from "./reservations";

type Db = Kysely<Database>;

/** Loans the account is a party to, as borrower or as responsible lender. */
const partyTo = (userId: string) =>
  sql<boolean>`(loan.borrower_user_id = ${userId} or loan.responsible_lender_id = ${userId})`;

/**
 * PS-ADM-004: every loan that has not ended binds both parties: a reserved,
 * active or unresolved loan still needs them. An ended loan does not, also
 * when it ended unresolved.
 */
export const loanBindings: AccountBindingSource = {
  name: "loans",
  load: async (db, userId) => {
    const rows = await db
      .selectFrom("app.loans as loan")
      .select("loan.id")
      .where(partyTo(userId))
      .where("loan.status", "<>", "ended")
      .orderBy("loan.id")
      .execute();

    return rows.map((row) => ({ kind: "loan" as const, resourceId: row.id }));
  },
};

/**
 * PS-ADM-003: a suspension stops the reserved loans of the account, as
 * borrower or as responsible lender, whose handover day has not passed
 * (`stopped`). Those whose handover day is over are already awaiting
 * clarification and follow their course, like handed-over objects
 * (PS-LOAN-021). The caller holds the account's lock; the objects are locked
 * in id order before their loans, as loan commands do.
 */
export async function stopReservedLoansOf(
  db: Db,
  userId: string,
  now: Date,
  events: EventRecorder,
): Promise<void> {
  const objects = await db
    .selectFrom("app.loans as loan")
    .select("loan.object_id")
    .distinct()
    .where(partyTo(userId))
    .where("loan.status", "=", "reserved")
    .execute();
  const objectIds = objects.flatMap((row) =>
    row.object_id === null ? [] : [row.object_id],
  );

  if (objectIds.length === 0) {
    return;
  }

  await db
    .selectFrom("app.objects")
    .select("id")
    .where("id", "in", objectIds)
    .orderBy("id")
    .forUpdate()
    .execute();

  const loans = await db
    .selectFrom("app.loans as loan")
    .select([
      "loan.id",
      "loan.object_id",
      sql<string>`lower((app.current_loan_agreement(loan.id)).period)::text`.as(
        "from",
      ),
      sql<string>`upper((app.current_loan_agreement(loan.id)).period)::text`.as(
        "until",
      ),
    ])
    .where(partyTo(userId))
    .where("loan.status", "=", "reserved")
    .orderBy("loan.id")
    .forUpdate()
    .execute();
  const today = calendarDate(now);

  for (const loan of loans) {
    if (loan.object_id === null || !beforeHandover(loan, today)) {
      continue;
    }

    await endLoan(db, {
      loanId: loan.id,
      from: ["reserved"],
      reason: "stopped",
      endedByUserId: null,
      now,
    });
    events.record(loanStopped, {
      resourceId: loan.id,
      payload: { objectId: loan.object_id },
    });
  }
}
