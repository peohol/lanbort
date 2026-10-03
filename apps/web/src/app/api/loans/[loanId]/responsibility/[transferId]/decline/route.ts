import { declineResponsibilityTransfer } from "@lanbort/domain";
import { userPathCommandRoute } from "@/server/http/command-route";

/** The recipient or the borrower says no; the role stays (PS-LOAN-009). */
export const POST = userPathCommandRoute(declineResponsibilityTransfer);
