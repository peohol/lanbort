import { sendChatMessage } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";
import { chatOnly } from "@/server/http/chat-gate";

/** An encrypted message for the group's other devices. */
export const POST = chatOnly(userCommandRoute(sendChatMessage));
