import { readLoan } from "@lanbort/domain";
import { userQueryRoute } from "@/server/http/command-route";

/** One loan and its agreement, for its borrower or responsible lender. */
export const GET = userQueryRoute(readLoan);
