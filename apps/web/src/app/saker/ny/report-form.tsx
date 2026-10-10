"use client";

import type { ReportToPlatform } from "@lanbort/contracts";
import { type ReactNode, useState } from "react";
import { CommandForm } from "@/components/command-form";
import { caseHref } from "@/navigation/routes";
import { platformReportHelp } from "@/presentation/cases";
import styles from "../cases.module.css";

type Receiver = "environment" | "platform";

/**
 * A report, sent to whoever the reporter chooses (UX-INT-003, PS-TRUST-013):
 * the environment's administrators, or Lånbort while its stewards can
 * handle cases (UX-EXC-011). Without an environment, only Lånbort. The
 * submit label says who gets it. The choice sits outside the form, since
 * it decides where the report goes, not what it says.
 */
export function ReportForm({
  environment,
  target,
  toPlatform,
  alone,
  children,
}: {
  environment: { id: string; name: string } | null;
  /** Why only Lånbort can assess it, where there is no environment. */
  alone: string;
  target: ReportToPlatform["target"];
  /** Whether Lånbort can take the report. */
  toPlatform: boolean;
  /** The report's own fields. */
  children: ReactNode;
}) {
  const [receiver, setReceiver] = useState<Receiver>(
    environment ? "environment" : "platform",
  );
  const local = environment !== null && receiver === "environment";

  return (
    <>
      {!environment && (
        <section className={styles.options} aria-labelledby="mottaker">
          <h2 id="mottaker">Til Lånbort</h2>
          <p className={styles.receiver}>
            {alone} {platformReportHelp}
          </p>
        </section>
      )}
      {environment && (
        <fieldset className={styles.options}>
          <legend>Hvem skal vurdere det?</legend>
          <label className={styles.option}>
            <input
              type="radio"
              name="mottaker"
              checked={local}
              onChange={() => setReceiver("environment")}
            />
            <span>
              <strong>Administratorene i {environment.name}</strong>
              <small>
                For det som gjelder oppførsel og ting i miljøet. Én av dem tar
                saken.
              </small>
            </span>
          </label>
          <label className={styles.option}>
            <input
              type="radio"
              name="mottaker"
              checked={!local}
              disabled={!toPlatform}
              onChange={() => setReceiver("platform")}
            />
            <span>
              <strong>Lånbort</strong>
              <small>
                {toPlatform
                  ? platformReportHelp
                  : "Ikke tilgjengelig ennå. Lånbort kan ikke ta imot rapporter i appen ennå."}
              </small>
            </span>
          </label>
        </fieldset>
      )}
      <CommandForm
        key={receiver}
        path={
          local ? "/api/environments/reports" : "/api/cases/platform-reports"
        }
        fixed={local ? { environmentId: environment.id, target } : { target }}
        next={caseHref("{caseId}")}
        submitLabel={
          local
            ? "Send rapporten til administratorene"
            : "Send rapporten til Lånbort"
        }
      >
        {children}
      </CommandForm>
    </>
  );
}
