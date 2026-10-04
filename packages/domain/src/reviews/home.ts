import { type HomeSource, homeItem } from "../home/source";
import { listPendingLoanReviews } from "./queries";

/** PS-TRUST-002–003: a review the caller may still write, until its deadline. */
export const reviewHomeSource: HomeSource = {
  name: "reviews",
  async items({ query }) {
    const { reviews } = await query(listPendingLoanReviews, {});

    return reviews.map((review) =>
      homeItem(
        "loan.write_review",
        { type: "loan", id: review.loanId },
        { title: review.title, role: review.role, dueAt: review.dueAt },
      ),
    );
  },
};
