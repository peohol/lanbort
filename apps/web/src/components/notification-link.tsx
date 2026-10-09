"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { postJson } from "./api-client";
import { announceDataChanged } from "./data-changed";
import { expectDirectEntry } from "./navigation-stack";

/**
 * A notification's way to its context. Following it marks an unread one
 * read; that never waits for, or depends on, the answer (PS-COM-002: read
 * state changes nothing in the domain). It is a direct entry: the context
 * opens in a stack built by the rule, marked as opened from a notification
 * (UX-IA-011).
 */
export function NotificationLink({
  href,
  notificationId,
  children,
}: {
  href: string;
  notificationId: string | null;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={() => {
        expectDirectEntry("varsel");
        if (notificationId) {
          void postJson("/api/notifications/read", {
            notificationIds: [notificationId],
          }).then(announceDataChanged);
        }
      }}
    >
      {children}
    </Link>
  );
}
