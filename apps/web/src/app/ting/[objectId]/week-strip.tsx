import { formatDay, formatWeekday } from "@/presentation/dates";
import type { FreeDay } from "@/presentation/objects";
import styles from "./viewer-view.module.css";

/**
 * The days ahead as a strip (Tomat kjerneflyt 1): free days filled, the
 * others struck through. Each day is said in full to assistive technology,
 * since colour and a line alone do not say it (UX-A11Y-005).
 */
export function WeekStrip({ days }: { days: readonly FreeDay[] }) {
  return (
    <ol className={styles.week} aria-label="De neste dagene">
      {days.map(({ date, free }) => (
        <li key={date} data-free={free || undefined}>
          <span aria-hidden="true">{formatWeekday(date)}</span>
          <span aria-hidden="true" className={styles.day}>
            {Number(date.slice(8))}
          </span>
          <span className="visually-hidden">
            {formatDay(date)}: {free ? "ledig" : "ikke ledig"}
          </span>
        </li>
      ))}
    </ol>
  );
}
