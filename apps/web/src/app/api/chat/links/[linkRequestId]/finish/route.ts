import { finishChatLink } from "@lanbort/domain";
import { userPathCommandRoute } from "@/server/http/command-route";

/** The new device has taken its package; the request is gone. */
export const POST = userPathCommandRoute(finishChatLink);
