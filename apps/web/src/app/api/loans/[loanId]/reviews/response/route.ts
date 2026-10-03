import { respondToLoanReview } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** The reviewed party's one response to the review about them (PS-TRUST-005). */
export const POST = userCommandRoute(respondToLoanReview);
