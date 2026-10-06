import { publishToFriends } from "@lanbort/domain";
import { userPathCommandRoute } from "@/server/http/command-route";

/** Any owner makes the object visible to friends (PS-OBJ-020). */
export const POST = userPathCommandRoute(publishToFriends);
