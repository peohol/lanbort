import { getSocialOverview } from "@lanbort/domain";
import { userQueryRoute } from "@/server/http/command-route";

/** The signed-in user's friends, friend requests and blocks. */
export const GET = userQueryRoute(getSocialOverview);
