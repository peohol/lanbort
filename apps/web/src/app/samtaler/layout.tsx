import type { ReactNode } from "react";
import { ChatProvider } from "@/chat/chat-provider";
import { chatEnabled } from "@/server/env";
import { requirePageAccount } from "@/server/session";

/**
 * Samtaler (UX-IA-001): private, end-to-end encrypted chat (ADR-0010). It
 * stays off until Port C; until then the area says so plainly and nothing
 * here pretends to be a chat.
 */
export default async function ConversationsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const account = await requirePageAccount();

  if (!chatEnabled()) {
    return (
      <main>
        <h1>Samtaler</h1>
        <p className="quiet">
          Private samtaler er ikke tilgjengelige ennå. Det du trenger for et
          lån, finner du under Lån.
        </p>
      </main>
    );
  }

  return <ChatProvider userId={account.userId}>{children}</ChatProvider>;
}
