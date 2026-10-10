import { declineChatLink } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";
import { chatOnly } from "@/server/http/chat-gate";

/** An existing device declines a device that waits to be linked. */
export const POST = chatOnly(userCommandRoute(declineChatLink));
