import { withdrawFromFriends } from "@lanbort/domain";
import { userPathCommandRoute } from "@/server/http/command-route";

/** Any owner takes the object back from friends; open direct requests end. */
export const POST = userPathCommandRoute(withdrawFromFriends);
