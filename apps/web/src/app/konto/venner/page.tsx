import type { FriendInvitation } from "@lanbort/contracts";
import {
  getSocialOverview,
  listFriendInvitations,
  takesNewActivity,
} from "@lanbort/domain";
import type { Metadata } from "next";
import { ActionButton } from "@/components/action-button";
import { EmptyState } from "@/components/empty-state";
import { MenuList, MenuRow } from "@/components/menu-list";
import { PageHeader } from "@/components/page-header";
import {
  friendCodeHref,
  friendInviteHref,
  friendScanHref,
} from "@/navigation/routes";
import { minimumAccessText, restingNotice } from "@/presentation/account";
import { formatShortDate } from "@/presentation/dates";
import {
  invitationDetail,
  inviteTitle,
} from "@/presentation/friend-invitations";
import { accountInviters } from "@/server/env";
import { pageQuery, requirePageAccount } from "@/server/session";
import { People, target } from "../people";

export const metadata: Metadata = { title: "Venner – Lånbort" };

const social = (path: string) => `/api/social/${path}`;

const sent = ({ since }: { since: string }) =>
  `Sendt ${formatShortDate(since)}`;

/** The ways to new friends (PS-USR-013–015). */
function AddFriends({ mayInvite }: { mayInvite: boolean }) {
  return (
    <section aria-labelledby="legg-til">
      <h2 id="legg-til">Legg til venner</h2>
      <MenuList label="legg-til">
        <MenuRow
          href={friendInviteHref}
          icon="mail"
          label={inviteTitle(mayInvite)}
          detail={
            mayInvite
              ? "På e-post, også til dem som ikke er i Lånbort"
              : "Til en du kjenner e-postadressen til"
          }
        />
        <MenuRow
          href={friendCodeHref}
          icon="qr"
          label="Min QR-kode"
          detail="Vis koden til en som står ved siden av deg"
        />
        <MenuRow
          href={friendScanHref}
          icon="scan"
          label="Skann QR-kode"
          detail="Finn en annen ved koden deres"
        />
      </MenuList>
    </section>
  );
}

/**
 * Open invitations by e-mail address, until they expire, are withdrawn or
 * become a friendship. Nothing says whether the address has an account or
 * what the recipient answered (PS-USR-013).
 */
function SentByEmail({
  invitations,
}: {
  invitations: readonly FriendInvitation[];
}) {
  if (invitations.length === 0) return null;

  return (
    <section aria-labelledby="sendt-epost">
      <h2 id="sendt-epost">Sendt på e-post · {invitations.length}</h2>
      <MenuList label="sendt-epost">
        {invitations.map((invitation) => (
          <MenuRow
            key={invitation.id}
            icon="mail"
            label={invitation.email}
            detail={invitationDetail(invitation)}
            actions={
              <ActionButton
                label="Trekk"
                path={social("invitations/withdraw")}
                body={{ invitationId: invitation.id }}
              />
            }
          />
        ))}
      </MenuList>
    </section>
  );
}

/**
 * Friends and friend requests both ways (PS-USR-003–005, KF6 screen 19),
 * answered right in the list, and the ways to new friends (PS-USR-013–015).
 * An account that is not active has no new relations (PS-ADM-002).
 */
export default async function FriendsPage() {
  const account = await requirePageAccount();
  const active = takesNewActivity(account.status);
  const [overview, byEmail] = active
    ? await Promise.all([
        pageQuery(getSocialOverview, {}),
        pageQuery(listFriendInvitations, {}),
      ])
    : [null, null];
  const total = overview
    ? overview.friends.length +
      overview.incomingRequests.length +
      overview.outgoingRequests.length +
      (byEmail?.invitations.length ?? 0)
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
          <AddFriends mayInvite={accountInviters().has(account.userId)} />
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
          <SentByEmail invitations={byEmail?.invitations ?? []} />
          <People heading="Dine venner" people={overview.friends} />
          {total === 0 && (
            <EmptyState>
              Du har ingen venner her ennå. Spør noen du kjenner, på e-post
              eller med QR-koden, eller fra siden deres, for eksempel i et miljø
              dere er med i.
            </EmptyState>
          )}
        </>
      )}
    </main>
  );
}
