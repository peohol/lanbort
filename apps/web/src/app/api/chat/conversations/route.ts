import { listChatConversations, startChatConversation } from "@lanbort/domain";
import { userCommandRoute, userQueryRoute } from "@/server/http/command-route";
import { chatOnly } from "@/server/http/chat-gate";

/** The caller's conversations, most recent first. */
export const GET = chatOnly(userQueryRoute(listChatConversations));

/**
 * A private conversation with a friend, or with someone whose structured
 * contact the caller received (PS-COM-006).
 */
export const POST = chatOnly(userCommandRoute(startChatConversation));
