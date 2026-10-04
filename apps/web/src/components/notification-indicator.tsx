"use client";

import type { NotificationReadResult } from "@lanbort/contracts";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { notificationsHref } from "@/navigation/areas";
import { getJson } from "./api-client";
import { onDataChanged } from "./data-changed";

/**
 * UX-IA-002: the stable way into the notification centre, on every page.
 * The count comes with the page and is read again when the user moves to
 * another page, comes back to the tab or changes something, so it never
 * lags far behind. It
 * is a number in text and in the link's name, not a colour alone.
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
      <svg
        aria-hidden="true"
        focusable="false"
        viewBox="0 0 24 24"
        width="24"
        height="24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4" />
      </svg>
      {count > 0 && (
        <span className="badge" aria-hidden="true">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
