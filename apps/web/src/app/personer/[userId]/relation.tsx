import type { Person } from "@lanbort/contracts";
import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { ConfirmAction } from "@/components/confirm-action";
import { MoreActions } from "@/components/more-actions";
import { StatusCard } from "@/components/status-card";
import { accountHref } from "@/navigation/areas";
import { newCaseHref } from "@/navigation/cases";
import { describeRelation, sharedNames } from "@/presentation/people";
import styles from "./person.module.css";

/** Where the account lists friends, requests and blocks. */
export const friendsHref = `${accountHref}#venner`;

const social = (path: string) => `/api/social/${path}`;

/**
 * Where a step that ends the friendship or the request leads: the page
 * stays while a shared environment still gives access to it, and otherwise
 * the account's list of friends shows the result (UX-PRIV-007).
 */
const afterEnding = (person: Person) =>
  person.sharedEnvironments.length > 0 ? {} : { next: friendsHref };

/**
 * The card «Dere to» (UX-INT-001): where the reader stands with the person
 * and only the next step: send, accept or decline, withdraw, or lift the
 * block (PS-USR-003–006). Friends have no next step here.
 */
export function RelationCard({ person }: { person: Person }) {
  const { relation, realName: name } = person;
  const text = describeRelation(person);
  const body = { userId: person.userId };

  const steps =
    relation &&
    (relation.blockedByMe ? (
      <ConfirmAction
        label="Opphev blokkeringen"
        title={`Oppheve blokkeringen av ${name}?`}
        consequences={{
          gone: [
            "Blokkeringen. Dere kan få kontakt igjen og se hverandre der dere begge er med.",
          ],
          stays: [
            "Vennskap og forespørsler som blokkeringen avsluttet, kommer ikke tilbake.",
          ],
          affects: [`${name} får ikke beskjed.`],
        }}
        confirmLabel="Opphev blokkeringen"
        path={social("blocks/lift")}
        body={body}
      />
    ) : (
      {
        none: relation.canRequest && (
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
              {...afterEnding(person)}
            />
          </>
        ),
        // It binds no one, so it needs no confirmation (UX-INT-002).
        outgoing_pending: (
          <ActionButton
            label="Trekk venneforespørselen"
            path={social("friend-requests/withdraw")}
            body={body}
            {...afterEnding(person)}
          />
        ),
        friends: null,
      }[relation.friendship]
    ));

  return (
    <StatusCard
      heading="Dere to"
      status={text.status}
      tone={text.tone}
      actions={steps || undefined}
    >
      <p className={styles.detail}>{text.detail}</p>
    </StatusCard>
  );
}

/**
 * The rarer steps, in the same place on every person's page (UX-INT-009):
 * remove the friend, block, and report. Removing and blocking show what
 * ends, what stays and what the other learns first (UX-INT-007). Someone
 * the reader blocks has none of them, and neither does the reader's own
 * page.
 */
export function PersonMoreActions({ person }: { person: Person }) {
  const { relation, realName: name } = person;
  const shared = sharedNames(person);

  if (!relation || relation.blockedByMe) return null;

  const friends = relation.friendship === "friends";
  const pending = relation.friendship.endsWith("_pending");

  return (
    <MoreActions>
      {friends && (
        <ConfirmAction
          label={`Fjern ${name} som venn`}
          title={`Fjerne ${name} som venn?`}
          consequences={{
            gone: [
              "Vennskapet. Dere ser ikke lenger tingene den andre har gjort synlige for venner.",
              "Forespørsler om vennelån mellom dere som ikke er godkjent ennå.",
            ],
            stays: [
              "Lån dere allerede har avtalt, fortsetter som før.",
              ...(shared ? [`Dere er fortsatt begge med i ${shared}.`] : []),
            ],
            affects: [`Lånbort sender ikke ${name} noen beskjed.`],
          }}
          confirmLabel={`Fjern ${name} som venn`}
          path={social("friends/remove")}
          body={{ userId: person.userId }}
          {...afterEnding(person)}
        />
      )}
      <ConfirmAction
        label={`Blokker ${name}`}
        icon="block"
        title={`Blokkere ${name}?`}
        consequences={{
          gone: [
            "Dere kan ikke sende hverandre venneforespørsler, meldinger eller låneforespørsler.",
            `Dere ser ikke hverandre i ${shared ?? "miljøer"}, i Finn eller på tingene.`,
            ...(friends ? ["Vennskapet avsluttes."] : []),
            ...(pending ? ["Venneforespørselen mellom dere avsluttes."] : []),
          ],
          stays: [
            "Lån dere allerede har avtalt.",
            "Saker dere har sammen, og anmeldelser dere har rett til å skrive.",
          ],
          affects: [
            `${name} får ikke beskjed om hvem som blokkerte, men kan merke at kontakten er borte.`,
          ],
        }}
        confirmLabel={`Blokker ${name}`}
        path={social("blocks")}
        body={{ userId: person.userId }}
        danger
      />
      <Link
        className="button"
        href={newCaseHref({
          kind: "report",
          environmentId: person.sharedEnvironments[0]?.id ?? null,
          subject: { kind: "user", id: person.userId },
        })}
      >
        Rapporter {name}
      </Link>
    </MoreActions>
  );
}
