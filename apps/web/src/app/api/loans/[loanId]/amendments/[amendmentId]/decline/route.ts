import { declineLoanAmendment } from "@lanbort/domain";
import { userPathCommandRoute } from "@/server/http/command-route";

/** The other party says no; the agreement stands (PS-LOAN-010). */
export const POST = userPathCommandRoute(declineLoanAmendment);
