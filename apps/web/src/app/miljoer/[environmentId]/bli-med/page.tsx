import { getEnvironment } from "@lanbort/domain";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { RequirementAnswers } from "@/components/requirement-answers";
import { environmentHref, environmentWelcomeHref } from "@/navigation/routes";
import { answerCommand, membershipStep } from "@/presentation/environments";
import { pageQueryOrNotFound, requirePageAccount } from "@/server/session";
import { environmentHome } from "../back";
import { AskedQuestion } from "../membership";

export const metadata: Metadata = { title: "Bli med – Lånbort" };

/**
 * Joining, applying, accepting an invitation or answering requirements
 * (PS-ENV-004–006, UX-JRN-002) as a bounded task (UX-IA-013, Tomat
 * kjerneflyt 3): the requirements and rules on one page, every checkbox
 * empty until the user ticks it, and back to the environment, the result,
 * once sent. Without a step that sends answers, the environment's page is
 * where the user belongs.
 */
export default async function JoinEnvironmentPage({
  params,
}: {
  params: Promise<{ environmentId: string }>;
}) {
  await requirePageAccount();
  const { environmentId } = await params;
  const environment = await pageQueryOrNotFound(getEnvironment, {
    environmentId,
  });
  const command = answerCommand(environment, membershipStep(environment));

  if (!command) {
    redirect(environmentHref(environmentId));
  }

  return (
    <main>
      <PageHeader
        title={environment.name}
        kind={command.heading}
        back={{ href: environmentHref(environmentId), label: environment.name }}
        home={environmentHome(environment)}
        task
      />
      <AskedQuestion environment={environment} />
      <RequirementAnswers
        environmentId={environmentId}
        requirements={environment.requirements}
        given={environment.membership?.answers ?? []}
        path={command.path}
        submitLabel={command.label}
        next={
          command.joins
            ? environmentWelcomeHref(environmentId)
            : environmentHref(environmentId)
        }
        note={
          command.reviewed &&
          "Administratorene ser navnet ditt og svarene over når de behandler søknaden."
        }
      />
    </main>
  );
}
