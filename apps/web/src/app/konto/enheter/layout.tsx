import type { ReactNode } from "react";
import { ChatPages } from "@/app/chat-pages";
import { ChatIcon } from "@/chat/chat-icon";
import { PageHeader } from "@/components/page-header";

/**
 * Mine enheter, in the account (UX-IA-020): the devices that can read the
 * private conversations. Its pages are chat pages, with chat's own
 * security headers (ADR-0010 §13).
 */
export default function DevicesLayout({ children }: { children: ReactNode }) {
  return (
    <ChatPages
      title={
        <PageHeader title="Mine enheter" icon={<ChatIcon name="anyDevice" />} />
      }
    >
      {children}
    </ChatPages>
  );
}
