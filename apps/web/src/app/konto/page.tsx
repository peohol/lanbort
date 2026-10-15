import type { OwnProfilePicture } from "@lanbort/contracts";
import {
  getSocialOverview,
  readOwnChatDevices,
  takesNewActivity,
} from "@lanbort/domain";
import type { Metadata } from "next";
import Link from "next/link";
import { ChatIcon } from "@/chat/chat-icon";
import { readersText } from "@/chat/device-names";
import { Icon } from "@/components/icon";
import { MenuList, MenuRow } from "@/components/menu-list";
import { PageHeader } from "@/components/page-header";
import { ProfilePicture } from "@/components/profile-picture";
import { SignOutButton } from "@/components/sign-out-button";
import { Tag } from "@/components/tag";
import { chatDevicesHref, chatSignOutHref } from "@/navigation/chat";
import {
  accountStateHref,
  appearanceHref,
  privacyHref,
  blockedHref,
  casesHref,
  friendsHref,
  notificationChoicesHref,
  personHref,
  profilePictureHref,
} from "@/navigation/routes";
import { accountStatusLabel } from "@/presentation/account";
import { themeLabels } from "@/presentation/theme";
import { chatEnabled } from "@/server/chat-enabled";
import {
  pageQuery,
  pageQueryIfAllowed,
  requirePageAccount,
} from "@/server/session";
import { readTheme } from "@/server/theme";

export const metadata: Metadata = { title: "Konto – Lånbort" };

const count = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/** Who sees the user's picture (PS-USR-002), or that there is none. */
const pictureReach = ({ pictureId, visibility }: OwnProfilePicture) =>
  pictureId
    ? {
        general: "Profilbildet ser alle som kan se deg",
        friends: "Profilbildet ser bare vennene dine",
        only_me: "Profilbildet ser bare du",
      }[visibility]
    : "Legg til et profilbilde";

/**
 * The account's devices with private chat, where it may use chat: Mine
 * enheter, and whether this sign-in is told what it loses before it signs
 * out (ADR-0010 §7).
 */
const ownChatDevices = async () =>
  (await chatEnabled())
    ? await pageQueryIfAllowed(readOwnChatDevices, {})
    : null;

/** «Logg ut», in Konto's menu. */
function SignOutRow({ chat, userId }: { chat: boolean; userId: string }) {
  const content = (
    <>
      <Icon name="signOut" />
      <span className="menu-text">
        <span className="menu-label">Logg ut</span>
      </span>
    </>
  );

  return (
    <li>
      {chat ? (
        // A full page load: the chat pages have their own security headers.
        <a href={chatSignOutHref} className="menu-row">
          {content}
        </a>
      ) : (
        <SignOutButton userId={userId} className="menu-row">
          {content}
        </SignOutButton>
      )}
    </li>
  );
}

/**
 * The account (UX-IA-003, UX-IA-020): opened from the user's picture as a
 * layer of its own, with the profile, the people the user has relations
 * with, and the rest of the account's own pages. An account that is not
 * active has no new relations, and no page of its own for others to see
 * (PS-ADM-002).
 */
export default async function AccountPage() {
  const account = await requirePageAccount();
  const active = takesNewActivity(account.status);
  const [social, devices, theme] = await Promise.all([
    active ? pageQuery(getSocialOverview, {}) : null,
    ownChatDevices(),
    readTheme(),
  ]);
  const waiting = social?.incomingRequests.length ?? 0;

  return (
    <main>
      <PageHeader title="Konto" />
      <section className="card profile-card" aria-label="Profil">
        <Link href={profilePictureHref} className="profile-card-row">
          <ProfilePicture
            pictureId={account.picture.pictureId}
            name={account.realName}
            size="medium"
            initials
          />
          <span className="menu-text">
            <span className="profile-name">{account.realName}</span>
            <span className="menu-detail">{pictureReach(account.picture)}</span>
          </span>
          <Icon name="chevron" className="icon menu-chevron" />
        </Link>
        {active && (
          <Link
            href={personHref(account.userId)}
            className="button button-quiet"
          >
            Se din egen side
          </Link>
        )}
      </section>

      {social && (
        <section aria-labelledby="folk">
          <h2 id="folk">Folk</h2>
          <MenuList label="folk">
            <MenuRow
              href={friendsHref}
              icon="people"
              label="Venner"
              detail={count(social.friends.length, "venn", "venner")}
              end={waiting > 0 && <Tag tone="attention">{waiting} venter</Tag>}
            />
            <MenuRow
              href={blockedHref}
              icon="block"
              label="Blokkerte"
              detail={count(social.blocked.length, "person", "personer")}
            />
          </MenuList>
        </section>
      )}

      <section aria-labelledby="annet">
        <h2 id="annet">Annet</h2>
        <MenuList label="annet">
          <MenuRow href={casesHref} icon="shield" label="Saker" />
          <MenuRow
            href={notificationChoicesHref}
            icon="bell"
            label="Varslingsvalg"
          />
          <MenuRow
            href={appearanceHref}
            icon="theme"
            label="Utseende"
            detail={themeLabels[theme]}
          />
          <MenuRow
            href={accountStateHref}
            icon="info"
            label="Kontoen din"
            detail={accountStatusLabel(account.status)}
          />
          {devices && (
            <MenuRow
              href={chatDevicesHref}
              icon={<ChatIcon name="anyDevice" />}
              label="Mine enheter"
              detail={readersText(devices)}
            />
          )}
          <MenuRow
            href={privacyHref}
            icon="lock"
            label="Personvern og sikkerhet"
          />
          <SignOutRow
            chat={(devices?.currentDeviceId ?? null) !== null}
            userId={account.userId}
          />
        </MenuList>
      </section>
    </main>
  );
}
