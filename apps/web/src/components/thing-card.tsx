import type { ShownOwner } from "@lanbort/contracts";
import Link from "next/link";
import type { ReactNode } from "react";
import { availabilityStatus } from "@/presentation/objects";
import type { ListedThing } from "@/presentation/thing-list";
import { Icon } from "./icon";
import { OwnerNames } from "./owner-names";
import { Tag } from "./tag";
import styles from "./thing-card.module.css";
import { ThingThumbnail } from "./thing-thumbnail";

/**
 * One thing in a list (Tomat, kjerneflyt 2 and 3): its first photo, its
 * name leading to the thing's page, a line or two below it and its status
 * in words. The whole card is the target; links in the lines stay their own
 * targets.
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
      <ThingThumbnail src={image} size="card" placeholder />
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

/** A thing someone may borrow, as every list of such things has it. */
export interface FoundThing extends ListedThing {
  readonly ownedByYou: boolean;
  readonly owners: readonly ShownOwner[];
}

/**
 * A thing to borrow, the same wherever it is found: in an environment, on a
 * friend's page or in Finn (UX-IA-021). Its picture, its name, its owners
 * with their pictures (or «Din ting») and whether it is free. The card is
 * one target, so the owners are not links of their own; the thing's page
 * links them. Where it was found is said by the page, not the card.
 */
export function FoundThingCard({
  thing,
  href,
  image,
  today,
}: {
  thing: FoundThing;
  href: string;
  image: string | null;
  today: string;
}) {
  const status = availabilityStatus(thing, today);

  return (
    <ThingCard
      href={href}
      title={thing.title}
      image={image}
      details={[
        thing.ownedByYou
          ? "Din ting"
          : thing.owners.length > 0 && (
              <span className={styles.owners}>
                <OwnerNames owners={thing.owners} plain />
              </span>
            ),
      ]}
      status={<Tag tone={status.tone}>{status.label}</Tag>}
    />
  );
}
