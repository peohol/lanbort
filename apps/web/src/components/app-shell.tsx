import Link from "next/link";
import type { ReactNode } from "react";
import { accountHref } from "@/navigation/areas";
import { minimumAccessText } from "@/presentation/account";
import { MainNavigation } from "./main-navigation";
import { NotificationIndicator } from "./notification-indicator";

/** The initials of a name, for the account button. */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

/**
 * The frame around every page of a signed-in user (UX-IA-001–003): the
 * five areas, the notification indicator, the account behind the user's
 * own initials, and, while the account is not active, why. It decides
 * nothing about access; it only shows the way.
 */
export function AppShell({
  realName,
  unread,
  notice = null,
  children,
}: {
  realName: string;
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
            <span aria-hidden="true">{initialsOf(realName)}</span>
          </Link>
        </div>
      </header>
      <MainNavigation />
      <div id="innhold" className="app-content" tabIndex={-1}>
        {notice && (
          <div className="account-notice" role="status">
            <p>
              {notice} {minimumAccessText}
            </p>
            <Link href={`${accountHref}#kontoen`}>Se hva du kan gjøre</Link>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
