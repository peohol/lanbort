import { getSocialOverview, takesNewActivity } from "@lanbort/domain";
import type { Metadata } from "next";
import { ActionButton } from "@/components/action-button";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { minimumAccessText, restingNotice } from "@/presentation/account";
import { formatShortDate } from "@/presentation/dates";
import { pageQuery, requirePageAccount } from "@/server/session";
import { People, target } from "../people";

export const metadata: Metadata = { title: "Venner – Lånbort" };

const social = (path: string) => `/api/social/${path}`;

const sent = ({ since }: { since: string }) =>
  `Sendt ${formatShortDate(since)}`;

/**
 * Friends and friend requests both ways (PS-USR-003–005, KF6 screen 19),
 * answered right in the list. An account that is not active has no new
 * relations (PS-ADM-002).
 */
export default async function FriendsPage() {
  const account = await requirePageAccount();
  const active = takesNewActivity(account.status);
  const overview = active ? await pageQuery(getSocialOverview, {}) : null;
  const total = overview
    ? overview.friends.length +
      overview.incomingRequests.length +
      overview.outgoingRequests.length
    : 0;

  return (
    <main>
      <PageHeader title="Venner" />
      {!active && (
        <p>
          {restingNotice(account.status)} {minimumAccessText}
        </p>
      )}
      {overview && (
        <>
          <People
            heading="Vil bli venn med deg"
            people={overview.incomingRequests}
            detail={sent}
            actionsBelow
            actions={(person) => (
              <>
                <ActionButton
                  label="Godta"
                  path={social("friend-requests/accept")}
                  body={target(person)}
                  primary
                />
                <ActionButton
                  label="Avslå"
                  path={social("friend-requests/decline")}
                  body={target(person)}
                />
              </>
            )}
          />
          <People
            heading="Du har spurt"
            people={overview.outgoingRequests}
            detail={sent}
            actions={(person) => (
              <ActionButton
                label="Trekk"
                path={social("friend-requests/withdraw")}
                body={target(person)}
              />
            )}
          />
          <People heading="Dine venner" people={overview.friends} />
          {total === 0 && (
            <EmptyState>
              Du har ingen venner her ennå. Du kan sende en venneforespørsel fra
              siden til en person du kjenner, for eksempel fra et miljø dere er
              med i.
            </EmptyState>
          )}
        </>
      )}
    </main>
  );
}
