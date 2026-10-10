import type { Case } from "@lanbort/contracts";
import {
  caseKinds,
  getEnvironment,
  isDomainError,
  listCaseMeasures,
  measuresFor,
  readCase,
} from "@lanbort/domain";
import type { Metadata } from "next";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { PageHeader } from "@/components/page-header";
import { StatusCard } from "@/components/status-card";
import { ContextTag } from "@/components/tag";
import { caseEvidenceHref, environmentCasesHref } from "@/navigation/cases";
import { casesHref, loanHref } from "@/navigation/routes";
import {
  aboutCase,
  caseKindTitle,
  caseTitle,
  describeHandling,
  loanClarifiedText,
  openerOf,
  participantRoleLabels,
  participantTurn,
  personIn,
  reportTargetLabels,
} from "@/presentation/cases";
import { formatShortTime } from "@/presentation/dates";
import { loanStatusLabels } from "@/presentation/loans";
import { chatEnabled } from "@/server/env";
import {
  pageQuery,
  pageQueryOrNotFound,
  requirePageAccount,
} from "@/server/session";
import styles from "../cases.module.css";
import { HandlerRole } from "../handler-role";
import { Entries } from "./entries";
import { type AudienceChoice, EntryForm } from "./entry-form";
import {
  CloseCase,
  HandlerMoreActions,
  Handling,
  History,
  ShareStatements,
  TakeCase,
  TakenMeasures,
} from "./handling";

export const metadata: Metadata = { title: "Saken – Lånbort" };

/** The environment's name, if the viewer may still see it (PS-ENV-009). */
async function environmentName(environmentId: string | null) {
  if (environmentId === null) return null;

  try {
    return (await pageQuery(getEnvironment, { environmentId }))?.name ?? null;
  } catch (error) {
    if (isDomainError(error)) return null;
    throw error;
  }
}

/** Who a handler may write to, and what each choice means. */
function audiencesFor(c: Case, handlers: string): AudienceChoice[] {
  const name = (userId: string) => personIn(c.people, userId);
  const asFunction = `Partene ser innlegget som fra «${handlers.toLowerCase()}», ikke fra deg.`;
  const single = c.participants.length === 1 ? c.participants[0] : null;

  return [
    single
      ? {
          value: "parties",
          label: `Til ${name(single.userId)}`,
          icon: "person",
          audience: "parties",
          help: asFunction,
        }
      : {
          value: "parties",
          label: "Begge parter",
          icon: "people",
          audience: "parties",
          help: asFunction,
        },
    ...(single
      ? []
      : c.participants.map((participant): AudienceChoice => ({
          value: `party:${participant.userId}`,
          label: `Bare ${name(participant.userId)}`,
          icon: "person",
          audience: "party",
          toUserId: participant.userId,
          help: `Bare ${name(participant.userId)} ser innlegget, som fra administratorene.`,
        }))),
    {
      value: "handlers",
      label: "Internt notat",
      icon: "lock",
      audience: "handlers",
      help: "Bare dere som behandler saken, ser notatet.",
    },
  ];
}

/** The facts a handler weighs the case by (PS-COM-011). */
function Facts({ c }: { c: Case }) {
  const rows: [string, ReactNode][] = [];
  const name = (userId: string | null) => personIn(c.people, userId);

  if (c.kind === "loan_mediation") {
    if (c.loanTitle) rows.push(["Lån", c.loanTitle]);
    if (c.loan) rows.push(["Status", loanStatusLabels[c.loan.status]]);
    rows.push([
      "Parter",
      <>
        {c.participants.map((participant) => (
          <span key={participant.userId} className={styles.factLine}>
            {name(participant.userId)} ·{" "}
            {participantRoleLabels[participant.role].toLowerCase()}
            {c.status === "open" &&
              (participant.mayWrite
                ? " · kan skrive nå"
                : " · venter på ny runde")}
          </span>
        ))}
      </>,
    ]);
  } else {
    const subject =
      c.reportTarget === "user" || c.kind === "unavailability_report"
        ? name(c.subjectUserId)
        : c.reportTarget === "object"
          ? c.objectTitle
          : c.reportTarget
            ? reportTargetLabels[c.reportTarget]
            : null;

    if (subject) rows.push(["Gjelder", subject]);
    rows.push([
      c.kind === "environment_contact" ? "Fra" : "Meldt av",
      openerOf(c) ?? "Tidligere bruker",
    ]);
  }

  rows.push(["Åpnet", formatShortTime(c.openedAt)]);
  if (c.closedAt) rows.push(["Lukket", formatShortTime(c.closedAt)]);

  return (
    <section className={`card ${styles.facts}`} aria-label="Om saken">
      <dl className="facts">
        {rows.map(([label, value]) => (
          <Fragment key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </Fragment>
        ))}
      </dl>
    </section>
  );
}

/**
 * What the handler who acts on the case does next (UX-INT-001), and why:
 * take it; share the statements the parties have not seen; close a
 * mediation whose loan the parties have clarified (PS-COM-022); or what the
 * kind of case asks for.
 */
function handlerStep(
  c: Case,
  userId: string,
  measuresOffered: boolean,
): { title?: string; body: string; action?: ReactNode; closes: boolean } {
  if (c.assigneeUserId !== null && c.assigneeUserId !== userId) {
    return {
      body: "Du ser saken og innleggene, men har ingen behandlingshandlinger. Under «Flere valg» kan du erklære deg inhabil.",
      closes: false,
    };
  }

  if (c.assigneeUserId === null) {
    return {
      body: "Ta saken før du skriver til partene eller gjør noe i den. Partene ser bare at administratorene har den.",
      action: <TakeCase c={c} />,
      closes: false,
    };
  }

  if (c.loan?.clarified) {
    return {
      title: loanClarifiedText,
      body: `Partene har avklart lånet selv: ${loanStatusLabels[c.loan.status].toLowerCase()}. Neste steg er å lukke saken.`,
      action: <CloseCase c={c} primary />,
      closes: true,
    };
  }

  if (
    caseKinds[c.kind].separateStatements &&
    c.entries.some((entry) => entry.capacity === "party" && !entry.shared)
  ) {
    return {
      body: "Partene har forklaringer den andre ikke har sett. Neste steg er å dele forklaringene.",
      action: <ShareStatements c={c} />,
      closes: false,
    };
  }

  const bodies: Record<Case["kind"], string> = {
    environment_contact: "Svar i saken. Lukk den når henvendelsen er besvart.",
    loan_mediation:
      "Be partene om nye innlegg når dere trenger mer, og lukk saken når meklingen er ferdig. Du avgjør ikke hvem som har rett.",
    environment_report: measuresOffered
      ? "Vurder om publiseringen skal avvises eller sperres i miljøet. Saken kan også lukkes uten tiltak."
      : "Det finnes ingen tiltak i miljøet for en rapport om en person. Du kan skrive til den som rapporterte, eller lukke saken.",
    platform_report: "Vurder rapporten, og lukk saken når den er vurdert.",
    unavailability_report:
      "Meldingen endrer ingenting av seg selv. Lukk saken når den er vurdert.",
  };

  return { body: bodies[c.kind], closes: false };
}

/**
 * A case in its context (WP-88, UX-IA-007, Tomat kjerneflyt 8): what it is
 * about, how the handling stands and what comes next, what was written, and
 * for a handler the handling itself under the capacity they act in. A
 * participant sees the function, not the person who handles it; an
 * involved administrator never gets here as a handler (PS-USR-009,
 * UX-PRIV-006).
 */
export default async function CasePage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const account = await requirePageAccount();
  const { caseId } = await params;
  const c = await pageQueryOrNotFound(readCase, { caseId });
  const asHandler = c.viewer === "handler";
  const open = c.status === "open";
  const measures = asHandler ? measuresFor(c.kind, c.reportTarget) : [];
  const [environment, taken] = await Promise.all([
    environmentName(c.environmentId),
    asHandler && c.reportTarget !== null
      ? pageQuery(listCaseMeasures, { caseId })
      : null,
  ]);
  const handlers = caseKinds[c.kind].platform
    ? "Lånbort"
    : environment
      ? `Administratorene i ${environment}`
      : "Administratorene";
  const handling = describeHandling(
    c,
    { userId: account.userId, asHandler, environment },
    (userId) => personIn(c.people, userId),
  );
  // A handler writes and acts once they have taken the case (UX-INT-001).
  const holding = asHandler && open && c.assigneeUserId === account.userId;
  const writes = asHandler ? holding : c.mayWrite;
  const step =
    asHandler && open
      ? handlerStep(c, account.userId, measures.length > 0)
      : null;
  const own = c.entries.filter(
    (entry) =>
      entry.authorUserId === account.userId && entry.capacity === c.viewer,
  );
  const correctable = own.map((entry) => ({
    id: entry.id,
    label: `Innlegget ditt ${formatShortTime(entry.createdAt)}`,
    ...(asHandler
      ? { audience: entry.audience, toUserId: entry.toUserId }
      : {}),
  }));
  // PS-COM-014: a handler still corrects their own entry once it is closed.
  const correcting = asHandler && !open && correctable.length > 0;
  const firstStatement =
    !asHandler &&
    caseKinds[c.kind].separateStatements &&
    !c.entries.some(
      (entry) =>
        entry.capacity === "party" && entry.authorUserId === account.userId,
    );
  const back =
    asHandler && c.environmentId
      ? {
          href: environmentCasesHref(c.environmentId),
          label: "Saker",
        }
      : { href: casesHref, label: "Saker" };
  const writer = asHandler
    ? {
        heading: "Skriv i saken",
        label: "Innlegg",
        submitLabel: "Send innlegget",
      }
    : c.kind === "environment_contact"
      ? { heading: "Skriv i saken", label: "Melding", submitLabel: "Send" }
      : firstStatement
        ? {
            heading: "Din forklaring",
            label: "Forklaring",
            submitLabel: "Send forklaringen",
          }
        : {
            heading: "Nytt innlegg",
            label: "Innlegg",
            submitLabel: "Send innlegget",
          };

  return (
    <main>
      <PageHeader
        title={caseTitle(aboutCase(c), {
          handler: asHandler,
          opener: openerOf(c),
        })}
        kind={caseKindTitle[c.kind]}
        back={back}
        context={
          environment && (
            <ContextTag label="Miljø" icon="environment">
              {environment}
            </ContextTag>
          )
        }
      />
      {asHandler && <HandlerRole environment={environment} />}
      <StatusCard
        label={handling.label}
        status={step?.title ?? handling.text}
        tone={handling.tone}
        who={asHandler ? null : participantTurn(c, account.userId)}
        actions={step?.action}
      >
        {step?.body ?? handling.detail}
      </StatusCard>
      {asHandler && <Facts c={c} />}
      {asHandler && (
        <TakenMeasures
          c={c}
          taken={taken?.items ?? []}
          environment={environment}
        />
      )}
      <Entries c={c} viewer={{ userId: account.userId, environment }} />
      {!asHandler && !c.mayWrite && open && (
        <p className="quiet">
          Du kan skrive igjen når administratorene ber om mer.
        </p>
      )}
      {(writes || correcting) && (
        <EntryForm
          key={correcting ? "rett" : "skriv"}
          caseId={c.id}
          {...(correcting
            ? {
                heading: "Rett et innlegg",
                label: "Rettelse",
                submitLabel: "Send rettelsen",
                correctOnly: true,
              }
            : writer)}
          audiences={asHandler ? audiencesFor(c, handlers) : []}
          correctable={correctable}
          help={
            caseKinds[c.kind].separateStatements
              ? "Skriv hva som skjedde, så konkret du kan. Den andre parten ser det ikke før administratoren deler forklaringene."
              : "Skriv bare det som trengs for saken."
          }
          evidenceHref={
            !asHandler && chatEnabled() ? caseEvidenceHref(c.id) : null
          }
        />
      )}
      {holding && (
        <Handling
          c={c}
          measures={measures}
          environment={environment}
          closeOffered={!step?.closes}
        />
      )}
      {asHandler && <History c={c} taken={taken?.items ?? []} />}
      {!asHandler && c.loanId && (
        <p className="link-row">
          <Link href={loanHref(c.loanId)}>Gå til lånet</Link>
        </p>
      )}
      {asHandler && open && (
        <HandlerMoreActions c={c} userId={account.userId} />
      )}
    </main>
  );
}
