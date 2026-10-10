import { deleteChatArchive } from "@lanbort/domain";
import { userPathCommandRoute } from "@/server/http/command-route";
import { chatOnly } from "@/server/http/chat-gate";

/** The history has arrived, or was given up: the archive is gone. */
export const POST = chatOnly(userPathCommandRoute(deleteChatArchive));
