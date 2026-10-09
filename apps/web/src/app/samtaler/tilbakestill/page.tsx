import type { Metadata } from "next";
import { ChatReset } from "@/chat/chat-reset";

export const metadata: Metadata = {
  title: "Tilbakestill privat chat – Lånbort",
};

export default function ChatResetPage() {
  return (
    <main>
      <ChatReset />
    </main>
  );
}
