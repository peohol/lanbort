import { getSocialRelation } from "@lanbort/domain";
import { userQueryRoute } from "@/server/http/command-route";

/** `?userId=`: the signed-in user's relation to that user. */
export const GET = userQueryRoute(getSocialRelation);
