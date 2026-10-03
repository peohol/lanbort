import { withdrawLoanRequest } from "@lanbort/domain";
import { userPathCommandRoute } from "@/server/http/command-route";

/** The borrower takes the request back. */
export const POST = userPathCommandRoute(withdrawLoanRequest);
