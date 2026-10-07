import Link from "next/link";
import type { ReactNode } from "react";
import { accountHref } from "@/navigation/areas";
import { minimumAccessText } from "@/presentation/account";
import { FocusKeeper } from "./focus-keeper";
import { MainNavigation } from "./main-navigation";
import { NotificationIndicator } from "./notification-indicator";
import { ProfilePicture } from "./profile-picture";
import { StickyBars } from "./sticky-bars";

/**
 * The frame around every page of a signed-in user (UX-IA-001–003): the
 * five areas, the notification indicator, the account behind the user's
 * own picture or initials, and, while the account is not active, why. It decides
 * nothing about access; it only shows the way. The navigation comes first
 * for the keyboard, after the skip link, while a phone shows it at the
 * bottom (globals.css).
 */
export function AppShell({
  realName,
  pictureId,
  unread,
  notice = null,
  children,
}: {
  realName: string;
  pictureId: string | null;
  unread: number;
  /** Why the account is not active, shown on every page (PS-ADM-002). */
  notice?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#innhold">
        Hopp til innholdet
      </a>
      <header className="app-header">
        <Link href="/" className="brand">
          Lånbort
        </Link>
        <div className="header-actions">
          <NotificationIndicator unread={unread} />
          <Link
            href={accountHref}
            className="avatar"
            aria-label={`Konto og innstillinger for ${realName}`}
          >
            <ProfilePicture
              pictureId={pictureId}
              name={realName}
              size="medium"
              initials
            />
          </Link>
        </div>
      </header>
      <MainNavigation />
      <FocusKeeper />
      <StickyBars />
      <div id="innhold" className="app-content" tabIndex={-1}>
        {notice && (
          <div className="account-notice" role="status">
            <p>
              {notice} {minimumAccessText}
            </p>
            <p className="link-row">
              <Link href={`${accountHref}#kontoen`}>Se hva du kan gjøre</Link>
            </p>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
