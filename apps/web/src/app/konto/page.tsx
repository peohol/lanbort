import type {
  AccountBinding,
  NotificationPreferences,
  SocialContact,
} from "@lanbort/contracts";
import {
  getAccountDeletionCheck,
  getSocialOverview,
  readNotificationPreferences,
  takesNewActivity,
} from "@lanbort/domain";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { AccountDeletion } from "@/components/account-deletion";
import { ActionButton } from "@/components/action-button";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { PersonName } from "@/components/person-name";
import { PreferenceSwitch } from "@/components/preference-switch";
import { ProfilePicture } from "@/components/profile-picture";
import { SignOutButton } from "@/components/sign-out-button";
import { casesHref } from "@/navigation/routes";
import { hrefFor } from "@/navigation/targets";
import {
  minimumAccessText,
  ownAccountChoices,
  restingNotice,
} from "@/presentation/account";
import { notificationLevelLabels } from "@/presentation/notifications";
import { chatEnabled } from "@/server/env";
import { pageQuery, requirePageAccount } from "@/server/session";
import { ProfilePictureSettings } from "./profile-picture-settings";

export const metadata: Metadata = { title: "Konto – Lånbort" };

const channelLabels = { in_app: "I appen", email: "På e-post" } as const;

/** New messages in private chat are chosen on their own (PS-COM-018). */
const chatMessageChoices = {
  in_app: { label: "Nye meldinger i appen", help: "I bjellen, uten innhold" },
  email: { label: "Nye meldinger på e-post", help: "Uten navn og innhold" },
} as const;

function ChatMessageChoices({
  preferences,
}: {
  preferences: NotificationPreferences;
}) {
  const channels =
    preferences.kinds.find(({ kind }) => kind === "chat.new_messages")
      ?.channels ?? [];

  return (
    <fieldset>
      <legend>Privat chat</legend>
      {channels.map(({ channel, enabled }) => (
        <PreferenceSwitch
          key={channel}
          subject={{ kind: "chat.new_messages" }}
          channel={channel}
          {...chatMessageChoices[channel]}
          enabled={enabled}
        />
      ))}
      <p className="help">
        Sikkerhet for privat chat er påkrevd: varsler om ny enhet og
        tilbakestilling kan ikke slås av.
      </p>
      <p className="help">
        Å slå av varsler endrer ingenting i samtalene. Meldingene kommer
        fortsatt, og ny melding markeres i Samtaler. Én samtale kan også dempes
        fra «Om samtalen».
      </p>
    </fieldset>
  );
}

function People({
  heading,
  id,
  people,
  actions,
}: {
  heading: string;
  id?: string;
  people: readonly SocialContact[];
  actions: (person: SocialContact) => ReactNode;
}) {
  if (people.length === 0) return null;

  return (
    <>
      <h3 id={id}>{heading}</h3>
      <ul className="entries">
        {people.map((person) => (
          <li key={person.userId} className="entry">
            <strong id={`person-${person.userId}`}>
              <PersonName person={person} />
            </strong>
            {/* The buttons are named with the person they are about. */}
            <div
              className="actions"
              role="group"
              aria-labelledby={`person-${person.userId}`}
            >
              {actions(person)}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

/** What must be finished before the account can be deleted (PS-ADM-004). */
const bindingLabels: Record<AccountBinding["kind"], string> = {
  loan: "Et lån som ikke er avsluttet ennå",
  environment_ownership:
    "Du eier et miljø. Gi eierskapet til en annen eller avvikle miljøet først.",
  case: "En åpen mekling der du er part",
};

function Binding({ binding }: { binding: AccountBinding }) {
  const href =
    binding.kind === "loan" || binding.kind === "case"
      ? hrefFor({ type: binding.kind, id: binding.resourceId })
      : null;

  return (
    <li className="entry">
      {href ? (
        <Link href={href}>{bindingLabels[binding.kind]}</Link>
      ) : (
        bindingLabels[binding.kind]
      )}
    </li>
  );
}

/**
 * Deleting the account (PS-ADM-004–006): first what still binds it, then
 * what goes, what stays and who is affected (UX-INT-007), and only then
 * the action.
 */
function Deletion({ bindings }: { bindings: readonly AccountBinding[] }) {
  return (
    <>
      <h3>Slett kontoen</h3>
      {bindings.length > 0 ? (
        <>
          <p>Før kontoen kan slettes, må dette avsluttes:</p>
          <ul className="entries">
            {bindings.map((binding) => (
              <Binding key={binding.resourceId} binding={binding} />
            ))}
          </ul>
        </>
      ) : (
        <>
          <p>
            <strong>Dette forsvinner:</strong> profilen og navnet ditt,
            e-postadressen, varslene og varslingsvalgene dine, vennskap og
            venneforespørsler, medlemskapene dine, abonnementer på ting, ting du
            eier alene, og anmeldelser du ennå ikke har skrevet.
          </p>
          <p>
            <strong>Dette består, uten navnet ditt:</strong> lån og forespørsler
            du har vært med i, anmeldelser du har gitt, og spørsmål og svar du
            har skrevet. Blokkeringer består.
          </p>
          <p>
            <strong>Dette påvirker andre:</strong> medeiere beholder ting dere
            eier sammen, og den du har lånt med, kan fortsatt anmelde lånet til
            fristen.
          </p>
          <p className="help">Sletting kan ikke angres.</p>
          <AccountDeletion />
        </>
      )}
    </>
  );
}

/**
 * The account context (UX-IA-003): profile, relations and blocks,
 * notification choices, the account's own state and signing out, opened
 * from the user's avatar and never a permanent place in the main
 * navigation. An account that is not active sees what it may still do
 * (PS-ADM-002): no new relations, and the way back or out.
 */
export default async function AccountPage() {
  const account = await requirePageAccount();
  const active = takesNewActivity(account.status);
  const choices = ownAccountChoices(account.status);
  const [social, preferences, deletion] = await Promise.all([
    active ? pageQuery(getSocialOverview, {}) : null,
    pageQuery(readNotificationPreferences, {}),
    choices.delete ? pageQuery(getAccountDeletionCheck, {}) : null,
  ]);
  const notice = restingNotice(account.status);
  const target = (person: SocialContact) => ({ userId: person.userId });

  return (
    <main>
      <PageHeader title="Konto" home="home" />
      <section aria-labelledby="profil">
        <h2 id="profil">Profil</h2>
        <p>{account.realName}</p>
        {active ? (
          <ProfilePictureSettings
            realName={account.realName ?? ""}
            picture={account.picture}
          />
        ) : (
          <ProfilePicture
            pictureId={account.picture.pictureId}
            name={account.realName}
            size="large"
          />
        )}
      </section>

      <section aria-labelledby="saker">
        <h2 id="saker">Saker</h2>
        <p className="link-row">
          <Link href={casesHref}>Dine saker</Link>
        </p>
      </section>

      {active && (
        <>
          <section aria-labelledby="venner">
            <h2 id="venner">Venner</h2>
            <People
              heading="Vil bli venn med deg"
              people={social?.incomingRequests ?? []}
              actions={(person) => (
                <>
                  <ActionButton
                    label="Godta"
                    path="/api/social/friend-requests/accept"
                    body={target(person)}
                  />
                  <ActionButton
                    label="Avslå"
                    path="/api/social/friend-requests/decline"
                    body={target(person)}
                  />
                </>
              )}
            />
            <People
              heading="Du har spurt"
              people={social?.outgoingRequests ?? []}
              actions={(person) => (
                <ActionButton
                  label="Trekk tilbake"
                  path="/api/social/friend-requests/withdraw"
                  body={target(person)}
                />
              )}
            />
            <People
              heading="Dine venner"
              people={social?.friends ?? []}
              actions={() => null}
            />
            {social &&
              social.friends.length +
                social.incomingRequests.length +
                social.outgoingRequests.length ===
                0 && (
                <EmptyState>
                  Du har ingen venner her ennå. Du kan sende en venneforespørsel
                  fra siden til en person du kjenner, for eksempel fra et miljø
                  dere er med i.
                </EmptyState>
              )}
          </section>

          <section aria-labelledby="blokkerte">
            <h2 id="blokkerte">Blokkerte</h2>
            {(social?.blocked ?? []).length === 0 ? (
              <p className="quiet">Du har ikke blokkert noen.</p>
            ) : (
              <People
                heading="Du har blokkert"
                people={social?.blocked ?? []}
                actions={(person) => (
                  <ActionButton
                    label="Opphev blokkering"
                    path="/api/social/blocks/lift"
                    body={target(person)}
                  />
                )}
              />
            )}
          </section>
        </>
      )}

      <section aria-labelledby="varslingsvalg">
        <h2 id="varslingsvalg">Varslingsvalg</h2>
        <p className="help">
          Påkrevde varsler og varsler som krever handling vises alltid i appen.
        </p>
        {preferences?.levels.map(({ level, channels }) => (
          <fieldset key={level}>
            <legend>{notificationLevelLabels[level]}</legend>
            {channels.map(({ channel, enabled, configurable }) =>
              configurable ? (
                <PreferenceSwitch
                  key={channel}
                  subject={{ level }}
                  channel={channel}
                  label={channelLabels[channel]}
                  enabled={enabled}
                />
              ) : (
                <p key={channel} className="help">
                  {channelLabels[channel]}: alltid på
                </p>
              ),
            )}
          </fieldset>
        ))}
        {chatEnabled() && preferences && (
          <ChatMessageChoices preferences={preferences} />
        )}
      </section>

      <section aria-labelledby="kontoen">
        <h2 id="kontoen">Kontoen din</h2>
        {notice ? (
          <p>
            {notice} {minimumAccessText}
          </p>
        ) : (
          <p>Kontoen din er aktiv.</p>
        )}
        {choices.reactivate && (
          <ActionButton
            label="Ta kontoen i bruk igjen"
            path="/api/account/reactivation"
            body={{}}
          />
        )}
        {choices.deactivate && (
          <>
            <h3>Deaktiver kontoen</h3>
            <p>
              Forespørslene du har sendt avsluttes, ingen kan invitere deg til
              noe nytt, og ting bare du eier, vises ikke for andre.{" "}
              {minimumAccessText} Du kan ta kontoen i bruk igjen når du vil.
            </p>
            <ActionButton
              label="Deaktiver kontoen"
              path="/api/account/deactivation"
              body={{}}
            />
          </>
        )}
        {deletion && <Deletion bindings={deletion.bindings} />}
      </section>

      <section aria-labelledby="logg-ut">
        <h2 id="logg-ut">Logg ut</h2>
        <SignOutButton />
      </section>
    </main>
  );
}
