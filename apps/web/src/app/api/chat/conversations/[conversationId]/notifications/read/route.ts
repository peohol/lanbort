import { readChatMessageNotifications } from "@lanbort/domain";
import { userPathCommandRoute } from "@/server/http/command-route";
import { chatOnly } from "@/server/http/chat-gate";

/** The conversation is open: its notification of new messages is read. */
export const POST = chatOnly(
  userPathCommandRoute(readChatMessageNotifications),
);
