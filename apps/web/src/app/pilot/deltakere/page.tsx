import { readPilotWorkspace } from "@lanbort/domain";
import type { Metadata } from "next";
import Link from "next/link";
import { CommandForm } from "@/components/command-form";
import { ConfirmAction } from "@/components/confirm-action";
import { EmptyState } from "@/components/empty-state";
import { Field } from "@/components/field";
import { MenuList, MenuRow } from "@/components/menu-list";
import { PageHeader } from "@/components/page-header";
import { pilotHref } from "@/navigation/pilot";
import { pilotFilterOf, pilotViewHref } from "@/presentation/pilot";
import { requirePilotLead } from "@/server/pilot";
import { pageQueryOrNotFound } from "@/server/session";
import { PilotNav } from "../pilot-nav";

export const metadata: Metadata = { title: "Pilotdeltakere – Lånbort" };

const count = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/**
 * The pilot's participants (pilot-ui.md «Deltakerens Mine pilotoppgaver»):
 * existing accounts taken in by their e-mail address, each under a
 * pseudonym. Only here, and only for the lead, is a pseudonym shown with a
 * name. Tasks are given on each test's own page.
 */
export default async function PilotParticipantsPage() {
  await requirePilotLead();
  const { participants } = await pageQueryOrNotFound(readPilotWorkspace, {});

  return (
    <main>
      <PageHeader title="Deltakere" back={{ href: pilotHref, label: "Pilot" }}>
        Deltakerne ser bare sine egne oppgaver under «Mine pilotoppgaver». Gi en
        oppgave fra testens egen side.
      </PageHeader>
      <PilotNav />

      {participants.length === 0 ? (
        <EmptyState>Ingen deltakere er lagt til ennå.</EmptyState>
      ) : (
        <MenuList>
          {participants.map((participant) => (
            <MenuRow
              key={participant.id}
              icon="person"
              label={`${participant.pseudonym}${participant.name ? ` – ${participant.name}` : ""}`}
              detail={
                <>
                  {count(
                    participant.openTasks,
                    "åpen oppgave",
                    "åpne oppgaver",
                  )}
                  {" · "}
                  {count(
                    participant.reports,
                    "tilbakemelding",
                    "tilbakemeldinger",
                  )}
                  {" · "}
                  <Link
                    href={pilotViewHref(
                      {
                        ...pilotFilterOf({}),
                        view: "all",
                        tester: participant.pseudonym,
                      },
                      "all",
                    )}
                  >
                    Se testene
                  </Link>
                </>
              }
              actions={
                <ConfirmAction
                  label="Fjern"
                  title={`Fjerne ${participant.pseudonym} fra piloten?`}
                  consequences={{
                    gone: [
                      "Tilgangen til «Mine pilotoppgaver»",
                      "Oppgavene som ikke er ferdige",
                    ],
                    stays: [
                      `Resultater og tilbakemeldinger under ${participant.pseudonym}`,
                    ],
                  }}
                  confirmLabel={`Fjern ${participant.pseudonym}`}
                  path={`/api/pilot/participants/${participant.id}/remove`}
                  body={{}}
                  danger
                />
              }
            />
          ))}
        </MenuList>
      )}

      <section aria-labelledby="ny-deltaker">
        <h2 id="ny-deltaker">Legg til en deltaker</h2>
        <CommandForm
          path="/api/pilot/participants"
          submitLabel="Legg til"
          messages={{
            not_found:
              "Ingen aktiv konto har denne adressen. Deltakeren må ha logget inn i Lånbort først.",
            conflict: "Denne personen er allerede med i piloten.",
          }}
        >
          <Field
            id="participant-email"
            label="E-postadressen deltakeren logger inn med"
            help="Hele adressen. Deltakeren får et pseudonym, for eksempel P-01."
          >
            <input
              id="participant-email"
              name="email"
              type="email"
              required
              autoComplete="off"
              aria-describedby="participant-email-hjelp"
            />
          </Field>
        </CommandForm>
      </section>
    </main>
  );
}
