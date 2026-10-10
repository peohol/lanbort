import { caseEntryBodySchema } from "@lanbort/contracts";
import { readPerson, readUnavailabilityTarget } from "@lanbort/domain";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Points } from "@/chat/points";
import { CommandForm } from "@/components/command-form";
import { describedBy, Field } from "@/components/field";
import { PageHeader } from "@/components/page-header";
import { caseHref, personHref } from "@/navigation/routes";
import { platformStewardsEnabled } from "@/server/env";
import { pageQueryOrNotFound, requirePageAccount } from "@/server/session";

export const metadata: Metadata = {
  title: "Si fra om mulig dødsfall – Lånbort",
};

/**
 * PS-COM-015, UX-EXC-008: a user with a concrete relation to someone tells
 * Lånbort that they may have died or be permanently unavailable. It says
 * first what the report does not do: it changes nothing by itself, and
 * gives nobody access to the person or the right to act for them
 * (OD-0003). Until Lånbort's platform stewards can handle cases (OD-0023),
 * the page does not exist. Writing again while the case is open continues
 * it.
 */
export default async function UnavailabilityReportPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  await requirePageAccount();

  if (!platformStewardsEnabled()) notFound();

  const { userId } = await params;
  // By the rule the report is taken by: not about oneself, someone
  // unrelated, or across a block.
  await pageQueryOrNotFound(readUnavailabilityTarget, { userId });
  const { realName: name } = await pageQueryOrNotFound(readPerson, { userId });

  return (
    <main>
      <PageHeader
        title={`Si fra om ${name}`}
        kind="Melding til Lånbort"
        back={{ href: personHref(userId), label: name }}
        task
      >
        Hvis du tror {name} kan være død eller varig utilgjengelig, kan du si
        fra til Lånbort.
      </PageHeader>
      <div className="card">
        <Points
          points={[
            {
              icon: "shield",
              text: "Lånbort undersøker meldingen fortrolig.",
            },
            {
              icon: "lock",
              text: `Meldingen endrer ingenting av seg selv. Kontoen, lånene og tingene til ${name} står som før.`,
            },
            {
              icon: "hidden",
              text: `Du får ingen tilgang til kontoen eller opplysningene til ${name}, og ingen kan handle for ${name} i Lånbort.`,
            },
            {
              icon: "info",
              text: "Å sende en melding du vet er falsk, er misbruk.",
            },
          ]}
        />
      </div>
      <CommandForm
        path="/api/cases/unavailability-reports"
        fixed={{ userId }}
        next={caseHref("{caseId}")}
        submitLabel="Send meldingen"
      >
        <Field
          id="tekst"
          label="Hva vet du?"
          help="Skriv hva du vet, og hvordan du fikk vite det. Lånbort kan be deg om mer i saken."
        >
          <textarea
            id="tekst"
            name="body"
            rows={6}
            required
            maxLength={caseEntryBodySchema.maxLength ?? undefined}
            {...describedBy("tekst", true)}
          />
        </Field>
      </CommandForm>
    </main>
  );
}
