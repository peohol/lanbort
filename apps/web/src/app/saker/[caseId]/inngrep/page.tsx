import type { Metadata } from "next";
import { MenuList, MenuRow } from "@/components/menu-list";
import { PageHeader } from "@/components/page-header";
import { Stepper } from "@/components/stepper";
import { caseHref } from "@/navigation/routes";
import { interventionHref } from "@/navigation/stewardship";
import { caseTitle, aboutCase } from "@/presentation/cases";
import {
  accountStatusLabels,
  interventionFlowKeys,
  interventionFlows,
  interventionGroups,
  interventionStanding,
} from "@/presentation/interventions";
import { StewardRole } from "../../../forvaltning/steward-role";
import { loadInterventionCase } from "./load";
import { interventionSteps } from "./steps";

export const metadata: Metadata = { title: "Velg inngrep – Lånbort" };

/**
 * Step 1 of an intervention (PS-ADM-015, «Plattformforvaltning v1»): what
 * can be done toward the account the case is about, grouped, each with
 * what it does or why it cannot be done now. Choices that mean nothing for
 * the account's status are left out.
 */
export default async function ChooseInterventionPage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  const { c, steward, subject } = await loadInterventionCase(caseId);
  const title = caseTitle(aboutCase(c));

  return (
    <main>
      <PageHeader
        title="Velg inngrep"
        kind={title}
        back={{ href: caseHref(caseId), label: "Saken" }}
        task
      />
      <StewardRole steward={steward} />
      <Stepper steps={interventionSteps(false)} current={0} />
      <section className="card" aria-label="Gjelder">
        <strong>{subject.name}</strong>
        <p className="quiet">
          Konto {accountStatusLabels[subject.account.status]} · fra «{title}»
        </p>
      </section>
      {interventionGroups.map(({ key, heading }) => {
        const rows = interventionFlowKeys.flatMap((flowKey) => {
          const flow = interventionFlows[flowKey];
          const standing = interventionStanding(flowKey, subject);

          if (flow.group !== key || !standing.shown) return [];

          return [
            <MenuRow
              key={flowKey}
              icon={flow.icon}
              label={flow.label}
              detail={standing.blocked ?? flow.short}
              {...(standing.blocked
                ? {}
                : { href: interventionHref(caseId, flowKey) })}
            />,
          ];
        });

        return rows.length > 0 ? (
          <section key={key} aria-labelledby={`gruppe-${key}`}>
            <h2 id={`gruppe-${key}`}>{heading}</h2>
            <MenuList label={`gruppe-${key}`}>{rows}</MenuList>
          </section>
        ) : null;
      })}
      <p className="quiet">
        Inngrepet rettes mot det saken gjelder. Hvert inngrep får sin egen
        begrunnelse og står i saken.
      </p>
    </main>
  );
}
