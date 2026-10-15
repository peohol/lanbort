import { takesNewActivity } from "@lanbort/domain";
import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { minimumAccessText, restingNotice } from "@/presentation/account";
import { requirePageAccount } from "@/server/session";
import { OwnFriendCode } from "./own-friend-code";

export const metadata: Metadata = { title: "Min QR-kode – Lånbort" };

/** PS-USR-014: a code to show someone nearby who wants to be friends. */
export default async function OwnFriendCodePage() {
  const account = await requirePageAccount();
  const active = takesNewActivity(account.status);

  return (
    <main>
      <PageHeader title="Min QR-kode">
        {active &&
          "La en du kjenner skanne koden. Da kan de sende deg en venneforespørsel."}
      </PageHeader>
      {active ? (
        <OwnFriendCode />
      ) : (
        <p>
          {restingNotice(account.status)} {minimumAccessText}
        </p>
      )}
    </main>
  );
}
