import { readChatInbox } from "@lanbort/domain";
import { userQueryRoute } from "@/server/http/command-route";
import { chatOnly } from "@/server/http/chat-gate";

/** What waits for this session's device, oldest first. */
export const GET = chatOnly(userQueryRoute(readChatInbox));
