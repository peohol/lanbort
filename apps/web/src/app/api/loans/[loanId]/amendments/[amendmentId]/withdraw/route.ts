import { withdrawLoanAmendment } from "@lanbort/domain";
import { userPathCommandRoute } from "@/server/http/command-route";

/** The proposing side takes its proposal back. */
export const POST = userPathCommandRoute(withdrawLoanAmendment);
