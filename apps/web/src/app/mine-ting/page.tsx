import {
  calendarDate,
  collectPages,
  listCoOwnerInvitations,
  listLoans,
  listOwnObjects,
  takesNewActivity,
} from "@lanbort/domain";
import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { PilotObjectPolicy } from "@/components/pilot-object-policy";
import { Tag } from "@/components/tag";
import { newObjectHref, objectHref } from "@/navigation/routes";
import { anchorFor } from "@/navigation/targets";
import { lentOutStatuses, ownThingStatus } from "@/presentation/objects";
import { pageQuery, requirePageAccount } from "@/server/session";

export const metadata: Metadata = { title: "Mine ting – Lånbort" };

/**
 * Mine ting (UX-IA-001): the things the user owns or co-owns, each with a
 * short status, invitations to co-own, and the way to register another.
 */
export default async function ThingsPage() {
  const account = await requirePageAccount();
  const [owned, invited, lent] = await Promise.all([
    pageQuery(listOwnObjects, {}),
    pageQuery(listCoOwnerInvitations, {}),
    collectPages(
      (cursor) =>
        pageQuery(listLoans, { state: "current", role: "lender", cursor }),
      ({ loans }) => loans,
    ),
  ]);
  const objects = owned?.objects ?? [];
  const invitations = invited?.invitations ?? [];
  const lentOut = new Set(
    lent.items
      .filter((loan) => lentOutStatuses.includes(loan.status))
      .map((loan) => loan.objectId),
  );
  const today = calendarDate(new Date());
  // Registering is new activity (PS-ADM-002).
  const register = takesNewActivity(account.status) && (
    <Link className="button button-primary" href={newObjectHref()}>
      Registrer en ting
    </Link>
  );

  return (
    <main>
      <PageHeader title="Mine ting" />
      {register && <div className="actions">{register}</div>}
      {invitations.length > 0 && (
        <section aria-labelledby="invitasjoner">
          <h2 id="invitasjoner">Invitasjoner til medeierskap</h2>
          <ul className="entries">
            {invitations.map((invitation) => (
              <li
                key={invitation.id}
                id={anchorFor("object_invitation", invitation.id)}
                className="entry"
                tabIndex={-1}
              >
                <strong id={`tittel-${invitation.id}`}>
                  {invitation.object.title}
                </strong>
                <span className="entry-detail">
                  Du er invitert til å bli medeier
                </span>
                <div
                  className="actions"
                  role="group"
                  aria-labelledby={`tittel-${invitation.id}`}
                >
                  {/* Becoming an owner is new; declining is not (PS-ADM-002). */}
                  {takesNewActivity(account.status) && (
                    <ActionButton
                      label="Bli medeier"
                      path="/api/object-invitations/accept"
                      body={{ invitationId: invitation.id }}
                    />
                  )}
                  <ActionButton
                    label="Avslå"
                    path="/api/object-invitations/decline"
                    body={{ invitationId: invitation.id }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section aria-labelledby="ting">
        <h2 id="ting">Dine ting</h2>
        {objects.length === 0 ? (
          <EmptyState>
            Du har ingen ting registrert ennå. Registrer noe du kan låne ut, så
            kan du velge hvem som får se det.
          </EmptyState>
        ) : (
          <ul className="entries">
            {objects.map((object) => {
              const status = ownThingStatus(
                object,
                today,
                lentOut.has(object.id),
              );

              return (
                <li key={object.id} className="entry">
                  <strong>
                    <Link href={objectHref(object.id)}>{object.title}</Link>
                  </strong>
                  <span className="tags">
                    <Tag tone={status.tone}>{status.label}</Tag>
                    {object.owners.length > 1 && (
                      <span className="entry-detail">
                        Dere er {object.owners.length} eiere
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      {/* PS-OBJ-019: the pilot's limit, where things are managed. */}
      <section aria-labelledby="pilotgrense">
        <h2 id="pilotgrense">Hva kan lånes ut?</h2>
        <PilotObjectPolicy />
      </section>
    </main>
  );
}
