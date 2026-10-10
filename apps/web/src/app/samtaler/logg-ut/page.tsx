import type { Metadata } from "next";
import { ChatSignOut } from "@/chat/sign-out";

export const metadata: Metadata = { title: "Logg ut – Lånbort" };

export default function ChatSignOutPage() {
  return (
    <main>
      <ChatSignOut />
    </main>
  );
}
