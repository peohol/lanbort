import { listEnvironmentMembers } from "@lanbort/domain";
import { userQueryRoute } from "@/server/http/command-route";

/** `?environmentId=`: the other active members, for an active member. */
export const GET = userQueryRoute(listEnvironmentMembers);
