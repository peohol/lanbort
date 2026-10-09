import { getSocialOverview } from "@lanbort/domain";
import type { Metadata } from "next";
import { z } from "zod";
import { ChatHome, type ChatInvitation } from "@/chat/chat-home";
import { pageQuery } from "@/server/session";
import { loansBetween } from "./loans-between";

export const metadata: Metadata = { title: "Samtaler – Lånbort" };

/**
 * `?med=<person>&foresporsel=<request>` (or `&sporsmal=<question>`) opens
 * the page to start a conversation from a structured contact the caller
 * received (PS-COM-006). The server decides whether it is allowed.
 */
const invitationSchema = z
  .object({
    med: z.uuid(),
    foresporsel: z.uuid().optional(),
    sporsmal: z.uuid().optional(),
  })
  .transform(({ med, foresporsel, sporsmal }): ChatInvitation => ({
    userId: med,
    realName: null,
    ...(foresporsel
      ? { context: { kind: "loan_request", requestId: foresporsel } }
      : sporsmal
        ? { context: { kind: "object_question", questionId: sporsmal } }
        : {}),
  }));

export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [social, loans] = await Promise.all([
    pageQuery(getSocialOverview, {}),
    loansBetween(),
  ]);
  const invitation = invitationSchema.safeParse(await searchParams);
  const friends = (social?.friends ?? []).map(
    ({ userId, realName, pictureId }) => ({ userId, realName, pictureId }),
  );

  return (
    <main>
      <h1>Samtaler</h1>
      <ChatHome
        friends={friends}
        loans={loans}
        {...(invitation.success ? { invitation: invitation.data } : {})}
      />
    </main>
  );
}
