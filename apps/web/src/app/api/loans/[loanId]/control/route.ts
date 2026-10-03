import { confirmLoanControl } from "@lanbort/domain";
import { userPathCommandRoute } from "@/server/http/command-route";

/** An owner confirms having the object back after the loan ended unresolved (PS-LOAN-019). */
export const POST = userPathCommandRoute(confirmLoanControl);
