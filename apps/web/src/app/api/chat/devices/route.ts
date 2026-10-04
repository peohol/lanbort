import { readOwnChatDevices } from "@lanbort/domain";
import { userQueryRoute } from "@/server/http/command-route";

/** «Mine enheter»: the account key, its devices and this session's device. */
export const GET = userQueryRoute(readOwnChatDevices);
