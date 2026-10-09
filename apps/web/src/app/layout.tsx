import type { Metadata } from "next";
import type { ReactNode } from "react";
import { preload } from "react-dom";
import { countUnreadNotifications } from "@lanbort/domain";
import { Announcer } from "@/components/announcer";
import { AppShell } from "@/components/app-shell";
import { NetworkStatus } from "@/components/network-status";
import { restingNotice } from "@/presentation/account";
import { getPageAccount, pageQuery } from "@/server/session";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lånbort",
  description: "Lån ting av mennesker du stoler på.",
};

/** The text and heading fonts' common subset, fetched with the page. */
const fonts = [
  "/fonts/atkinson-hyperlegible-next-latin.woff2",
  "/fonts/quicksand-latin.woff2",
];

export default async function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  for (const font of fonts) {
    preload(font, { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  }

  const account = await getPageAccount();
  // An account that is not active keeps the frame: it still has loans,
  // cases and notifications to see to (PS-ADM-002).
  const signedIn =
    account !== null && account.status !== "pending_registration";
  const unread = signedIn
    ? await pageQuery(countUnreadNotifications, {})
    : null;

  return (
    <html lang="nb">
      <body>
        <NetworkStatus />
        {signedIn ? (
          <AppShell
            realName={account.realName ?? ""}
            pictureId={account.picture.pictureId}
            unread={unread?.unreadCount ?? 0}
            notice={restingNotice(account.status)}
          >
            {children}
          </AppShell>
        ) : (
          children
        )}
        <Announcer />
      </body>
    </html>
  );
}
