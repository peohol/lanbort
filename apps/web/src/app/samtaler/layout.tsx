import type { ReactNode } from "react";
import { ChatPages } from "@/app/chat-pages";
import { AreaTitle } from "@/components/area-title";

/** Samtaler (UX-IA-001): private, end-to-end encrypted chat (ADR-0010). */
export default function ConversationsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <ChatPages title={<AreaTitle area="conversations" />}>{children}</ChatPages>
  );
}
