import { hideChatConversation } from "@lanbort/domain";
import { userPathCommandRoute } from "@/server/http/command-route";

/** «Fjern fra mine samtaler» (PS-COM-009). */
export const POST = userPathCommandRoute(hideChatConversation);
