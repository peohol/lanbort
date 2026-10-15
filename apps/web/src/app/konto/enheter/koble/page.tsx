import type { Metadata } from "next";
import { ApproveLink } from "@/chat/approve-link";

export const metadata: Metadata = { title: "Godkjenn en ny enhet – Lånbort" };

export default function ApproveLinkPage() {
  return (
    <main>
      <ApproveLink />
    </main>
  );
}
