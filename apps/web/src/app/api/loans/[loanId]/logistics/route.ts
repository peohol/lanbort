import { readLoanLogistics } from "@lanbort/domain";
import { userQueryRoute } from "@/server/http/command-route";

/** The loan's logistics channels that joined the caller (PS-COM-007). */
export const GET = userQueryRoute(readLoanLogistics);
