import type {
  Loan,
  LoanHistoryEntry,
  LoanLogisticsChannel,
  LoanLogisticsCloseReason,
  LoanReview,
  LoanReviews,
} from "@lanbort/contracts";
import {
  collectPages,
  readLoan,
  readLoanHistory,
  readLoanLogistics,
  readLoanReviews,
} from "@lanbort/domain";
import type { Metadata } from "next";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { StartLoanLogistics } from "@/chat/start-loan-logistics";
import { ActionButton } from "@/components/action-button";
import { CommandForm } from "@/components/command-form";
import { ConfirmAction } from "@/components/confirm-action";
import { describedBy, Field } from "@/components/field";
import { MoreActions } from "@/components/more-actions";
import { PageHeader } from "@/components/page-header";
import { StatusCard } from "@/components/status-card";
import { chatConversationHref } from "@/navigation/chat";
import {
  morePagesHref,
  pagesShown,
  type SearchParams,
} from "@/navigation/list-pages";
import { loanHref } from "@/navigation/routes";
import { hrefFor } from "@/navigation/targets";
import {
  addDays,
  calendarDay,
  formatPeriod,
  formatTime,
} from "@/presentation/dates";
import { describeHistoryEntry } from "@/presentation/loan-history";
import {
  describeLoanStatus,
  loanApi,
  type LoanStep,
  loanSteps,
  loanTone,
  personName,
} from "@/presentation/loan-status";
import { basisNote, hiddenUntil, scoreLines } from "@/presentation/reviews";
import { chatEnabled } from "@/server/env";
import {
  pageQuery,
  pageQueryIfAllowed,
  pageQueryOrNotFound,
  requirePageAccount,
} from "@/server/session";
import { ReviewForm } from "./review-form";

export const metadata: Metadata = { title: "Lån – Lånbort" };

/** The timeline's pages in the address, and the element it is. */
const historyKey = "historikk";

/** The other party, by name (UX-INT-004). */
const otherParty = (loan: Loan) =>
  personName(loan.parties[loan.role === "lender" ? "borrower" : "lender"]);

function Steps({
  steps,
  primary = false,
}: {
  steps: readonly LoanStep[];
  primary?: boolean;
}) {
  return steps.map((step, index) => (
    <ActionButton
      key={`${step.path} ${step.label}`}
      label={step.label}
      path={step.path}
      body={step.body}
      primary={primary && index === 0}
    />
  ));
}

/**
 * PS-LOAN-010: a new period, proposed for the agreement as it is now.
 * Before the handover both days may move, from today on; once it is handed
 * over only the last day does, to a day after today. Nothing changes until
 * the other party accepts it.
 */
function ProposeAmendment({ loan }: { loan: Loan }) {
  const mode = loan.actions.proposeAmendment;

  if (!mode) {
    return null;
  }

  const today = calendarDay();
  const help = `Ingenting endres før ${otherParty(loan)} godtar forslaget.`;
  const endMin = mode === "period" ? today : addDays(today, 1);

  return (
    <details>
      <summary>
        {mode === "period" ? "Foreslå ny periode" : "Foreslå ny returdag"}
      </summary>
      <CommandForm
        path={`${loanApi(loan.id)}/amendments`}
        fixed={{ loanId: loan.id, agreementVersion: loan.agreement.version }}
        submitLabel="Send forslaget"
        done="Forslaget er sendt"
        secondary
        messages={{
          conflict:
            "Tingen er ikke ledig hele den perioden, eller lånet har endret seg. Siden viser nå det som gjelder.",
          invalid_input:
            "Sjekk datoene: perioden må være en annen enn den avtalte, og kan ikke slutte før den starter.",
        }}
      >
        <p className="help">{help}</p>
        {mode === "period" ? (
          <Field id="ny-start" label="Overlevering">
            <input
              id="ny-start"
              name="period.start"
              type="date"
              required
              min={today}
              defaultValue={
                loan.period.start < today ? today : loan.period.start
              }
            />
          </Field>
        ) : (
          <input type="hidden" name="period.start" value={loan.period.start} />
        )}
        <Field id="ny-slutt" label="Leveres tilbake">
          <input
            id="ny-slutt"
            name="period.end"
            type="date"
            required
            min={endMin}
            defaultValue={loan.period.end < endMin ? endMin : loan.period.end}
          />
        </Field>
      </CommandForm>
    </details>
  );
}

/**
 * PS-LOAN-011: either party cancels before the handover, without a reason
 * or the other's consent. The consequence is shown first (UX-INT-007).
 */
function Cancel({ loan }: { loan: Loan }) {
  if (!loan.actions.cancel) {
    return null;
  }

  const title = loan.agreement.title;

  return (
    <ConfirmAction
      label="Avlys lånet"
      title={`Avlyse lånet av ${title}?`}
      consequences={{
        gone: [
          `Avtalen om ${title} ${formatPeriod(loan.period)} avsluttes som avlyst.`,
          "Perioden blir ledig for andre lån.",
        ],
        stays: [
          "Historikken for lånet.",
          "Dere kan begge anmelde kommunikasjonen frem til nå.",
        ],
        affects: [`${otherParty(loan)} får beskjed om at du har avlyst.`],
      }}
      confirmLabel="Avlys lånet"
      path={`${loanApi(loan.id)}/cancel`}
      body={{}}
      danger
    />
  );
}

/**
 * PS-LOAN-009: the responsible lender offers the role to another owner.
 * It moves only when they accept, and, for one who became an owner after
 * the approval, when the borrower agrees too.
 */
function OfferResponsibility({ loan }: { loan: Loan }) {
  const coOwners = loan.actions.offerResponsibility;

  if (coOwners.length === 0) {
    return null;
  }

  const help = `Du er ansvarlig til medeieren godtar. Ble medeieren eier etter at lånet ble godkjent, må også ${personName(loan.parties.borrower)} godta det. Avtalen endres ikke.`;

  return (
    <details>
      <summary>Gi ansvaret til en medeier</summary>
      <CommandForm
        path={`${loanApi(loan.id)}/responsibility`}
        fixed={{ loanId: loan.id }}
        submitLabel="Tilby ansvaret"
        done="Ansvaret er tilbudt"
        secondary
        messages={{
          conflict:
            "Denne medeieren kan ikke ta over ansvaret for lånet nå. Siden viser nå det som gjelder.",
        }}
      >
        <Field id="ny-utlaner" label="Medeier" help={help}>
          <select
            id="ny-utlaner"
            name="toUserId"
            required
            {...describedBy("ny-utlaner", help)}
          >
            {coOwners.map(({ userId, realName }) => (
              <option key={userId} value={userId}>
                {realName}
              </option>
            ))}
          </select>
        </Field>
      </CommandForm>
    </details>
  );
}

/**
 * PS-LOAN-018, UX-EXC-003: when the parties say different things, or the
 * return has waited too long, either asks the environment's administrators
 * to mediate, each with their own account. A mediation that exists is
 * linked once its page does.
 */
function Mediation({ loan }: { loan: Loan }) {
  const { mediation } = loan;
  const caseLink = mediation && hrefFor({ type: "case", id: mediation.caseId });
  const help = `Miljøets administratorer leser det du skriver. ${otherParty(loan)} blir med i saken med sin egen forklaring, og ser din bare hvis en administrator deler den.`;

  return (
    <>
      {mediation && (
        <p>
          {mediation.open
            ? "Miljøets administratorer er bedt om å mekle."
            : "Miljøets administratorer har avsluttet meklingen."}{" "}
          {caseLink && <Link href={caseLink}>Gå til saken</Link>}
        </p>
      )}
      {loan.actions.requestMediation && (
        <details>
          <summary>Be miljøet om hjelp til å avklare</summary>
          <CommandForm
            path={`${loanApi(loan.id)}/mediation`}
            fixed={{ loanId: loan.id }}
            submitLabel="Be om mekling"
            done="Miljøets administratorer er bedt om å mekle"
          >
            <Field id="mekling" label="Hva har skjedd?" help={help}>
              <textarea
                id="mekling"
                name="body"
                required
                maxLength={4000}
                {...describedBy("mekling", help)}
              />
            </Field>
          </CommandForm>
        </details>
      )}
    </>
  );
}

/**
 * The status card (UX-INT-001, UX-INT-004): what the loan waits for and
 * who, its date, and the next step first; the rarer steps under «Flere
 * valg» (UX-INT-009), where a deviation keeps the same place (UX-EXC-001).
 */
function LoanStatus({ loan }: { loan: Loan }) {
  const status = describeLoanStatus(loan);
  const { primary, secondary } = loanSteps(loan);
  const { actions } = loan;
  const more =
    secondary.length > 0 ||
    actions.proposeAmendment !== null ||
    actions.cancel ||
    actions.offerResponsibility.length > 0;

  return (
    <StatusCard
      status={status.text}
      tone={loanTone(loan)}
      when={status.when}
      actions={primary.length > 0 && <Steps steps={primary} primary />}
      more={
        more && (
          <MoreActions>
            <Steps steps={secondary} />
            <Cancel loan={loan} />
            <ProposeAmendment loan={loan} />
            <OfferResponsibility loan={loan} />
          </MoreActions>
        )
      }
    >
      <Mediation loan={loan} />
    </StatusCard>
  );
}

const closedBecause: Record<LoanLogisticsCloseReason, string> = {
  loan_ended: "Samtalen om lånet er stengt fordi lånet er avsluttet.",
  parties_changed:
    "Samtalen om lånet er stengt fordi lånet har fått en annen utlåner.",
  safety:
    "Samtalen om lånet er stengt av sikkerhetshensyn. Bruk valgene for lånet over videre.",
};

/**
 * WP-44 (PS-COM-007, UX-IA): when a block has closed ordinary chat, the
 * parties may still write short practical messages about this loan, in a
 * conversation marked as only for that.
 */
function Logistics({ channel }: { channel: LoanLogisticsChannel }) {
  const open = channel.closedAt === null;

  return (
    <section aria-labelledby="logistikk">
      <h2 id="logistikk">Samtale om lånet</h2>
      <p>
        {open
          ? "Vanlig chat er stengt mellom dere fordi en av dere har blokkert den andre. Dere kan likevel skrive korte meldinger om overlevering, retur, tid, sted og gjenstanden, kun for å avslutte lånet."
          : closedBecause[channel.closeReason ?? "loan_ended"]}
      </p>
      {channel.conversationId ? (
        <p className="link-row">
          <Link href={chatConversationHref(channel.conversationId)}>
            {open ? "Gå til samtalen om lånet" : "Se samtalen om lånet"}
          </Link>
        </p>
      ) : (
        open && (
          <div className="actions">
            <StartLoanLogistics channelId={channel.id} />
          </div>
        )
      )}
    </section>
  );
}

/** What was agreed, as it is now (PS-LOAN-008, PS-LOAN-010). */
function Agreement({ loan }: { loan: Loan }) {
  const lender = loan.role === "lender";

  return (
    <section aria-labelledby="avtalen">
      <h2 id="avtalen">Avtalen</h2>
      <dl className="facts">
        <dt>{lender ? "Du låner bort til" : "Du låner av"}</dt>
        <dd>{otherParty(loan)}</dd>
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

/** A review as its parties see it, with its one response (PS-TRUST-005). */
function Review({
  review,
  heading,
  children,
}: {
  review: LoanReview;
  heading: string;
  children?: ReactNode;
}) {
  return (
    <article aria-label={heading}>
      <h3>{heading}</h3>
      {review.status === "removed" ? (
        <p>Anmeldelsen er fjernet av moderering.</p>
      ) : (
        <>
          <dl className="facts">
            {scoreLines(review).map(({ dimension, label, text }) => (
              <Fragment key={dimension}>
                <dt>{label}</dt>
                <dd>{text}</dd>
              </Fragment>
            ))}
          </dl>
          {review.text && <p className="message-text">{review.text}</p>}
          {review.moderated.textRemoved && (
            <p className="help">Teksten er fjernet av moderering.</p>
          )}
          {review.loanReopenedAt && (
            <p className="help">
              Lånet ble åpnet igjen etter at anmeldelsen ble publisert.
            </p>
          )}
        </>
      )}
      {review.response && (
        <>
          <h4>Tilsvar</h4>
          <p className="message-text">
            {review.response.text ?? "Tilsvaret er fjernet av moderering."}
          </p>
        </>
      )}
      {children}
    </article>
  );
}

/**
 * PS-TRUST-001–005, UX-JRN-010: after the loan ended, each party reviews
 * the other on what could actually be assessed. Their own review stays
 * hidden, and can be revised, until both have reviewed or the deadline;
 * the review of them appears then, and they may respond to it once.
 */
function Reviews({ loan, reviews }: { loan: Loan; reviews: LoanReviews }) {
  const { window, own, received } = reviews;

  if (!window) {
    return null;
  }

  const other = otherParty(loan);
  const open = window.status === "open";
  const note = basisNote(window.basis);
  const respondHelp =
    "Du kan svare én gang. Tilsvaret vises sammen med anmeldelsen og endrer ikke vurderingen.";

  return (
    <section aria-labelledby="anmeldelser">
      <h2 id="anmeldelser">Anmeldelser</h2>
      {window.status === "paused" && (
        <p>
          Lånet er åpnet igjen. Anmeldelsene venter til det er avsluttet på
          nytt.
        </p>
      )}
      {open && <p>{hiddenUntil(reviews, other)}</p>}
      {open && note && <p className="help">{note}</p>}
      {own ? (
        <Review review={own} heading="Din anmeldelse">
          {own.status === "hidden" && open && (
            <details>
              <summary>Endre anmeldelsen</summary>
              <ReviewForm
                loanId={loan.id}
                dimensions={window.dimensions}
                own={own}
              />
            </details>
          )}
        </Review>
      ) : open ? (
        <>
          <h3>Anmeld {other}</h3>
          <ReviewForm
            loanId={loan.id}
            dimensions={window.dimensions}
            own={null}
          />
        </>
      ) : null}
      {received && (
        <Review review={received} heading={`${other} sin anmeldelse av deg`}>
          {!received.response && received.status === "published" && (
            <details>
              <summary>Gi et tilsvar</summary>
              <CommandForm
                path={`${loanApi(loan.id)}/reviews/response`}
                fixed={{ loanId: loan.id }}
                submitLabel="Send tilsvaret"
                secondary
              >
                <Field id="tilsvar" label="Tilsvar" help={respondHelp}>
                  <textarea
                    id="tilsvar"
                    name="text"
                    required
                    maxLength={2000}
                    {...describedBy("tilsvar", respondHelp)}
                  />
                </Field>
              </CommandForm>
            </details>
          )}
        </Review>
      )}
      {window.status === "closed" && !own && !received && (
        <p>Ingen av dere ga en anmeldelse.</p>
      )}
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
 * One loan for one of its parties (WP-64, WP-87): the current status and
 * every step the loan offers, the agreement, the reviews once it has
 * ended, and the history below it. No part of the loan needs another page
 * (UX-JRN-007–010).
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
  // Newest first, and at most one open: the one that matters now.
  const logistics = chatEnabled()
    ? (await pageQuery(readLoanLogistics, { loanId }))?.channels[0]
    : undefined;
  // The reviews are their reviewers': after a change of lender, the former.
  const reviews = await pageQueryIfAllowed(readLoanReviews, { loanId });

  return (
    <main>
      <PageHeader
        title={loan.agreement.title}
        back={{ href: "/lan", label: "Lån" }}
      />
      <LoanStatus loan={loan} />
      {logistics && <Logistics channel={logistics} />}
      <Agreement loan={loan} />
      {reviews && <Reviews loan={loan} reviews={reviews} />}
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
