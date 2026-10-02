import { getObjectHistory } from "@lanbort/domain";
import { userQueryRoute } from "@/server/http/command-route";

/** Every version, newest first; `?beforeVersion=` pages (PS-OBJ-013). */
export const GET = userQueryRoute(getObjectHistory);
