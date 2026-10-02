import { listMemberships } from "@lanbort/domain";
import { userQueryRoute } from "@/server/http/command-route";

/** `?environmentId=`: memberships for administrators to handle. */
export const GET = userQueryRoute(listMemberships);
