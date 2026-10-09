"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { postJson } from "./api-client";
import { announceDataChanged } from "./data-changed";
import { expectDirectEntry } from "./navigation-stack";

/**
 * Where a notification's e-mail leads (UX-INT-010): the notification is
 * marked read, as when it is opened in the app, and the user goes on to
 * its context. Marking it is done here, not by the link itself, so a mail
 * scanner that follows links marks nothing. The link is the way on without
 * scripts, or while the page waits.
 */
export function NotificationRedirect({
  notificationId,
  href,
}: {
  notificationId: string;
  href: string;
}) {
  const router = useRouter();

  useEffect(() => {
    // The user may go on by the link first; then this leads nowhere.
    let here = true;
    void postJson("/api/notifications/read", {
      notificationIds: [notificationId],
    })
      .then(announceDataChanged)
      .finally(() => {
        if (!here) return;
        // A direct entry, marked as opened from an e-mail (UX-IA-011).
        expectDirectEntry("epost");
        router.replace(href);
      });
    return () => {
      here = false;
    };
  }, [notificationId, href, router]);

  return (
    <main>
      <h1>Åpner varselet</h1>
      <p className="link-row">
        <Link href={href} replace onClick={() => expectDirectEntry("epost")}>
          Gå videre
        </Link>
      </p>
    </main>
  );
}
