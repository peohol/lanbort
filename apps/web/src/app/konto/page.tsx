import type { SocialContact } from "@lanbort/contracts";
import {
  getSocialOverview,
  readNotificationPreferences,
} from "@lanbort/domain";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ActionButton } from "@/components/action-button";
import { PreferenceSwitch } from "@/components/preference-switch";
import { SignOutButton } from "@/components/sign-out-button";
import { notificationLevelLabels } from "@/presentation/notifications";
import { pageQuery, requirePageAccount } from "@/server/session";

export const metadata: Metadata = { title: "Konto – Lånbort" };

const channelLabels = { in_app: "I appen", email: "På e-post" } as const;

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
            <strong>{person.realName ?? "Ukjent navn"}</strong>
            <div className="actions">{actions(person)}</div>
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * The account context (UX-IA-003): profile, relations and blocks,
 * notification choices and signing out, opened from the user's avatar and
 * never a permanent place in the main navigation.
 */
export default async function AccountPage() {
  const account = await requirePageAccount();
  const [social, preferences] = await Promise.all([
    pageQuery(getSocialOverview, {}),
    pageQuery(readNotificationPreferences, {}),
  ]);
  const target = (person: SocialContact) => ({ userId: person.userId });

  return (
    <main>
      <h1>Konto</h1>
      <section aria-labelledby="profil">
        <h2 id="profil">Profil</h2>
        <p>{account.realName}</p>
      </section>

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
            0 && <p className="quiet">Du har ingen venner her ennå.</p>}
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

      <section aria-labelledby="varslingsvalg">
        <h2 id="varslingsvalg">Varslingsvalg</h2>
        <p className="help">
          Viktige varsler og varsler som krever handling vises alltid i appen.
        </p>
        {preferences?.levels.map(({ level, channels }) => (
          <fieldset key={level}>
            <legend>{notificationLevelLabels[level]}</legend>
            {channels.map(({ channel, enabled, configurable }) =>
              configurable ? (
                <PreferenceSwitch
                  key={channel}
                  level={level}
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
      </section>

      <section aria-labelledby="logg-ut">
        <h2 id="logg-ut">Logg ut</h2>
        <SignOutButton />
      </section>
    </main>
  );
}
