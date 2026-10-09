import type { LoanConditionReports } from "@lanbort/contracts";
import { CommandForm } from "@/components/command-form";
import { describedBy, Field } from "@/components/field";
import { formatShortTime } from "@/presentation/dates";
import {
  conditionNote,
  conditionReportPoints,
  describeStatement,
} from "@/presentation/loan-condition";
import styles from "./loan.module.css";

const answers = [
  { kind: "disagreement", label: "Jeg er uenig", field: "Hva er du uenig i?" },
  {
    kind: "explanation",
    label: "Legg til min forklaring",
    field: "Din forklaring",
  },
] as const;

const maxLength = 2000;

/**
 * Damage, deficiency or loss on the loan (PS-LOAN-023, KF7): what each
 * party told, with the other's one answer under it, never as a fact or a
 * verdict. Shown to the parties only, once there is something to show.
 */
export function ConditionReports({
  path,
  loanId,
  condition,
}: {
  /** The loan's API address. */
  path: string;
  loanId: string;
  condition: LoanConditionReports;
}) {
  if (condition.reports.length === 0) return null;

  return (
    <section className={styles.review} aria-labelledby="skade">
      <h2 id="skade" className={styles.cardTitle}>
        Skade, mangel eller tap
      </h2>
      {condition.reports.map((report) => (
        <div key={report.id} className={styles.statement}>
          <p className={styles.statedBy}>
            <strong>{describeStatement(report)}</strong> ·{" "}
            <time dateTime={report.reportedAt}>
              {formatShortTime(report.reportedAt)}
            </time>
          </p>
          <p className="message-text">{report.description}</p>
          {report.answer && (
            <div className={styles.statement}>
              <p className={styles.statedBy}>
                <strong>{describeStatement(report.answer)}</strong> ·{" "}
                <time dateTime={report.answer.reportedAt}>
                  {formatShortTime(report.answer.reportedAt)}
                </time>
              </p>
              <p className="message-text">{report.answer.description}</p>
            </div>
          )}
          {report.answerable &&
            answers.map(({ kind, label, field }) => {
              const id = `svar-${report.id}-${kind}`;

              return (
                <details key={kind}>
                  <summary>{label}</summary>
                  <CommandForm
                    path={`${path}/condition/${report.id}/answer`}
                    fixed={{ loanId, reportId: report.id, kind }}
                    submitLabel="Send svaret"
                    done="Svaret ditt står under opplysningen"
                  >
                    <Field id={id} label={field}>
                      <textarea
                        id={id}
                        name="description"
                        required
                        maxLength={maxLength}
                      />
                    </Field>
                  </CommandForm>
                </details>
              );
            })}
        </div>
      ))}
      <p className="help">{conditionNote}</p>
    </section>
  );
}

/**
 * Registering damage, deficiency or loss (PS-LOAN-023, KF7): what it is and
 * is not, before the reader writes it. It changes nothing on the loan.
 */
export function ReportCondition({
  path,
  loanId,
  other,
}: {
  path: string;
  loanId: string;
  /** The other party, who sees it. */
  other: string;
}) {
  const help =
    "Skriv kort og konkret hva som er skadet, mangler eller er borte.";

  return (
    <details>
      <summary>Meld skade, mangel eller tap</summary>
      <ul>
        {conditionReportPoints(other).map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
      <CommandForm
        path={`${path}/condition`}
        fixed={{ loanId }}
        submitLabel="Meld det"
        done="Opplysningen står på lånet"
      >
        <Field
          id="skade-beskrivelse"
          label="Hva er skadet, mangler eller borte?"
          help={help}
        >
          <textarea
            id="skade-beskrivelse"
            name="description"
            required
            maxLength={maxLength}
            {...describedBy("skade-beskrivelse", help)}
          />
        </Field>
      </CommandForm>
    </details>
  );
}
