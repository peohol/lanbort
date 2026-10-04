import { submitChatCommit } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";
import { chatOnly } from "@/server/http/chat-gate";

/** A group change for the current epoch, with welcomes for added devices. */
export const POST = chatOnly(userCommandRoute(submitChatCommit));
