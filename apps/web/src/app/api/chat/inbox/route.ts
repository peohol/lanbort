import { readChatInbox } from "@lanbort/domain";
import { userQueryRoute } from "@/server/http/command-route";

/** What waits for this session's device, oldest first. */
export const GET = userQueryRoute(readChatInbox);
