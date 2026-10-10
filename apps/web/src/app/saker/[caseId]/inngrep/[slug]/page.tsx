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
  type subjectOf,
} from "@/presentation/interventions";
import { StewardRole } from "../../../../forvaltning/steward-role";
import { loadInterventionCase } from "../load";
import {
  type InterventionVariant,
  InterventionFlow,
} from "./intervention-flow";

export const metadata: Metadata = { title: "Inngrep – Lånbort" };

/** What the case records for each intervention, by its kind. */
const recorded = {
  suspend: "account_suspended",
  reinstate: "account_reinstated",
  "start-closure": "account_closure_started",
  "complete-closure": "account_closure_completed",
  "false-identity": "false_identity_recorded",
  "end-roles": "environment_roles_ended",
} as const satisfies Record<
  InterventionFlowKey,
  keyof typeof interventionLabels
>;

/** The ways an intervention can go: one, or one per environment with roles. */
function variantsOf(
  key: InterventionFlowKey,
  subject: ReturnType<typeof subjectOf>,
): InterventionVariant[] {
  const flow = interventionFlows[key];

  if (key !== "end-roles") {
    return [
      {
        environmentId: null,
        label: flow.label,
        detail: flow.short,
        title: flow.title(subject, null),
        rows: flow.consequences(subject, null),
        whom: subject.name,
        done: flow.done(subject, null),
      },
    ];
  }

  return subject.account.roles.map((role) => ({
    environmentId: role.environmentId,
    label: role.name,
    detail: `${subject.first} er ${role.owner ? "eier og administrator" : "administrator"}`,
    title: flow.title(subject, role.name),
    rows: flow.consequences(subject, role),
    whom: `${subject.name} i ${role.name}`,
    done: flow.done(subject, role.name),
  }));
}

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
        userId={subject.account.userId}
        record={interventionLabels[recorded[key]]}
        caseTitle={title}
        icon={flow.icon}
        danger={flow.danger}
        verb={flow.verb(subject)}
        variants={variantsOf(key, subject)}
        choiceLabel={key === "end-roles" ? "Miljøet" : null}
        freshUntil={steward.freshUntil}
        back={interventionHref(caseId)}
        after={caseHref(caseId)}
      />
    </main>
  );
}
