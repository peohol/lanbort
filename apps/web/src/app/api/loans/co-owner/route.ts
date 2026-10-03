import { listCoOwnerLoans } from "@lanbort/domain";
import { userQueryRoute } from "@/server/http/command-route";

/**
 * Loans the caller may act on as a co-owner without being a party: an offer
 * of the responsible lender's role, or taking over or confirming the
 * receipt while the lender is unavailable (PS-LOAN-009, PS-LOAN-015).
 */
export const GET = userQueryRoute(listCoOwnerLoans);
