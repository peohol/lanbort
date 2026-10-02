import { leaveObject } from "@lanbort/domain";
import { userPathCommandRoute } from "@/server/http/command-route";

/** The caller stops being a co-owner; nobody can remove another (PS-OBJ-010). */
export const POST = userPathCommandRoute(leaveObject);
