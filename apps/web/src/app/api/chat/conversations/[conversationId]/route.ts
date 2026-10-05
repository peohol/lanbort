import { readChatConversation } from "@lanbort/domain";
import { userQueryRoute } from "@/server/http/command-route";
import { chatOnly } from "@/server/http/chat-gate";

/** One conversation, for its participants. */
export const GET = chatOnly(userQueryRoute(readChatConversation));
