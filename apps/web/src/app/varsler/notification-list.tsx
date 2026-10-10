import type { DescribedNotification } from "@lanbort/contracts";
import { ActionButton } from "@/components/action-button";
import { Icon } from "@/components/icon";
import { NotificationLink } from "@/components/notification-link";
import { Tag } from "@/components/tag";
import { ThingThumbnail } from "@/components/thing-thumbnail";
import { hrefFor } from "@/navigation/targets";
import {
  arrangeNotifications,
  notificationContext,
  type NotificationEntry,
  notificationLevelLabels,
  notificationWhen,
  notificationWords,
  olderText,
} from "@/presentation/notifications";
import styles from "./notifications.module.css";

/**
 * One notification: what it is about and when, whether it is required, and
 * what happened. The whole row leads to its context (UX-A11Y-006), and an
 * unread one is read once followed.
 */
function NotificationRow({
  entry: { notification, older },
  now,
}: {
  entry: NotificationEntry<DescribedNotification>;
  now: Date;
}) {
  const unread = notification.readAt === null;
  const context = notificationContext(notification);
  const { title, detail } = notificationWords(notification);
  const more = olderText({ notification, older });
  const href = hrefFor(notification.target);
  const content = (
    <>
      <ThingThumbnail
        picture={notification.about.picture}
        fallback={
          <span className={styles.icon}>
            <Icon name={context.icon} />
          </span>
        }
      />
      <span className={styles.text}>
        <span className={styles.meta}>
          <span>
            {context.label} · {notificationWhen(notification.occurredAt, now)}
          </span>
          {notification.level === "required" && (
            <Tag icon={null}>{notificationLevelLabels.required}</Tag>
          )}
        </span>
        <strong className={styles.title}>{title}</strong>
        {detail && <span className={styles.detail}>{detail}</span>}
        {more && <span className={styles.detail}>{more}</span>}
      </span>
    </>
  );
  const className = `${styles.notification} ${unread ? styles.unread : ""}`;

  return href ? (
    <NotificationLink
      className={className}
      href={href}
      notificationId={unread ? notification.id : null}
    >
      {content}
    </NotificationLink>
  ) : (
    <div className={className}>{content}</div>
  );
}

/**
 * The notification centre's content («Hjem og varsler v3», V1): the unread
 * notifications on their own, then the earlier ones, where older ones about
 * the same loan are gathered (UX-IA-018–019). Read only means seen; the
 * task stays on Home until it is done.
 */
export function NotificationList({
  notifications,
  unreadCount,
  id,
}: {
  notifications: readonly DescribedNotification[];
  /** All of the reader's unread notifications, also on later pages. */
  unreadCount: number;
  id: string;
}) {
  const now = new Date();
  const { unread, earlier } = arrangeNotifications(notifications);
  const newest = notifications[0];

  return (
    <div id={id} className={styles.sections}>
      {unread.length > 0 && (
        <section aria-labelledby="varsler-uleste">
          <div className={styles.heading}>
            <h2 id="varsler-uleste">Uleste · {unreadCount}</h2>
            {newest && (
              <ActionButton
                label="Marker alle som lest"
                path="/api/notifications/read-all"
                body={{ through: newest.id }}
                idempotent={false}
              />
            )}
          </div>
          <ul className={styles.list}>
            {unread.map((notification) => (
              <li key={notification.id}>
                <NotificationRow entry={{ notification, older: 0 }} now={now} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {earlier.length > 0 && (
        <section aria-labelledby="varsler-tidligere">
          <h2 id="varsler-tidligere" className={styles.heading}>
            Tidligere
          </h2>
          <ul className={`${styles.list} ${styles.earlier}`}>
            {earlier.map((entry) => (
              <li key={entry.notification.id}>
                <NotificationRow entry={entry} now={now} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
