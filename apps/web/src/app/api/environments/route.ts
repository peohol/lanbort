import { createEnvironment, listOwnEnvironments } from "@lanbort/domain";
import { userCommandRoute, userQueryRoute } from "@/server/http/command-route";

/** The caller's own environments, including pending invitations. */
export const GET = userQueryRoute(listOwnEnvironments);

/** Creates an environment; the caller becomes owner (PS-ENV-001–003). */
export const POST = userCommandRoute(createEnvironment);
