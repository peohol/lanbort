import { readLoanAsCoOwner } from "@lanbort/domain";
import { userQueryRoute } from "@/server/http/command-route";

/**
 * The loan as a co-owner who is not its party sees it: only its status,
 * period, object, terms, the parties' names and the caller's own steps
 * (UX-PRIV-013).
 */
export const GET = userQueryRoute(readLoanAsCoOwner);
