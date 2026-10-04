import type { Loan, LoanHistoryEntry } from "@lanbort/contracts";
import { collectPages, readLoan, readLoanHistory } from "@lanbort/domain";
import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import {
  morePagesHref,
  pagesShown,
  type SearchParams,
} from "@/navigation/list-pages";
import { loanHref } from "@/navigation/targets";
import { formatPeriod, formatTime } from "@/presentation/dates";
import { describeHistoryEntry } from "@/presentation/loan-history";
import {
  describeLoanStatus,
  type LoanStep,
  loanSteps,
  personName,
} from "@/presentation/loan-status";
import {
  pageQuery,
  pageQueryOrNotFound,
  requirePageAccount,
} from "@/server/session";

export const metadata: Metadata = { title: "Lån – Lånbort" };

/** The timeline's pages in the address, and the element it is. */
const historyKey = "historikk";

function Steps({ steps }: { steps: readonly LoanStep[] }) {
  return steps.map((step) => (
    <ActionButton
      key={`${step.path} ${step.label}`}
      label={step.label}
      path={step.path}
      body={step.body}
    />
  ));
}

/**
 * The status card (UX-INT-001, UX-INT-004): what the loan waits for and
 * who, its date, and the next step first; the rarer steps under «Flere
 * valg» (UX-INT-009).
 */
function LoanStatus({ loan }: { loan: Loan }) {
  const status = describeLoanStatus(loan);
  const { primary, secondary } = loanSteps(loan);

  return (
    <section aria-labelledby="status">
      <h2 id="status">Status</h2>
      <p className="waiting">{status.text}</p>
      {status.when && <p className="entry-detail">{status.when}</p>}
      {primary.length > 0 && (
        <div className="actions">
          <Steps steps={primary} />
        </div>
      )}
      {secondary.length > 0 && (
        <details>
          <summary>Flere valg</summary>
          <div className="secondary-actions">
            <Steps steps={secondary} />
          </div>
        </details>
      )}
    </section>
  );
}

/** What was agreed, as it is now (PS-LOAN-008, PS-LOAN-010). */
function Agreement({ loan }: { loan: Loan }) {
  const lender = loan.role === "lender";
  const other = personName(loan.parties[lender ? "borrower" : "lender"]);

  return (
    <section aria-labelledby="avtalen">
      <h2 id="avtalen">Avtalen</h2>
      <dl className="facts">
        <dt>{lender ? "Du låner bort til" : "Du låner av"}</dt>
        <dd>{other}</dd>
        <dt>Periode</dt>
        <dd>{formatPeriod(loan.period)}</dd>
        {loan.agreement.loanTerms && (
          <>
            <dt>Vilkår</dt>
            <dd>{loan.agreement.loanTerms}</dd>
          </>
        )}
        <dt>Beskrivelse</dt>
        <dd>{loan.agreement.description}</dd>
      </dl>
    </section>
  );
}

/**
 * UX-IA-008, UX-INT-008: the history is secondary, so it stays closed
 * until asked for; once more of it is asked for, it is open.
 */
function History({
  loan,
  entries,
  more,
  open,
}: {
  loan: Loan;
  entries: readonly LoanHistoryEntry[];
  more: string | null;
  open: boolean;
}) {
  return (
    <details id={historyKey} open={open}>
      <summary>Historikk</summary>
      <ol className="entries" aria-label="Historikk, nyeste først">
        {entries.map((entry) => (
          <li key={entry.id} className="entry">
            <span>{describeHistoryEntry(entry, loan.agreement.title)}</span>
            <time className="entry-detail" dateTime={entry.at}>
              {formatTime(entry.at)}
            </time>
          </li>
        ))}
      </ol>
      {more && (
        <p className="link-row">
          <a href={more}>Vis eldre hendelser</a>
        </p>
      )}
    </details>
  );
}

/**
 * One loan for one of its parties (WP-64): the current status, the
 * agreement and the next step first, and the history below it.
 */
export default async function LoanPage({
  params,
  searchParams,
}: {
  params: Promise<{ loanId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  await requirePageAccount();
  const { loanId } = await params;
  const query = await searchParams;
  const loan = await pageQueryOrNotFound(readLoan, { loanId });
  const history = await collectPages(
    (cursor) => pageQuery(readLoanHistory, { loanId, cursor }),
    ({ entries }) => entries,
    pagesShown(query, historyKey),
  );

  return (
    <main>
      <p className="link-row">
        <Link href="/lan">Alle lån</Link>
      </p>
      <h1>{loan.agreement.title}</h1>
      <LoanStatus loan={loan} />
      <Agreement loan={loan} />
      <History
        loan={loan}
        entries={history.items}
        more={
          history.nextCursor === null
            ? null
            : morePagesHref(loanHref(loan.id), query, historyKey, historyKey)
        }
        open={query[historyKey] !== undefined}
      />
    </main>
  );
}
