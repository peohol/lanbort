import type { Metadata } from "next";
import type { ReactNode } from "react";
import { countUnreadNotifications } from "@lanbort/domain";
import { AppShell } from "@/components/app-shell";
import { getPageAccount, pageQuery } from "@/server/session";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lånbort",
  description: "Lån ting av mennesker du stoler på.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const account = await getPageAccount();
  const signedIn = account?.status === "active";
  const unread = signedIn
    ? await pageQuery(countUnreadNotifications, {})
    : null;

  return (
    <html lang="nb">
      <body>
        {signedIn ? (
          <AppShell
            realName={account.realName ?? ""}
            unread={unread?.unreadCount ?? 0}
          >
            {children}
          </AppShell>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
