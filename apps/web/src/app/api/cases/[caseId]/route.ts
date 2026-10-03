import { readCase } from "@lanbort/domain";
import { userQueryRoute } from "@/server/http/command-route";

/** One case as the caller sees it, as a participant or as a handler. */
export const GET = userQueryRoute(readCase);
