import { listChatLinkRequests, requestChatLink } from "@lanbort/domain";
import { userCommandRoute, userQueryRoute } from "@/server/http/command-route";
import { chatOnly } from "@/server/http/chat-gate";

/** The account's pending link requests, for an existing device to approve. */
export const GET = chatOnly(userQueryRoute(listChatLinkRequests));

/** A new device in this session asks to be linked to the account. */
export const POST = chatOnly(userCommandRoute(requestChatLink));
