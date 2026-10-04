import { sql } from "kysely";
import type { AccountDeletionStep } from "../account/deletion";
import { loanReviewRightLapsed } from "./events";

/**
 * PS-ADM-005 with the reviews of WP-50, when an account is deleted:
 * - its unused review right lapses: it can never review in a window that
 *   has not closed, which `loan_review.right_lapsed` records for each;
 * - a review it already gave is not touched, and is published with the
 *   other's as usual (PS-TRUST-003), behind only an internal id;
 * - the other party's right stands: they may still review, revise and
 *   respond until the window closes, and nothing waits for the deleted
 *   party any more than for one who lets the window pass.
 * The window itself is not changed, so publication stays double-blind.
 */
export const reviewRightsStep: AccountDeletionStep = {
  name: "review_rights",
  run: async (db, userId, _now, events) => {
    const unused = await db
      .selectFrom("app.loan_review_periods as period")
      .select([
        "period.loan_id",
        sql<
          "borrower" | "lender"
        >`case when period.borrower_user_id = ${userId} then 'borrower' else 'lender' end`.as(
          "role",
        ),
      ])
      .where((eb) =>
        eb.or([
          eb("period.borrower_user_id", "=", userId),
          eb("period.lender_user_id", "=", userId),
        ]),
      )
      .where("period.status", "<>", "closed")
      .where(({ not, exists, selectFrom }) =>
        not(
          exists(
            selectFrom("app.loan_reviews as review")
              .select("review.id")
              .whereRef("review.loan_id", "=", "period.loan_id")
              .where("review.author_user_id", "=", userId)
              .where("review.status", "<>", "lapsed"),
          ),
        ),
      )
      .orderBy("period.loan_id")
      .execute();

    for (const window of unused) {
      events.record(loanReviewRightLapsed, {
        resourceId: window.loan_id,
        payload: { role: window.role },
      });
    }
  },
};
