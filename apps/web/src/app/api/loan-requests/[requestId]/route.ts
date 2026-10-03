import { readLoanRequest } from "@lanbort/domain";
import { userQueryRoute } from "@/server/http/command-route";

/** One loan request, for its borrower or a lender who sees it. */
export const GET = userQueryRoute(readLoanRequest);
