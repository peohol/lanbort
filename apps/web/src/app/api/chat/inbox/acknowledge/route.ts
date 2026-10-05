import { acknowledgeChatInbox } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";
import { chatOnly } from "@/server/http/chat-gate";

/** The device has handled these items; the server forgets them. */
export const POST = chatOnly(userCommandRoute(acknowledgeChatInbox));
