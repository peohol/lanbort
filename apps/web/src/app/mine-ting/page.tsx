import type { OwnObject } from "@lanbort/contracts";
import {
  calendarDate,
  listCoOwnerInvitations,
  listObjectPublications,
  listOwnObjects,
  takesNewActivity,
} from "@lanbort/domain";
import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { PageHeader } from "@/components/page-header";
import { PilotObjectPolicy } from "@/components/pilot-object-policy";
import { Tag } from "@/components/tag";
import { ThingCard, ThingCards } from "@/components/thing-card";
import { newObjectHref, objectHref } from "@/navigation/routes";
import { anchorFor } from "@/navigation/targets";
import { firstImageHref, ownImageHref } from "@/presentation/object-images";
import { whereShown } from "@/presentation/object-owners";
import { ownThingStatus } from "@/presentation/objects";
import { pageQuery, requirePageAccount } from "@/server/session";
import { whereShownLines } from "../ting/where-shown";
import styles from "./mine-ting.module.css";

export const metadata: Metadata = { title: "Mine ting – Lånbort" };

/**
 * Mine ting (UX-IA-001, Tomat kjerneflyt 2): the things the user owns or
 * co-owns, each with where it is shown and a short status, invitations to
 * co-own, the way to register another as the area's one primary step, the
 * archived ones apart, and the pilot's limit (PS-OBJ-019).
 */
export default async function ThingsPage() {
  const account = await requirePageAccount();
  const active = takesNewActivity(account.status);
  const [owned, invited] = await Promise.all([
    pageQuery(listOwnObjects, {}),
    pageQuery(listCoOwnerInvitations, {}),
  ]);
  const objects = owned?.objects ?? [];
  const invitations = invited?.invitations ?? [];
  // Where each thing is shown is read through its own policy, which only an
  // active account passes; others see the things without it.
  const shown = new Map(
    active
      ? await Promise.all(
          objects.map(
            async ({ id }) =>
              [
                id,
                await pageQuery(listObjectPublications, { objectId: id }),
              ] as const,
          ),
        )
      : [],
  );
  const today = calendarDate(new Date());
  const current = objects.filter(({ status }) => status !== "archived");
  const archived = objects.filter(({ status }) => status === "archived");
  // Registering is new activity (PS-ADM-002).
  const register = active && (
    <Link
      className={`button button-primary ${styles.register}`}
      href={newObjectHref()}
    >
      <Icon name="plus" /> Registrer en ting
    </Link>
  );

  const card = (object: OwnObject) => {
    const status = ownThingStatus(object, today);
    const publications = shown.get(object.id);
    const shared = object.owners.length > 1;

    return (
      <ThingCard
        key={object.id}
        href={objectHref(object.id)}
        title={object.title}
        image={firstImageHref(object.images, (imageId) =>
          ownImageHref(object.id, imageId),
        )}
        details={[
          ...(publications
            ? whereShownLines(whereShown(publications), shared)
            : []),
          shared && `Dere er ${object.owners.length} eiere`,
        ]}
        status={<Tag tone={status.tone}>{status.label}</Tag>}
      />
    );
  };

  return (
    <main>
      <PageHeader title="Mine ting" />
      {register}
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
                  {active && (
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
        <h2 id="ting">
          Dine ting <span className="count">({current.length})</span>
        </h2>
        {current.length === 0 ? (
          <EmptyState>
            {archived.length === 0
              ? "Du har ingen ting ennå. Registrer noe du kan låne bort. Du bestemmer selv hvem som kan se det."
              : "Du har ingen ting ute nå. De arkiverte ligger under."}
          </EmptyState>
        ) : (
          <ThingCards>{current.map(card)}</ThingCards>
        )}
      </section>
      {archived.length > 0 && (
        <details className={styles.more}>
          <summary>Arkiverte ting ({archived.length})</summary>
          <ThingCards label="Arkiverte ting">{archived.map(card)}</ThingCards>
        </details>
      )}
      {/* PS-OBJ-019: the pilot's limit, where things are managed. */}
      <details className={styles.more}>
        <summary>Hva kan lånes ut gjennom Lånbort?</summary>
        <PilotObjectPolicy />
      </details>
    </main>
  );
}
