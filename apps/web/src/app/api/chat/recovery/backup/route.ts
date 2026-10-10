import { backUpChatHistory } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";
import { chatOnly } from "@/server/http/chat-gate";

/** A newer backup under the same key, with a complete history archive. */
export const POST = chatOnly(userCommandRoute(backUpChatHistory));
