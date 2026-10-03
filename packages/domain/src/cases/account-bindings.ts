import type { AccountBindingSource } from "../account/bindings";

/**
 * PS-ADM-004: an open mediation needs its parties, so it binds the account
 * of each, borrower and lender alike (also a former lender), until a handler
 * closes it. A member's own contact with the administrators and a report
 * someone filed do not: they need nobody but their handler to be finished.
 * The user a report is about is never told of it, so it cannot bind them.
 */
export const caseBindings: AccountBindingSource = {
  name: "cases",
  load: async (db, userId) => {
    const rows = await db
      .selectFrom("app.case_participants as participant")
      .innerJoin("app.cases as c", "c.id", "participant.case_id")
      .select("c.id")
      .where("participant.user_id", "=", userId)
      .where("participant.role", "in", ["borrower", "lender"])
      .where("c.status", "=", "open")
      .orderBy("c.id")
      .execute();

    return rows.map((row) => ({ kind: "case" as const, resourceId: row.id }));
  },
};
