import { listCoOwnerInvitations, listOwnObjects } from "@lanbort/domain";
import type { Metadata } from "next";
import { ActionButton } from "@/components/action-button";
import { anchorFor } from "@/navigation/targets";
import { pageQuery, requirePageAccount } from "@/server/session";

export const metadata: Metadata = { title: "Mine ting – Lånbort" };

/** Mine ting (UX-IA-001): the objects the user owns or co-owns. */
export default async function ThingsPage() {
  await requirePageAccount();
  const [owned, invited] = await Promise.all([
    pageQuery(listOwnObjects, {}),
    pageQuery(listCoOwnerInvitations, {}),
  ]);
  const objects = owned?.objects ?? [];
  const invitations = invited?.invitations ?? [];

  return (
    <main>
      <h1>Mine ting</h1>
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
                <strong>{invitation.object.title}</strong>
                <span className="entry-detail">
                  Du er invitert til å bli medeier
                </span>
                <div className="actions">
                  <ActionButton
                    label="Bli medeier"
                    path="/api/object-invitations/accept"
                    body={{ invitationId: invitation.id }}
                  />
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
          <p className="quiet">Du har ingen ting registrert ennå.</p>
        ) : (
          <ul className="entries">
            {objects.map((object) => (
              <li key={object.id} className="entry">
                <strong>{object.title}</strong>
                <span className="entry-detail">
                  {object.status === "archived"
                    ? "Arkivert"
                    : object.availableForNewLoans
                      ? "Kan lånes ut nå"
                      : "Kan ikke lånes ut nå"}
                  {object.owners.length > 1 &&
                    ` · ${object.owners.length} eiere`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
