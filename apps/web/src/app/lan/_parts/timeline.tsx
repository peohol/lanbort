import type { LoanHistoryEntry } from "@lanbort/contracts";
import { Icon } from "@/components/icon";
import { formatShortTime } from "@/presentation/dates";
import { describeHistoryEntry } from "@/presentation/loan-history";
import styles from "./loan.module.css";

/**
 * UX-IA-008, UX-INT-008: the loan's timeline is secondary, so it stays
 * closed until asked for; once more of it is asked for, it is open. Each
 * entry says who did what and when, newest first, and what Lånbort itself
 * registered is quieter than what people did (KF7).
 */
export function Timeline({
  id,
  title,
  entries,
  more,
  open,
}: {
  /** The element the address points to when more is asked for. */
  id: string;
  /** The loan's object, as the entries name it. */
  title: string;
  entries: readonly LoanHistoryEntry[];
  /** The address with the next page, while there is one. */
  more: string | null;
  open: boolean;
}) {
  const count = `${more ? "Siste " : ""}${entries.length} ${
    entries.length === 1 ? "hendelse" : "hendelser"
  }`;

  return (
    <details id={id} className={styles.timeline} open={open}>
      <summary>
        <span className={styles.timelineIcon}>
          <Icon name="clock" />
        </span>
        <span className={styles.timelineTitle}>
          <strong>Tidslinje</strong>
          <span>{count}</span>
        </span>
      </summary>
      <ol className={styles.events} aria-label="Tidslinje, nyeste først">
        {entries.map((entry) => (
          <li
            key={entry.id}
            className={`${styles.event} ${entry.actor ? "" : styles.system}`}
          >
            <time dateTime={entry.at}>{formatShortTime(entry.at)}</time>
            <span>{describeHistoryEntry(entry, title)}</span>
          </li>
        ))}
      </ol>
      {more && (
        <p className={`link-row ${styles.more}`}>
          <a href={more}>Vis eldre hendelser</a>
        </p>
      )}
    </details>
  );
}
