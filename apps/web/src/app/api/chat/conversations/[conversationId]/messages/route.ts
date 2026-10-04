import { sendChatMessage } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** An encrypted message for the group's other devices. */
export const POST = userCommandRoute(sendChatMessage);
