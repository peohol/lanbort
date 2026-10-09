import { muteChatConversation } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";
import { chatOnly } from "@/server/http/chat-gate";

/** «Demp samtalen»: no notifications of its new messages (PS-COM-018). */
export const POST = chatOnly(userCommandRoute(muteChatConversation));
