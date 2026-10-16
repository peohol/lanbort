"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { notificationsHref } from "@/navigation/areas";
import { badgeCount, useAttention } from "./attention";
import { Icon } from "./icon";

/**
 * UX-IA-002: the stable way into the notification centre, on every page,
 * with the number of unread notifications (`AttentionProvider`). It is a
 * number beside the bell and in the link's name, not a colour alone
 * (UX-IA-019).
 */
export function NotificationIndicator() {
  const pathname = usePathname();
  const count = useAttention().unreadCount;

  const label =
    count === 0 ? "Varsler, ingen uleste" : `Varsler, ${count} uleste`;

  return (
    <Link
      href={notificationsHref}
      scroll={false}
      className="notification-indicator"
      aria-label={label}
      aria-current={pathname === notificationsHref ? "page" : undefined}
    >
      <Icon name="bell" />
      {count > 0 && (
        <>
          <span aria-hidden="true">{badgeCount(count)}</span>
          <span className="unread-dot" aria-hidden="true" />
        </>
      )}
    </Link>
  );
}
