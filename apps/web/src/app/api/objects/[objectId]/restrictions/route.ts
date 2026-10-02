import { setObjectRestriction } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** No new loans in `{ period }`, or on any date when null (PS-OBJ-008). */
export const POST = userCommandRoute(setObjectRestriction);
