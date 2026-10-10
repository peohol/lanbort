import type { ChatContext } from "@lanbort/contracts";
import { readChatContact } from "@lanbort/domain";
import { chatConversationHref, chatWithHref } from "@/navigation/chat";
import { chatEnabled } from "./env";
import { pageQuery } from "./session";

/** Where a page lets the reader write to someone, and whether it exists. */
export interface ChatContactLink {
  href: string;
  /** Their conversation is there already: «Gå til samtalen med …». */
  existing: boolean;
}

/**
 * The way from a page about someone to the private conversation with them
 * (PS-COM-017): the one they have, or else the offer to start it where the
 * server allows it (PS-COM-006), with the request or question the page is
 * about. None while private chat is off, or with no way to write.
 */
export async function chatContactLink(
  userId: string,
  context?: ChatContext,
): Promise<ChatContactLink | null> {
  if (!chatEnabled()) {
    return null;
  }

  const contact = await pageQuery(readChatContact, {
    userId,
    ...(context && { context }),
  });

  if (contact?.conversationId) {
    return {
      href: chatConversationHref(contact.conversationId),
      existing: true,
    };
  }

  return contact?.canStart
    ? { href: chatWithHref(userId, context), existing: false }
    : null;
}
