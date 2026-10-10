import { createChatArchive } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";
import { chatOnly } from "@/server/http/chat-gate";

/** The approving device starts an archive of its history for a new one. */
export const POST = chatOnly(userCommandRoute(createChatArchive));
