import { linkSamePerson } from "@lanbort/domain";
import { stewardsOnly } from "@/server/http/chat-gate";
import { userCommandRoute } from "@/server/http/command-route";

/**
 * `{ userId, linkedUserId, basis }`: the steward links two accounts of the
 * same person in the security record, from this platform case (PS-ADM-010).
 */
export const POST = stewardsOnly(userCommandRoute(linkSamePerson));
