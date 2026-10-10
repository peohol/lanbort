import { restoreChatAccount } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";
import { chatOnly } from "@/server/http/chat-gate";

/** Chat back on this device with the recovery key; the others shut out. */
export const POST = chatOnly(userCommandRoute(restoreChatAccount));
