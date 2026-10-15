import { describeChatDevice } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";
import { chatOnly } from "@/server/http/chat-gate";

/** This session's device fills in what its label lacks about it. */
export const POST = chatOnly(userCommandRoute(describeChatDevice));
