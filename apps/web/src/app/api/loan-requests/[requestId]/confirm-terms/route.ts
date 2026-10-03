import { confirmLoanTerms } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** `{ termsVersion }`: the borrower confirms changed terms (PS-LOAN-005). */
export const POST = userCommandRoute(confirmLoanTerms);
