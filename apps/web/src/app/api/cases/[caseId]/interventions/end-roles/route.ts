import { endEnvironmentRoles } from "@lanbort/domain";
import { stewardsOnly } from "@/server/http/chat-gate";
import { userCommandRoute } from "@/server/http/command-route";

/**
 * `{ userId, environmentId, basis }`: the steward ends the roles the account
 * holds in an environment, from this platform case (PS-ADM-015).
 */
export const POST = stewardsOnly(userCommandRoute(endEnvironmentRoles));
