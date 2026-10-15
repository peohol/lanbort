import { readFriendCode } from "@lanbort/domain";
import { userQueryRoute } from "@/server/http/command-route";

/** Who a scanned or typed friend code `?code=` belongs to, by name. */
export const GET = userQueryRoute(readFriendCode);
