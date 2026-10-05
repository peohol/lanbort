import { registerChatAccount } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";
import { chatOnly } from "@/server/http/chat-gate";

/** The account's first chat device: a new account key and this device. */
export const POST = chatOnly(userCommandRoute(registerChatAccount));
