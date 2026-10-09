import {
  collectPages,
  countUnreadNotifications,
  readNotificationCentre,
} from "@lanbort/domain";
import type { Metadata } from "next";
import Link from "next/link";
import { accountHref } from "@/navigation/areas";
import {
  morePagesHref,
  pagesShown,
  type SearchParams,
} from "@/navigation/list-pages";
import { pageQuery, requirePageAccount } from "@/server/session";
import { NotificationList } from "./notification-list";
import styles from "./notifications.module.css";

export const metadata: Metadata = { title: "Varsler – Lånbort" };

const pagesKey = "sider";
const listId = "varselliste";
const preferencesHref = `${accountHref}#varslingsvalg`;

/**
 * The notification centre (UX-IA-002, PS-COM-001): a layer opened from the
 * indicator, not a sixth area. Each notification leads to its context;
 * opening it marks it read.
 */
export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requirePageAccount();
  const params = await searchParams;
  const [{ items: notifications, nextCursor }, unread] = await Promise.all([
    collectPages(
      (cursor) => pageQuery(readNotificationCentre, { cursor }),
      (page) => page.notifications,
      pagesShown(params, pagesKey),
    ),
    pageQuery(countUnreadNotifications, {}),
  ]);

  return (
    <main className={styles.page}>
      <h1>Varsler</h1>
      {notifications.length === 0 ? (
        <div className={styles.empty}>
          <h2>Ingen varsler</h2>
          <p>
            Du får varsel når noe trenger deg, eller når noe endrer seg i lånene
            og miljøene dine.
          </p>
        </div>
      ) : (
        <NotificationList
          id={listId}
          notifications={notifications}
          unreadCount={unread?.unreadCount ?? 0}
        />
      )}
      {nextCursor !== null && (
        <p className="link-row">
          <a href={morePagesHref("/varsler", params, pagesKey, listId)}>
            Vis eldre varsler
          </a>
        </p>
      )}
      <p className="link-row">
        <Link href={preferencesHref}>Varslingsvalg</Link>
      </p>
    </main>
  );
}
