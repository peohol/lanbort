import { hideChatConversation } from "@lanbort/domain";
import { userPathCommandRoute } from "@/server/http/command-route";
import { chatOnly } from "@/server/http/chat-gate";

/** «Fjern fra mine samtaler» (PS-COM-009). */
export const POST = chatOnly(userPathCommandRoute(hideChatConversation));
