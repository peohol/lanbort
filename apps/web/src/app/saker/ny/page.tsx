import { caseEntryBodySchema } from "@lanbort/contracts";
import {
  getEnvironment,
  isDomainError,
  previewLoanRequest,
} from "@lanbort/domain";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CommandForm } from "@/components/command-form";
import { describedBy, Field } from "@/components/field";
import { PageHeader } from "@/components/page-header";
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
import {
  pageQuery,
  pageQueryOrNotFound,
  requirePageAccount,
} from "@/server/session";

export const metadata: Metadata = { title: "Ny sak – Lånbort" };

/** The report's target as the commands take it. */
const targetOf = ({ kind, id }: ReportSubject) =>
  kind === "user"
    ? { kind, userId: id }
    : kind === "object"
      ? { kind, objectId: id }
      : { kind, reviewId: id };

/** The thing's title, if the viewer can see it where they report it. */
async function objectTitle(objectId: string, environmentId: string | null) {
  try {
    return (
      (
        await pageQuery(previewLoanRequest, {
          objectId,
          ...(environmentId ? { environmentId } : {}),
        })
      )?.title ?? null
    );
  } catch (error) {
    if (isDomainError(error)) return null;
    throw error;
  }
}

function titleOf(start: CaseStart, thing: string | null) {
  if (start.kind === "contact") return "Kontakt administratorene";
  if (thing) return `Rapporter «${thing}»`;

  return `Rapporter ${reportTargetLabels[start.subject.kind]}`;
}

/**
 * A new case where it starts (UX-IA-007): a member writes to an
 * environment's administrators (PS-COM-010), or a user reports a person or
 * a thing to an environment's administrators, or something to Lånbort
 * (PS-TRUST-013). The page leads to the case once it is sent. Writing
 * again in an open case of the same kind continues it.
 */
export default async function NewCasePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requirePageAccount();
  const start = parseCaseStart(await searchParams);

  if (!start) notFound();

  const environment = start.environmentId
    ? await pageQueryOrNotFound(getEnvironment, {
        environmentId: start.environmentId,
      })
    : null;
  const thing =
    start.kind === "report" && start.subject.kind === "object"
      ? await objectTitle(start.subject.id, start.environmentId)
      : null;
  const next = caseHref("{caseId}");
  const form =
    start.kind === "contact"
      ? {
          path: "/api/environments/contact",
          fixed: { environmentId: start.environmentId },
          submitLabel: "Send til administratorene",
        }
      : start.environmentId
        ? {
            path: "/api/environments/reports",
            fixed: {
              environmentId: start.environmentId,
              target: targetOf(start.subject),
            },
            submitLabel: "Send rapporten til administratorene",
          }
        : {
            path: "/api/cases/platform-reports",
            fixed: { target: targetOf(start.subject) },
            submitLabel: "Send rapporten til Lånbort",
          };

  return (
    <main>
      <PageHeader
        title={titleOf(start, thing)}
        back={{ href: casesHref, label: "Saker" }}
        task
        context={
          <ContextTag label="Til">
            {environment ? `Administratorene i ${environment.name}` : "Lånbort"}
          </ContextTag>
        }
      >
        {start.kind === "contact"
          ? "Du skriver til administratorene som gruppe. Én av dem tar saken, og svaret kommer i saken."
          : "En rapport ber om en vurdering. Den sier ikke at noen har gjort noe galt, og den rapporten gjelder, får ikke vite om den gjennom saken."}
      </PageHeader>
      <CommandForm
        path={form.path}
        fixed={form.fixed}
        next={next}
        submitLabel={form.submitLabel}
      >
        <Field
          id="tekst"
          label={start.kind === "contact" ? "Melding" : "Hva har skjedd"}
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
      </CommandForm>
      {start.kind === "report" && start.environmentId && (
        <p className="link-row">
          <Link href={newCaseHref({ ...start, environmentId: null })}>
            Gjelder det et alvorlig brudd eller noe ulovlig? Rapporter til
            Lånbort i stedet
          </Link>
        </p>
      )}
    </main>
  );
}
