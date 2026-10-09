import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "./icon";
import styles from "./thing-card.module.css";

/**
 * One thing in a list (Tomat, kjerneflyt 2 and 3): its first photo, its
 * name leading to the thing's page, a line or two of context, such as
 * where it is shown or who owns it, and its status in words. The whole card
 * is the target; links inside the context stay their own targets.
 */
export function ThingCard({
  href,
  title,
  image,
  details = [],
  status,
  id,
}: {
  href: string;
  title: string;
  /** The address of its first photo; without one, a quiet placeholder. */
  image: string | null;
  /** Lines under the name; empty ones are left out. */
  details?: readonly ReactNode[];
  /** Usually a `Tag`. */
  status?: ReactNode;
  id?: string;
}) {
  const shown = details.filter(
    (detail) => detail !== null && detail !== false && detail !== undefined,
  );

  return (
    <li className={styles.card} id={id} tabIndex={id ? -1 : undefined}>
      {image ? (
        // A private file behind the API's policy, not a static asset.
        // eslint-disable-next-line @next/next/no-img-element
        <img className={styles.image} src={image} alt="" loading="lazy" />
      ) : (
        <span className={`${styles.image} image-placeholder`} />
      )}
      <div className={styles.body}>
        <Link className={styles.title} href={href}>
          {title}
        </Link>
        {shown.map((detail, index) => (
          <span key={index} className={styles.detail}>
            {detail}
          </span>
        ))}
        {status && <span className={styles.status}>{status}</span>}
      </div>
      <Icon name="chevron" className={`icon ${styles.chevron}`} />
    </li>
  );
}

/** A list of `ThingCard`s. */
export function ThingCards({
  label,
  children,
}: {
  /** Names the list when no heading right before it does. */
  label?: string;
  children: ReactNode;
}) {
  return (
    <ul className={styles.cards} aria-label={label}>
      {children}
    </ul>
  );
}
