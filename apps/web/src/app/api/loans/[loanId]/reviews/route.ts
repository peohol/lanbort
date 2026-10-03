import { readLoanReviews, submitLoanReview } from "@lanbort/domain";
import { userCommandRoute, userQueryRoute } from "@/server/http/command-route";

/** The loan's reviews as one of its parties sees them (PS-TRUST-003/005). */
export const GET = userQueryRoute(readLoanReviews);

/**
 * A party reviews the other party of the ended loan, or revises their hidden
 * review (PS-TRUST-001–004).
 */
export const POST = userCommandRoute(submitLoanReview);
