import { removeStewardPasskey } from "@lanbort/domain";
import { stewardsOnly } from "@/server/http/chat-gate";
import { userCommandRoute } from "@/server/http/command-route";

/** Removes a lost or retired passkey, never the last (OD-0023). */
export const POST = stewardsOnly(userCommandRoute(removeStewardPasskey));
