import type { Metadata } from "next";
import { requirePageAccount } from "@/server/session";

export const metadata: Metadata = { title: "Samtaler – Lånbort" };

/**
 * Samtaler (UX-IA-001): private conversations and loan logistics. Private
 * chat waits on its encryption model (OD-0005), so the area exists and
 * says so plainly; nothing here pretends to be a chat.
 */
export default async function ConversationsPage() {
  await requirePageAccount();

  return (
    <main>
      <h1>Samtaler</h1>
      <p className="quiet">
        Private samtaler er ikke tilgjengelige ennå. Det du trenger for et lån,
        finner du under Lån.
      </p>
    </main>
  );
}
