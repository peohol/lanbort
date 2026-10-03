import { cancelLoan } from "@lanbort/domain";
import { userPathCommandRoute } from "@/server/http/command-route";

/** Either party cancels the reserved loan before the handover (PS-LOAN-011). */
export const POST = userPathCommandRoute(cancelLoan);
