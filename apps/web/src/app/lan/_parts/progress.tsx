import { type LoanProgress, loanStages } from "@/presentation/loan-status";
import styles from "./loan.module.css";

/**
 * The loan's five steps from request to done (KF1 v2, KF7). The step it is
 * at carries its word, which names a deviation where there is one
 * («Overlevering avklares», «Kansellert»); the status card says the rest
 * (UX-EXC-001). Each step says whether it is done, now or ahead.
 */
export function Progress({ progress }: { progress: LoanProgress }) {
  return (
    <ol className={styles.progress} aria-label="Lånets steg">
      {loanStages.map((stage, index) => {
        const state =
          index < progress.current
            ? "done"
            : index === progress.current
              ? "current"
              : "ahead";

        return (
          <li
            key={stage}
            className={`${styles.stage} ${styles[state] ?? ""}`}
            aria-current={state === "current" ? "step" : undefined}
          >
            {state === "current" ? (
              <span className={styles.pill}>{progress.label}</span>
            ) : (
              <>
                <span className={styles.dot} aria-hidden="true" />
                <span className={styles.name} aria-hidden="true">
                  {stage}
                </span>
                <span className="visually-hidden">
                  {state === "done" ? `${stage}, ferdig` : `${stage}, senere`}
                </span>
              </>
            )}
          </li>
        );
      })}
    </ol>
  );
}
