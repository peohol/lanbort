import { declineLoanRequest } from "@lanbort/domain";
import { userPathCommandRoute } from "@/server/http/command-route";

/** An owner who sees the request declines it. */
export const POST = userPathCommandRoute(declineLoanRequest);
