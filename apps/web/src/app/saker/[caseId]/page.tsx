import type { Case, CaseEntry } from "@lanbort/contracts";
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
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusCard } from "@/components/status-card";
import { ContextTag } from "@/components/tag";
import { caseEvidenceHref, environmentCasesHref } from "@/navigation/cases";
import { casesHref, loanHref } from "@/navigation/routes";
import {
  audienceLabel,
  caseKindLabels,
  caseTitle,
  describeHandling,
  entryAuthor,
  handlerFunction,
  participantRoleLabels,
  participantTurn,
  personIn,
} from "@/presentation/cases";
import { formatTime } from "@/presentation/dates";
import { chatEnabled } from "@/server/env";
import {
  pageQuery,
  pageQueryOrNotFound,
  requirePageAccount,
} from "@/server/session";
import { type AudienceChoice, EntryForm } from "./entry-form";
import { Assignment, Handling, History } from "./handling";

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

/** What the case concerns, as facts (PS-COM-011). */
function About({ c, environment }: { c: Case; environment: string | null }) {
  const subject =
    c.reportTarget === "user" || c.kind === "unavailability_report"
      ? personIn(c.people, c.subjectUserId)
      : (c.loanTitle ?? c.objectTitle);

  return (
    <section aria-labelledby="om-saken">
      <h2 id="om-saken">Om saken</h2>
      <dl className="facts">
        <dt>Type</dt>
        <dd>{caseKindLabels[c.kind]}</dd>
        {environment && (
          <>
            <dt>Miljø</dt>
            <dd>{environment}</dd>
          </>
        )}
        {subject && (
          <>
            <dt>Gjelder</dt>
            <dd>{subject}</dd>
          </>
        )}
        <dt>Åpnet</dt>
        <dd>{formatTime(c.openedAt)}</dd>
        {c.closedAt && (
          <>
            <dt>Lukket</dt>
            <dd>{formatTime(c.closedAt)}</dd>
          </>
        )}
      </dl>
      {c.viewer === "handler" && c.participants.length > 0 && (
        <>
          <h3>Parter</h3>
          <ul className="entries">
            {c.participants.map((participant) => (
              <li key={participant.userId} className="entry">
                <strong>{personIn(c.people, participant.userId)}</strong>
                <span className="entry-detail">
                  {participantRoleLabels[participant.role]}
                  {c.status === "open" &&
                    (participant.mayWrite
                      ? " · kan skrive nå"
                      : " · venter på ny runde")}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** One entry, with the private messages submitted with it (WP-46). */
function Entry({
  entry,
  c,
  userId,
}: {
  entry: CaseEntry;
  c: Case;
  userId: string;
}) {
  const asHandler = c.viewer === "handler";

  return (
    <li id={`innlegg-${entry.id}`} className="entry">
      <span className="entry-detail">
        {entryAuthor(entry, c, userId)} ·{" "}
        <time dateTime={entry.createdAt}>{formatTime(entry.createdAt)}</time>
        {asHandler && ` · ${audienceLabel(entry, c.people, c.kind)}`}
      </span>
      {entry.correctsEntryId && (
        <span className="entry-detail">
          Retter{" "}
          <a href={`#innlegg-${entry.correctsEntryId}`}>et tidligere innlegg</a>
        </span>
      )}
      <span className="message-text">{entry.body}</span>
      {entry.privateMessages.length > 0 && (
        <details>
          <summary>
            {entry.privateMessages.length === 1
              ? "1 privat melding sendt inn"
              : `${entry.privateMessages.length} private meldinger sendt inn`}
          </summary>
          <p className="help">
            En kopi parten selv valgte å sende inn. Lånbort kan ikke bekrefte at
            den er lik meldingen i samtalen.
          </p>
          <ol className="entries">
            {entry.privateMessages.map((copy) => (
              <li key={copy.messageId} className="entry">
                <span className="entry-detail">
                  {personIn(c.people, copy.senderUserId)} ·{" "}
                  <time dateTime={copy.sentAt}>{formatTime(copy.sentAt)}</time>
                </span>
                <span className="message-text">{copy.body}</span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </li>
  );
}

/** Who a handler may write to in this case. */
function audiencesFor(c: Case): AudienceChoice[] {
  return [
    { value: "parties", label: "Alle parter", audience: "parties" },
    ...c.participants.map((participant) => ({
      value: `party:${participant.userId}`,
      label: `Bare ${personIn(c.people, participant.userId)}`,
      audience: "party" as const,
      toUserId: participant.userId,
    })),
    {
      value: "handlers",
      label: "Bare saksbehandlerne (internt notat)",
      audience: "handlers",
    },
  ];
}

/**
 * A case in its context (WP-88, UX-IA-007): what it concerns, how the
 * handling stands and who may write, what was written, and for a handler
 * the handling itself. A participant sees the function, not the person
 * who handles it; an involved administrator never gets here as a handler
 * (PS-USR-009, UX-PRIV-006).
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
  const measures = asHandler ? measuresFor(c.kind, c.reportTarget) : [];
  const [environment, taken] = await Promise.all([
    environmentName(c.environmentId),
    asHandler && c.reportTarget !== null
      ? pageQuery(listCaseMeasures, { caseId })
      : null,
  ]);
  const handling = describeHandling(
    c,
    { userId: account.userId, asHandler },
    (userId) => personIn(c.people, userId),
  );
  const own = c.entries.filter(
    (entry) =>
      entry.authorUserId === account.userId && entry.capacity === c.viewer,
  );
  const back =
    asHandler && c.environmentId
      ? {
          href: environmentCasesHref(c.environmentId),
          label: "Saker i miljøet",
        }
      : { href: casesHref, label: "Saker" };

  return (
    <main>
      <PageHeader
        title={caseTitle(c)}
        back={back}
        context={
          <>
            {environment && (
              <ContextTag label="Miljø">{environment}</ContextTag>
            )}
            <ContextTag label="Behandles av">
              {handlerFunction(c.kind)}
            </ContextTag>
          </>
        }
      />
      <StatusCard
        status={handling.text}
        tone={handling.tone}
        when={handling.detail}
        who={asHandler ? null : participantTurn(c)}
        actions={
          asHandler ? (
            c.status === "open" && <Assignment c={c} userId={account.userId} />
          ) : c.loanId ? (
            <Link className="button" href={loanHref(c.loanId)}>
              Gå til lånet
            </Link>
          ) : undefined
        }
      />
      <About c={c} environment={environment} />
      <section aria-labelledby="innlegg">
        <h2 id="innlegg">Innlegg</h2>
        {c.entries.length === 0 ? (
          <EmptyState>Ingen innlegg du kan se ennå.</EmptyState>
        ) : (
          <ol className="entries" aria-label="Innlegg, eldste først">
            {c.entries.map((entry) => (
              <Entry
                key={entry.id}
                entry={entry}
                c={c}
                userId={account.userId}
              />
            ))}
          </ol>
        )}
      </section>
      {c.mayWrite && (
        <section aria-labelledby="skriv">
          <h2 id="skriv">Skriv i saken</h2>
          <EntryForm
            caseId={c.id}
            audiences={asHandler ? audiencesFor(c) : []}
            correctable={own.map((entry) => ({
              id: entry.id,
              label: `Innlegget ditt ${formatTime(entry.createdAt)}`,
            }))}
            help={
              asHandler
                ? "Partene ser innlegget som fra saksbehandlerne, ikke fra deg."
                : separateHelp(c)
            }
          />
          {!asHandler && chatEnabled() && (
            <p className="link-row">
              <Link href={caseEvidenceHref(c.id)}>
                Send inn meldinger fra en privat samtale
              </Link>
            </p>
          )}
        </section>
      )}
      {asHandler && c.status === "open" && (
        <Handling c={c} userId={account.userId} measures={measures} />
      )}
      {asHandler && (
        <History
          c={c}
          taken={taken?.items ?? []}
          measuresOffered={measures.length > 0}
        />
      )}
    </main>
  );
}

/** PS-COM-012: in a mediation, the other party does not see it yet. */
const separateHelp = (c: Case) =>
  caseKinds[c.kind].separateStatements
    ? "Den andre parten ser ikke det du skriver før saksbehandleren deler forklaringene."
    : "Saksbehandleren ser det du skriver. Skriv bare det som trengs for saken.";
