"use client";

import type { NotificationReadResult } from "@lanbort/contracts";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { notificationsHref } from "@/navigation/areas";
import { getJson } from "./api-client";
import { onDataChanged } from "./data-changed";
import { Icon } from "./icon";

/**
 * UX-IA-002: the stable way into the notification centre, on every page.
 * The count comes with the page and is read again when the user moves to
 * another page, comes back to the tab or changes something, so it never
 * lags far behind. It is a number beside the bell and in the link's name,
 * not a colour alone (UX-IA-019).
 */
export function NotificationIndicator({ unread }: { unread: number }) {
  const pathname = usePathname();
  const [count, setCount] = useState(unread);

  useEffect(() => {
    let current = true;
    const refresh = async () => {
      const result = await getJson<NotificationReadResult>(
        "/api/notifications/unread",
      );

      if (current && result.ok) setCount(result.data.unreadCount);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };

    void refresh();
    document.addEventListener("visibilitychange", onVisible);
    const unsubscribe = onDataChanged(() => void refresh());

    return () => {
      current = false;
      document.removeEventListener("visibilitychange", onVisible);
      unsubscribe();
    };
  }, [pathname]);

  const label =
    count === 0 ? "Varsler, ingen uleste" : `Varsler, ${count} uleste`;

  return (
    <Link
      href={notificationsHref}
      className="notification-indicator"
      aria-label={label}
      aria-current={pathname === notificationsHref ? "page" : undefined}
    >
      <Icon name="bell" />
      {count > 0 && (
        <>
          <span aria-hidden="true">{count > 99 ? "99+" : count}</span>
          <span className="unread-dot" aria-hidden="true" />
        </>
      )}
    </Link>
  );
}
