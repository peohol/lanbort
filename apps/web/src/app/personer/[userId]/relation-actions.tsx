import type { Person } from "@lanbort/contracts";
import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { ConfirmAction } from "@/components/confirm-action";
import { MoreActions } from "@/components/more-actions";
import { accountHref } from "@/navigation/areas";

/** Where the account lists friends, requests and blocks. */
export const friendsHref = `${accountHref}#venner`;
const blockedHref = `${accountHref}#blokkerte`;

const social = (path: string) => `/api/social/${path}`;

/**
 * Blocking, with what it ends, what stays and what the other learns
 * (PS-USR-006–007, UX-INT-007). The person stays visible to the one who
 * blocks them, so the page is read again.
 */
function Block({ person }: { person: Person }) {
  const name = person.realName;

  return (
    <ConfirmAction
      label="Blokker"
      title={`Blokkere ${name}?`}
      consequences={{
        gone: [
          "Vennskap og venneforespørsler mellom dere avsluttes.",
          "Dere kan ikke sende hverandre nye venneforespørsler, meldinger eller låneforespørsler, og dere finner ikke hverandre i Lånbort.",
        ],
        stays: [
          "Lån og saker dere allerede har sammen, og anmeldelser dere har rett til å skrive.",
        ],
        affects: [`${name} får ikke beskjed om hvem som blokkerte.`],
      }}
      confirmLabel={`Blokker ${name}`}
      path={social("blocks")}
      body={{ userId: person.userId }}
      danger
    />
  );
}

/**
 * What the reader can do about the relation (PS-USR-003–006), the next
 * step first and the rarer ones under «Flere valg» (UX-INT-009). A step
 * that can end the reader's access to this page leads to the account's
 * list of friends, where its result shows (UX-PRIV-007).
 */
export function RelationActions({ person }: { person: Person }) {
  const { relation, realName: name } = person;
  const body = { userId: person.userId };

  if (!relation) {
    return (
      <p className="link-row">
        <Link href={accountHref}>Venner, blokkeringer og innstillinger</Link>
      </p>
    );
  }

  if (relation.blockedByMe) {
    return (
      <div className="actions">
        <ConfirmAction
          label="Opphev blokkering"
          title={`Oppheve blokkeringen av ${name}?`}
          consequences={{
            gone: ["Blokkeringen. Dere kan få kontakt igjen."],
            stays: [
              "Vennskap og forespørsler som blokkeringen avsluttet, kommer ikke tilbake.",
            ],
            affects: [`${name} får ikke beskjed.`],
          }}
          confirmLabel={`Opphev blokkeringen av ${name}`}
          path={social("blocks/lift")}
          body={body}
          next={blockedHref}
        />
      </div>
    );
  }

  const steps = {
    none: (
      <ActionButton
        label="Send venneforespørsel"
        path={social("friend-requests")}
        body={body}
        primary
      />
    ),
    incoming_pending: (
      <>
        <ActionButton
          label="Godta venneforespørselen"
          path={social("friend-requests/accept")}
          body={body}
          primary
        />
        <ActionButton
          label="Avslå"
          path={social("friend-requests/decline")}
          body={body}
          next={friendsHref}
        />
      </>
    ),
    outgoing_pending: (
      <ActionButton
        label="Trekk venneforespørselen"
        path={social("friend-requests/withdraw")}
        body={body}
        next={friendsHref}
      />
    ),
    friends: null,
  }[relation.friendship];

  return (
    <>
      {steps && <div className="actions">{steps}</div>}
      <MoreActions>
        {relation.friendship === "friends" && (
          <ConfirmAction
            label="Fjern som venn"
            title={`Fjerne ${name} som venn?`}
            consequences={{
              gone: [
                "Vennskapet, og det dere bare ser fordi dere er venner.",
                "Forespørsler om vennelån mellom dere som ikke er godkjent ennå.",
              ],
              stays: ["Lån dere allerede har avtalt."],
            }}
            confirmLabel={`Fjern ${name} som venn`}
            path={social("friends/remove")}
            body={body}
            next={friendsHref}
          />
        )}
        <Block person={person} />
      </MoreActions>
    </>
  );
}
