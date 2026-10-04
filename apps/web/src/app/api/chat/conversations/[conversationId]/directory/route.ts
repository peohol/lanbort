import { readChatDirectory } from "@lanbort/domain";
import { userQueryRoute } from "@/server/http/command-route";
import { chatOnly } from "@/server/http/chat-gate";

/** The participants' keys and devices, for the device to check. */
export const GET = chatOnly(userQueryRoute(readChatDirectory));
