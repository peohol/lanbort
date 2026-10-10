import { caseEntryBodySchema } from "@lanbort/contracts";
import {
  getEnvironment,
  isDomainError,
  previewLoanRequest,
  readPerson,
} from "@lanbort/domain";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CommandForm } from "@/components/command-form";
import { describedBy, Field } from "@/components/field";
import { MenuList, MenuRow } from "@/components/menu-list";
import { PageHeader } from "@/components/page-header";
import { StatusCard } from "@/components/status-card";
import { ContextTag } from "@/components/tag";
import {
  type CaseStart,
  newCaseHref,
  parseCaseStart,
  type ReportSubject,
} from "@/navigation/cases";
import type { SearchParams } from "@/navigation/list-pages";
import { caseHref, casesHref } from "@/navigation/routes";
import { reportTargetLabels } from "@/presentation/cases";
import { platformStewardsEnabled } from "@/server/env";
import {
  pageQuery,
  pageQueryOrNotFound,
  requirePageAccount,
} from "@/server/session";
import styles from "../cases.module.css";
import { ReportForm } from "./report-form";

export const metadata: Metadata = { title: "Ny sak – Lånbort" };

/** The report's target as the commands take it. */
const targetOf = ({ kind, id }: ReportSubject) =>
  kind === "user"
    ? { kind, userId: id }
    : kind === "object"
      ? { kind, objectId: id }
      : { kind, reviewId: id };

/** Why only Lånbort can assess a report without an environment. */
const aloneText: Record<ReportSubject["kind"], string> = {
  user: "Dere er ikke i et miljø sammen, så rapporten går til Lånbort.",
  object: "Du ser ikke tingen i et miljø, så rapporten går til Lånbort.",
  review: "Anmeldelser vurderes av Lånbort.",
  review_response: "Anmeldelser og tilsvar vurderes av Lånbort.",
};

/** What a query answers, or null where the reader may not see it. */
async function seen<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch (error) {
    if (isDomainError(error)) return null;
    throw error;
  }
}

/** What is reported, by name where the reader sees it. */
async function subjectOf(start: CaseStart) {
  if (start.kind !== "report") return null;

  const { subject, environmentId } = start;

  if (subject.kind === "object") {
    const preview = await seen(() =>
      pageQuery(previewLoanRequest, {
        objectId: subject.id,
        ...(environmentId ? { environmentId } : {}),
      }),
    );

    return { name: preview?.title ? `«${preview.title}»` : null, places: [] };
  }

  if (subject.kind === "user") {
    const person = await seen(() =>
      pageQuery(readPerson, { userId: subject.id }),
    );

    return {
      name: person?.realName ?? null,
      places: person?.sharedEnvironments ?? [],
    };
  }

  return { name: null, places: [] };
}

/**
 * UX-EXC-011: a report only Lånbort could assess (a review, or what has no
 * environment in common) is not offered while the platform stewards cannot
 * handle it (`PLATFORM_STEWARDS_ENABLED`). The page says so plainly, promises nothing and names no
 * address that does not exist, and offers the environments where the
 * administrators have the mandate instead.
 */
function NotAvailable({
  start,
  places,
}: {
  start: Extract<CaseStart, { kind: "report" }>;
  places: readonly { id: string; name: string }[];
}) {
  const review =
    start.subject.kind === "review" || start.subject.kind === "review_response";

  return (
    <>
      <StatusCard
        label="Ikke tilgjengelig ennå"
        tone="neutral"
        status={
          review
            ? "Du kan ikke rapportere anmeldelser ennå"
            : "Du kan ikke rapportere til Lånbort ennå"
        }
      >
        {review
          ? "Anmeldelser vurderes av Lånbort, og Lånbort kan ikke ta imot rapporter i appen ennå. Er du uenig i en anmeldelse av deg, kan du svare med et tilsvar."
          : "Lånbort kan ikke ta imot rapporter i appen ennå. Der dere er i samme miljø, kan administratorene der vurdere det."}
      </StatusCard>
      {places.length > 0 && (
        <section aria-labelledby="miljoer">
          <h2 id="miljoer">Rapporter i et miljø</h2>
          <MenuList label="miljoer">
            {places.map((place) => (
              <MenuRow
                key={place.id}
                href={newCaseHref({ ...start, environmentId: place.id })}
                icon="environment"
                label={`Administratorene i ${place.name}`}
              />
            ))}
          </MenuList>
        </section>
      )}
    </>
  );
}

/** What the case says; the one field either form has. */
function Body({ label }: { label: string }) {
  return (
    <Field
      id="tekst"
      label={label}
      help="Skriv bare det som trengs for saken. Private samtaler blir ikke en del av saken, men du kan sende inn meldinger fra dem senere."
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
  );
}

/**
 * A new case where it starts (UX-IA-007): a member writes to an
 * environment's administrators (PS-COM-010), or reports a person or a
 * thing to them or to Lånbort (PS-TRUST-013). Lånbort is offered only
 * while its stewards can handle cases (UX-EXC-011). The page leads to the case once it is sent; writing again
 * in an open case of the same kind continues it.
 */
export default async function NewCasePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requirePageAccount();
  const start = parseCaseStart(await searchParams);
  const toPlatform = platformStewardsEnabled();

  if (!start) notFound();

  const contact = start.kind === "contact";
  const [environment, subject] = await Promise.all([
    !start.environmentId
      ? null
      : contact
        ? // Whoever was removed from a hidden environment no longer sees
          // it, but may still ask its administrators for a new assessment
          // (PS-ENV-021); the command decides who may write.
          seen(() =>
            pageQuery(getEnvironment, { environmentId: start.environmentId! }),
          )
        : pageQueryOrNotFound(getEnvironment, {
            environmentId: start.environmentId,
          }),
    subjectOf(start),
  ]);
  const title = contact
    ? "Kontakt administratorene"
    : subject?.name
      ? `Rapporter ${subject.name}`
      : `Rapporter ${reportTargetLabels[start.subject.kind]}`;
  const context = environment && (
    <ContextTag label="Miljø" icon="environment">
      {environment.name}
    </ContextTag>
  );

  if (start.kind === "report" && !environment && !toPlatform) {
    return (
      <main>
        <PageHeader
          title={title}
          kind="Rapport"
          back={{ href: casesHref, label: "Saker" }}
          task
        />
        <NotAvailable start={start} places={subject?.places ?? []} />
      </main>
    );
  }

  return (
    <main>
      <PageHeader
        title={title}
        kind={contact ? "Henvendelse" : "Rapport"}
        back={{ href: casesHref, label: "Saker" }}
        task
        context={context}
      >
        {contact
          ? "Du skriver til administratorene som gruppe. Én av dem tar saken, og svaret kommer der. Saken er ikke en privat samtale."
          : "En rapport ber om en vurdering. Den sier ikke at noen har gjort noe galt. Den du rapporterer, får ikke vite om rapporten gjennom saken."}
      </PageHeader>
      {start.kind === "contact" ? (
        <CommandForm
          path="/api/environments/contact"
          fixed={{ environmentId: start.environmentId }}
          next={caseHref("{caseId}")}
          submitLabel="Send til administratorene"
        >
          <Body label="Melding" />
        </CommandForm>
      ) : (
        <ReportForm
          environment={
            environment && { id: environment.id, name: environment.name }
          }
          target={targetOf(start.subject)}
          toPlatform={toPlatform}
          alone={aloneText[start.subject.kind]}
        >
          <Body label="Hva har skjedd" />
        </ReportForm>
      )}
      {!contact && (
        <p className={styles.footnote}>
          Gjelder det et lån som ikke er levert tilbake? Det avklares på{" "}
          <Link href="/lan">lånet</Link>, ikke med en rapport.
        </p>
      )}
    </main>
  );
}
