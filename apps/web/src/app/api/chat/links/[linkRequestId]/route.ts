import { readChatLinkStatus } from "@lanbort/domain";
import { userQueryRoute } from "@/server/http/command-route";

/** The new device follows its own link request. */
export const GET = userQueryRoute(readChatLinkStatus);
