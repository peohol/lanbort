import { listChatConversations, startChatConversation } from "@lanbort/domain";
import { userCommandRoute, userQueryRoute } from "@/server/http/command-route";

/** The caller's conversations, most recent first. */
export const GET = userQueryRoute(listChatConversations);

/**
 * A private conversation with a friend, or with someone whose structured
 * contact the caller received (PS-COM-006).
 */
export const POST = userCommandRoute(startChatConversation);
