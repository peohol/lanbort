import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ConversationView } from "@/chat/conversation-view";

export const metadata: Metadata = { title: "Samtale – Lånbort" };

/** One private conversation, read and written on this device (ADR-0010). */
export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;

  if (!z.uuid().safeParse(conversationId).success) {
    notFound();
  }

  return (
    <main>
      <ConversationView id={conversationId.toLowerCase()} />
    </main>
  );
}
