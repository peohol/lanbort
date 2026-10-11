import { acknowledgeChatNotice } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";
import { chatOnly } from "@/server/http/chat-gate";

/** The notice confirmed before chat is turned on (PS-COM-023). */
export const POST = chatOnly(userCommandRoute(acknowledgeChatNotice));
