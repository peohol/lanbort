import type { ReactNode } from "react";
import { chatEnabled } from "@/server/chat-enabled";
import { requirePageAccount } from "@/server/session";
import { ChatProvider } from "@/chat/chat-provider";

/**
 * The pages of private, end-to-end encrypted chat (ADR-0010): Samtaler and
 * Mine enheter. Where chat is off, the page says so plainly under its own
 * `title`, and nothing there pretends to be a chat.
 */
export async function ChatPages({
  title,
  children,
}: {
  title: ReactNode;
  children: ReactNode;
}) {
  const account = await requirePageAccount();

  if (!(await chatEnabled())) {
    return (
      <main>
        {title}
        <p className="quiet">
          Private samtaler er ikke tilgjengelige nå. Det du trenger for et lån,
          finner du under Lån.
        </p>
      </main>
    );
  }

  return <ChatProvider userId={account.userId}>{children}</ChatProvider>;
}
