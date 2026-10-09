import { getSocialOverview, takesNewActivity } from "@lanbort/domain";
import type { Metadata } from "next";
import { ActionButton } from "@/components/action-button";
import { PageHeader } from "@/components/page-header";
import { minimumAccessText, restingNotice } from "@/presentation/account";
import { pageQuery, requirePageAccount } from "@/server/session";
import { People, target } from "../people";

export const metadata: Metadata = { title: "Blokkerte – Lånbort" };

/** The people the user has blocked, and lifting a block (PS-USR-006–007). */
export default async function BlockedPage() {
  const account = await requirePageAccount();
  const active = takesNewActivity(account.status);
  const overview = active ? await pageQuery(getSocialOverview, {}) : null;
  const blocked = overview?.blocked ?? [];

  return (
    <main>
      <PageHeader title="Blokkerte">
        Den du blokkerer, finner deg ikke og kan ikke kontakte deg. Lån og saker
        dere har sammen, består.
      </PageHeader>
      {!active ? (
        <p>
          {restingNotice(account.status)} {minimumAccessText}
        </p>
      ) : blocked.length === 0 ? (
        <p className="quiet">Du har ikke blokkert noen.</p>
      ) : (
        <People
          heading="Du har blokkert"
          people={blocked}
          actions={(person) => (
            <ActionButton
              label="Opphev blokkering"
              path="/api/social/blocks/lift"
              body={target(person)}
            />
          )}
        />
      )}
    </main>
  );
}
