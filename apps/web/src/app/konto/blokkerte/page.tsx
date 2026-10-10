import { getSocialOverview, takesNewActivity } from "@lanbort/domain";
import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { UnblockAction } from "@/components/unblock-action";
import { minimumAccessText, restingNotice } from "@/presentation/account";
import { formatShortDate } from "@/presentation/dates";
import { personName } from "@/presentation/people";
import { pageQuery, requirePageAccount } from "@/server/session";
import { People } from "../people";

export const metadata: Metadata = { title: "Blokkerte – Lånbort" };

/**
 * The people the user has blocked, and lifting a block with what it means
 * (PS-USR-006–007, KF6 screen 20).
 */
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
          people={blocked}
          detail={({ since }) => `Blokkert ${formatShortDate(since)}`}
          actions={(person) => (
            <UnblockAction
              userId={person.userId}
              name={personName(person)}
              label="Opphev"
            />
          )}
        />
      )}
    </main>
  );
}
