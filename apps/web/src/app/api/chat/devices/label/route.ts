import { labelChatDevice } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";
import { chatOnly } from "@/server/http/chat-gate";

/** Renames one of the account's devices, or says what kind it is. */
export const POST = chatOnly(userCommandRoute(labelChatDevice));
