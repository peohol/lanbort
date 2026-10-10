import type { Metadata } from "next";
import { ChatRestore } from "@/chat/chat-restore";

export const metadata: Metadata = {
  title: "Hent tilbake privat chat – Lånbort",
};

export default function ChatRestorePage() {
  return (
    <main>
      <ChatRestore />
    </main>
  );
}
