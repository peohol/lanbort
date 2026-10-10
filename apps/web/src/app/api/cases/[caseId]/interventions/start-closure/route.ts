import { startAccountClosure } from "@lanbort/domain";
import { stewardsOnly } from "@/server/http/chat-gate";
import { userCommandRoute } from "@/server/http/command-route";

/** `{ userId, basis }`: the steward starts a controlled closure, from this platform case (PS-ADM-014–015). */
export const POST = stewardsOnly(userCommandRoute(startAccountClosure));
