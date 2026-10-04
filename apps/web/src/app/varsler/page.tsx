import {
  collectPages,
  countUnreadNotifications,
  listNotifications,
} from "@lanbort/domain";
import type { Metadata } from "next";
import { ActionButton } from "@/components/action-button";
import { NotificationLink } from "@/components/notification-link";
import {
  morePagesHref,
  pagesShown,
  type SearchParams,
} from "@/navigation/list-pages";
import { hrefFor } from "@/navigation/targets";
import { formatTime } from "@/presentation/dates";
import {
  notificationLevelLabels,
  notificationText,
} from "@/presentation/notifications";
import { pageQuery, requirePageAccount } from "@/server/session";

export const metadata: Metadata = { title: "Varsler – Lånbort" };

const pagesKey = "sider";
const listId = "varselliste";

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
      (cursor) => pageQuery(listNotifications, { cursor }),
      (page) => page.notifications,
      pagesShown(params, pagesKey),
    ),
    pageQuery(countUnreadNotifications, {}),
  ]);
  const newest = notifications[0];

  return (
    <main>
      <h1>Varsler</h1>
      {newest && (unread?.unreadCount ?? 0) > 0 && (
        <div className="actions">
          <ActionButton
            label="Merk alle som lest"
            path="/api/notifications/read-all"
            body={{ through: newest.id }}
            idempotent={false}
          />
        </div>
      )}
      {notifications.length === 0 ? (
        <p className="quiet">Du har ingen varsler.</p>
      ) : (
        <ul className="entries" id={listId}>
          {notifications.map((notification) => {
            const text = notificationText(notification);
            const href = hrefFor(notification.target);
            const unread = notification.readAt === null;

            return (
              <li
                key={notification.id}
                className={unread ? "entry unread" : "entry"}
              >
                <span className="entry-detail">
                  {unread && <strong>Ny · </strong>}
                  {notificationLevelLabels[notification.level]} ·{" "}
                  {formatTime(notification.occurredAt)}
                </span>
                {href ? (
                  <NotificationLink
                    href={href}
                    notificationId={unread ? notification.id : null}
                  >
                    {text}
                  </NotificationLink>
                ) : (
                  <span>{text}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {nextCursor !== null && (
        <p className="link-row">
          <a href={morePagesHref("/varsler", params, pagesKey, listId)}>
            Vis eldre varsler
          </a>
        </p>
      )}
    </main>
  );
}
