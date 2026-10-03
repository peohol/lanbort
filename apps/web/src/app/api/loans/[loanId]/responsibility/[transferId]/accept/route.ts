import { acceptResponsibilityTransfer } from "@lanbort/domain";
import { userPathCommandRoute } from "@/server/http/command-route";

/** The recipient accepts the role, or the borrower consents to a later co-owner (PS-LOAN-009). */
export const POST = userPathCommandRoute(acceptResponsibilityTransfer);
