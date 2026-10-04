import { readLoanHistory } from "@lanbort/domain";
import { userQueryRoute } from "@/server/http/command-route";

/** The loan's timeline, newest first; `?cursor=` pages (UX-INT-008). */
export const GET = userQueryRoute(readLoanHistory);
