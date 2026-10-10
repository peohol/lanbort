import { retireDuplicateAccount } from "@lanbort/domain";
import { stewardsOnly } from "@/server/http/chat-gate";
import { userCommandRoute } from "@/server/http/command-route";

/**
 * `{ userId, continuedUserId, basis }`: the steward retires the account as
 * a duplicate of the one that continues, from this platform case
 * (PS-ADM-009, PS-ADM-015).
 */
export const POST = stewardsOnly(userCommandRoute(retireDuplicateAccount));
