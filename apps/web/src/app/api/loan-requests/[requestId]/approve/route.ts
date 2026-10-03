import { approveLoanRequest } from "@lanbort/domain";
import { userPathCommandRoute } from "@/server/http/command-route";

/** An owner who sees the request approves it and reserves its period (PS-LOAN-006–008). */
export const POST = userPathCommandRoute(approveLoanRequest);
