import { moveDuplicateObject } from "@lanbort/domain";
import { stewardsOnly } from "@/server/http/chat-gate";
import { userCommandRoute } from "@/server/http/command-route";

/**
 * `{ objectId, basis }`: the steward moves a thing of a retired duplicate to
 * the account that continues, from this platform case (PS-ADM-009).
 */
export const POST = stewardsOnly(userCommandRoute(moveDuplicateObject));
