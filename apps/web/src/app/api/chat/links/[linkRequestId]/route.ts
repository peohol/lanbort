import { readChatLinkStatus } from "@lanbort/domain";
import { userQueryRoute } from "@/server/http/command-route";
import { chatOnly } from "@/server/http/chat-gate";

/** The new device follows its own link request. */
export const GET = chatOnly(userQueryRoute(readChatLinkStatus));
