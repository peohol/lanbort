import { acknowledgeChatInbox } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** The device has handled these items; the server forgets them. */
export const POST = userCommandRoute(acknowledgeChatInbox);
