import { listEnvironmentObjects } from "@lanbort/domain";
import { userQueryRoute } from "@/server/http/command-route";

/** `?environmentId=&cursor=`: the objects an active member finds there. */
export const GET = userQueryRoute(listEnvironmentObjects);
