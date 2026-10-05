import { readOwnChatDevices } from "@lanbort/domain";
import { userQueryRoute } from "@/server/http/command-route";
import { chatOnly } from "@/server/http/chat-gate";

/** «Mine enheter»: the account key, its devices and this session's device. */
export const GET = chatOnly(userQueryRoute(readOwnChatDevices));
