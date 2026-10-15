import { takesNewActivity } from "@lanbort/domain";
import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { minimumAccessText, restingNotice } from "@/presentation/account";
import { requirePageAccount } from "@/server/session";
import { ScanFriendCode } from "./scan-friend-code";

export const metadata: Metadata = { title: "Skann QR-kode – Lånbort" };

/** PS-USR-014: find someone nearby by their friend code. */
export default async function ScanFriendCodePage() {
  const account = await requirePageAccount();
  const active = takesNewActivity(account.status);

  return (
    <main>
      <PageHeader title="Skann QR-kode">
        {active &&
          "Be den du vil bli venn med, åpne Min QR-kode under Konto › Venner."}
      </PageHeader>
      {active ? (
        <ScanFriendCode />
      ) : (
        <p>
          {restingNotice(account.status)} {minimumAccessText}
        </p>
      )}
    </main>
  );
}
