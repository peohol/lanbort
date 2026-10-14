import type { ReactNode } from "react";
import { ChatProvider } from "@/chat/chat-provider";
import { AreaTitle } from "@/components/area-title";
import { chatEnabled } from "@/server/chat-enabled";
import { requirePageAccount } from "@/server/session";

/**
 * Samtaler (UX-IA-001): private, end-to-end encrypted chat (ADR-0010). Where
 * it is off, the area says so plainly and nothing here pretends to be a
 * chat.
 */
export default async function ConversationsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const account = await requirePageAccount();

  if (!(await chatEnabled())) {
    return (
      <main>
        <AreaTitle area="conversations" />
        <p className="quiet">
          Private samtaler er ikke tilgjengelige nå. Det du trenger for et lån,
          finner du under Lån.
        </p>
      </main>
    );
  }

  return <ChatProvider userId={account.userId}>{children}</ChatProvider>;
}
