import { readChatDirectory } from "@lanbort/domain";
import { userQueryRoute } from "@/server/http/command-route";

/** The participants' keys and devices, for the device to check. */
export const GET = userQueryRoute(readChatDirectory);
