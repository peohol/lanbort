import { approveChatLink } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";
import { chatOnly } from "@/server/http/chat-gate";

/** An existing device certifies the new one and hands over its package. */
export const POST = chatOnly(userCommandRoute(approveChatLink));
