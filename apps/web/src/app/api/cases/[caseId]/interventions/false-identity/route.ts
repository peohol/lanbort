import { recordFalseIdentity } from "@lanbort/domain";
import { stewardsOnly } from "@/server/http/chat-gate";
import { userCommandRoute } from "@/server/http/command-route";

/** `{ userId, basis }`: the steward records a false identity, from this platform case (PS-ADM-014–015). */
export const POST = stewardsOnly(userCommandRoute(recordFalseIdentity));
