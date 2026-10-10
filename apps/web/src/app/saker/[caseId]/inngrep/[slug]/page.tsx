import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { caseHref } from "@/navigation/routes";
import { interventionBySlug, interventionHref } from "@/navigation/stewardship";
import { aboutCase, caseTitle } from "@/presentation/cases";
import {
  type InterventionFlowKey,
  interventionFlows,
  interventionLabels,
  interventionStanding,
} from "@/presentation/interventions";
import { StewardRole } from "../../../../forvaltning/steward-role";
import { loadInterventionCase } from "../load";
import { InterventionFlow } from "./intervention-flow";

export const metadata: Metadata = { title: "Inngrep – Lånbort" };

/** What the case records for each intervention, by its kind. */
const recorded = {
  suspend: "account_suspended",
  reinstate: "account_reinstated",
  "start-closure": "account_closure_started",
  "complete-closure": "account_closure_completed",
  "retire-duplicate": "account_retired_as_duplicate",
  "move-object": "object_moved_from_duplicate",
  "link-person": "accounts_linked_as_same_person",
  "false-identity": "false_identity_recorded",
  "end-roles": "environment_roles_ended",
} as const satisfies Record<
  InterventionFlowKey,
  keyof typeof interventionLabels
>;

/**
 * Steps 2–4 of one intervention from the case (PS-ADM-014–015,
 * «Plattformforvaltning v1»). One that cannot be taken now leads back to
 * the choices, which say why.
 */
export default async function InterventionPage({
  params,
}: {
  params: Promise<{ caseId: string; slug: string }>;
}) {
  const { caseId, slug } = await params;
  const key = interventionBySlug(slug);

  if (!key) notFound();

  const { c, steward, subject } = await loadInterventionCase(caseId);
  const standing = interventionStanding(key, subject);

  if (!standing.shown || standing.blocked) {
    redirect(interventionHref(caseId));
  }

  const flow = interventionFlows[key];
  const title = caseTitle(aboutCase(c));

  return (
    <main>
      <PageHeader
        title={flow.label}
        kind={title}
        back={{ href: interventionHref(caseId), label: "Velg inngrep" }}
        task
      />
      <StewardRole steward={steward} />
      <InterventionFlow
        path={`/api/cases/${caseId}/interventions/${key}`}
        flowKey={key}
        subject={subject}
        record={interventionLabels[recorded[key]]}
        caseTitle={title}
        freshUntil={steward.freshUntil}
        back={interventionHref(caseId)}
        after={caseHref(caseId)}
      />
    </main>
  );
}
