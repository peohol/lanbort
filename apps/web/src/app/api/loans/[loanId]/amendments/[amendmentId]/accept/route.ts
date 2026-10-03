import { acceptLoanAmendment } from "@lanbort/domain";
import { userPathCommandRoute } from "@/server/http/command-route";

/** The other party agrees: the change becomes the agreement's next version (PS-LOAN-010). */
export const POST = userPathCommandRoute(acceptLoanAmendment);
