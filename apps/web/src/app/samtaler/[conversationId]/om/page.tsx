import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ConversationAbout } from "@/chat/conversation-about";
import { loansBetween } from "../../loans-between";

export const metadata: Metadata = { title: "Om samtalen – Lånbort" };

/** «Om samtalen»: the loans, the security code and the personal choices. */
export default async function ConversationAboutPage({
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
      <ConversationAbout
        id={conversationId.toLowerCase()}
        loans={await loansBetween()}
      />
    </main>
  );
}
