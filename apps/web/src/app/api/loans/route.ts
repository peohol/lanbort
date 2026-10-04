import { listLoans } from "@lanbort/domain";
import { userQueryRoute } from "@/server/http/command-route";

/**
 * `?state=current|ended&role=borrower|lender&cursor=`: the caller's own
 * loans, as borrower or responsible lender (UX-IA-006).
 */
export const GET = userQueryRoute(listLoans);
