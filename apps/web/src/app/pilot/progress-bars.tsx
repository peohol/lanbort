import type { PilotCounts } from "@lanbort/contracts";
import { pilotShare } from "@/presentation/pilot";
import styles from "./pilot.module.css";

/** How many of a group passed, failed or were blocked, and what is left. */
export function ProgressBars({
  groups,
}: {
  groups: readonly {
    readonly key: string;
    readonly label: string;
    readonly total: number;
    readonly counts: PilotCounts;
  }[];
}) {
  return (
    <ul className={styles.bars}>
      {groups
        .filter((group) => group.total > 0)
        .map((group) => {
          const share = (n: number) => `${(n / group.total) * 100}%`;
          const problems = group.counts.failed + group.counts.blocked;
          const other = group.counts.not_relevant;

          return (
            <li key={group.key}>
              <span className={styles.barLabel}>
                <span>{group.label}</span>
                <span>{pilotShare(group.counts.passed, group.total)}</span>
              </span>
              <span className={styles.bar} aria-hidden="true">
                <span
                  className={styles.passed}
                  style={{ width: share(group.counts.passed) }}
                />
                <span
                  className={styles.problem}
                  style={{ width: share(problems) }}
                />
                <span
                  className={styles.other}
                  style={{ width: share(other) }}
                />
              </span>
            </li>
          );
        })}
    </ul>
  );
}
