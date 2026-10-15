import { takesNewActivity } from "@lanbort/domain";
import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { minimumAccessText, restingNotice } from "@/presentation/account";
import { inviteLead, inviteTitle } from "@/presentation/friend-invitations";
import { accountInviters } from "@/server/env";
import { requirePageAccount } from "@/server/session";
import { InviteForm } from "./invite-form";

export const metadata: Metadata = { title: "Inviter – Lånbort" };

/**
 * PS-USR-013, PS-USR-015: a friend request by e-mail address, and for those
 * who may invite people during the pilot, an invitation to Lånbort.
 */
export default async function InvitePage() {
  const account = await requirePageAccount();
  const mayInvite = accountInviters().has(account.userId);
  const active = takesNewActivity(account.status);

  return (
    <main>
      <PageHeader title={inviteTitle(mayInvite)}>
        {active && inviteLead(mayInvite)}
      </PageHeader>
      {active ? (
        <InviteForm mayInvite={mayInvite} />
      ) : (
        <p>
          {restingNotice(account.status)} {minimumAccessText}
        </p>
      )}
    </main>
  );
}
