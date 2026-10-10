import type { Case, CaseInterventions } from "@lanbort/contracts";
import { Fragment } from "react";
import { formatShortTime } from "@/presentation/dates";
import {
  decidedBy,
  interventionLabels,
  interventionSubject,
} from "@/presentation/interventions";
import styles from "../cases.module.css";

/**
 * «Inngrep» (PS-ADM-014–015, «Plattformforvaltning v1»): what the platform
 * stewards have done from this case, with whom it concerned, the basis and
 * who decided, for its handlers only. A report that someone may be
 * unavailable only starts a verification, so nothing is done from it
 * (PS-ADM-007).
 */
export function Interventions({
  c,
  interventions,
  userId,
}: {
  c: Case;
  interventions: CaseInterventions | null;
  userId: string;
}) {
  if (c.kind === "unavailability_report") {
    return (
      <section className={styles.section} aria-labelledby="inngrep">
        <h2 id="inngrep">Inngrep</h2>
        <p className="quiet">
          En melding starter bare en verifisering. Den endrer ingenting av seg
          selv, og det finnes ingen inngrep fra den.
        </p>
      </section>
    );
  }

  const items = interventions?.items ?? [];

  return (
    <section className={styles.section} aria-labelledby="inngrep">
      <div className={styles.sectionHead}>
        <h2 id="inngrep">
          Inngrep <span className="count">· {items.length}</span>
        </h2>
        <span>bare for behandlerne</span>
      </div>
      {items.length === 0 || !interventions ? (
        <p className="quiet">Ingen inngrep fra denne saken ennå.</p>
      ) : (
        <ol className={styles.entries}>
          {[...items].reverse().map((item) => (
            <li key={item.id} className={styles.entry}>
              <strong>{interventionLabels[item.kind]}</strong>
              <span className="quiet">{formatShortTime(item.decidedAt)}</span>
              <dl className="facts">
                {(
                  [
                    ["Gjelder", interventionSubject(item, interventions)],
                    ["Begrunnelse", item.basis],
                    [
                      "Besluttet av",
                      decidedBy(item, interventions.people, userId),
                    ],
                  ] as const
                ).map(([label, value]) => (
                  <Fragment key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </Fragment>
                ))}
              </dl>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
