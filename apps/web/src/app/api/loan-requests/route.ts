import { createLoanRequest, listLoanRequests } from "@lanbort/domain";
import { userCommandRoute, userQueryRoute } from "@/server/http/command-route";

/** `?role=borrower|lender&cursor=`: the caller's loan requests on one side. */
export const GET = userQueryRoute(listLoanRequests);

/** A loan request through an environment or directly to a friend (PS-LOAN-001–005). */
export const POST = userCommandRoute(createLoanRequest);
