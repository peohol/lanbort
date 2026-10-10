import { answerChatRecoveryPrompt } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";
import { chatOnly } from "@/server/http/chat-gate";

/** «Ikke nå» to the offer of a recovery key, or to its one reminder. */
export const POST = chatOnly(userCommandRoute(answerChatRecoveryPrompt));
