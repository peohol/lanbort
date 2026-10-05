import { finishChatLink } from "@lanbort/domain";
import { userPathCommandRoute } from "@/server/http/command-route";
import { chatOnly } from "@/server/http/chat-gate";

/** The new device has taken its package; the request is gone. */
export const POST = chatOnly(userPathCommandRoute(finishChatLink));
