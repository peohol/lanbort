import { submitChatCommit } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** A group change for the current epoch, with welcomes for added devices. */
export const POST = userCommandRoute(submitChatCommit);
