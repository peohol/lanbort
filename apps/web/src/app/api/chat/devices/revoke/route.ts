import { revokeChatDevice } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";
import { chatOnly } from "@/server/http/chat-gate";

/** Shuts one of the account's devices out, by a revocation it signed. */
export const POST = chatOnly(userCommandRoute(revokeChatDevice));
