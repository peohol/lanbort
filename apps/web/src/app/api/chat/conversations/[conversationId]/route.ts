import { readChatConversation } from "@lanbort/domain";
import { userQueryRoute } from "@/server/http/command-route";

/** One conversation, for its participants. */
export const GET = userQueryRoute(readChatConversation);
