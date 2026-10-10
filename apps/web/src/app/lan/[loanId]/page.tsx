import {
  type Loan,
  type LoanConditionReports,
  type LoanLogisticsChannel,
  type LoanLogisticsCloseReason,
  type LoanReviews,
  loanIdSchema,
} from "@lanbort/contracts";
import {
  collectPages,
  readLoan,
  readLoanAsCoOwner,
  readLoanConditionReports,
  readLoanHistory,
  readLoanLogistics,
  readLoanReviews,
} from "@lanbort/domain";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { StartLoanLogistics } from "@/chat/start-loan-logistics";
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
import { loansHref } from "@/navigation/areas";
import { loanHref } from "@/navigation/routes";
import { hrefFor } from "@/navigation/targets";
import { addDays, calendarDay, formatPeriod } from "@/presentation/dates";
import {
  describeLoanStatus,
  loanApi,
  loanProgress,
  loanSteps,
  loanTitle,
  otherParty,
  personName,
  proposalDefaults,
} from "@/presentation/loan-status";
import { firstImageHref, loanImageHref } from "@/presentation/object-images";
import { ThingThumbnail } from "@/components/thing-thumbnail";
import { hiddenUntil } from "@/presentation/reviews";
import { chatContactLink } from "@/server/chat-contact";
import { chatEnabled } from "@/server/env";
import {
  pageQuery,
  pageQueryIfAllowed,
  requirePageAccount,
} from "@/server/session";
import styles from "../_parts/loan.module.css";
import { ConditionReports, ReportCondition } from "../_parts/condition";
import { OriginTag } from "../_parts/origin-tag";
import { PeriodFields } from "../_parts/period-fields";
import { Party } from "../_parts/party";
import { Progress } from "../_parts/progress";
import { Steps } from "../_parts/steps";
import { Timeline } from "../_parts/timeline";
import { CoOwnerLoan } from "./co-owner-loan";
import { Reviews, ReviewsOnly } from "./reviews";

export const metadata: Metadata = { title: "Lån – Lånbort" };

/** The timeline's pages in the address, and the element it is. */
const historyKey = "historikk";

/**
 * While the handover is being clarified, a new handover day is proposed
 * from the status card, apart from the answers about what happened
 * (UX-JRN-006, PS-LOAN-012, KF7).
 */
const newHandoverDay = (loan: Loan) =>
  loan.status === "awaiting_handover" &&
  loan.actions.proposeAmendment === "period";

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
  const shown = proposalDefaults(loan.period, mode, today);

  return (
    <details>
      <summary>
        {newHandoverDay(loan)
          ? "Foreslå ny overleveringsdag"
          : mode === "period"
            ? "Foreslå ny periode"
            : "Foreslå ny returdag"}
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
          <PeriodFields defaults={shown} min={today} />
        ) : (
          <>
            <input
              type="hidden"
              name="period.start"
              value={loan.period.start}
            />
            <Field id="ny-slutt" label="Leveres tilbake">
              <input
                id="ny-slutt"
                name="period.end"
                type="date"
                required
                min={addDays(today, 1)}
                defaultValue={shown.end}
              />
            </Field>
          </>
        )}
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
      label="Kanseller lånet"
      icon="close"
      title="Kansellere lånet?"
      consequences={{
        gone: [
          `Avtalen om ${title} ${formatPeriod(loan.period)} avsluttes som kansellert.`,
          "Perioden blir ledig for andre lån.",
        ],
        stays: [
          "Tidslinjen for lånet.",
          "Dere kan begge anmelde kommunikasjonen fram til nå.",
        ],
        affects: [
          `${otherParty(loan)} får varsel om at du har kansellert. Du trenger ikke oppgi noen grunn.`,
          "Det kan ikke angres.",
        ],
      }}
      confirmLabel="Kanseller lånet"
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
 * The status card (UX-INT-001, UX-INT-004, KF7): the situation in words,
 * who it waits on, what to know about it and the next step first. When
 * the loan has ended and the reader can still review, the way to the
 * review is here too (UX-JRN-010).
 */
function LoanStatus({
  loan,
  reviews,
}: {
  loan: Loan;
  reviews: LoanReviews | null;
}) {
  const situation = describeLoanStatus(loan, calendarDay());
  const { primary } = loanSteps(loan);
  const review =
    reviews?.window?.status === "open" && !reviews.own ? reviews : null;

  return (
    <StatusCard
      status={situation.headline}
      tone={situation.tone}
      label={situation.label}
      actions={
        (primary.length > 0 || newHandoverDay(loan)) && (
          <>
            {primary.length > 0 && (
              <div className={styles.answers}>
                <Steps steps={primary} />
              </div>
            )}
            {newHandoverDay(loan) && <ProposeAmendment loan={loan} />}
          </>
        )
      }
    >
      {situation.body.map((text) => (
        <p key={text} className={styles.body}>
          {text}
        </p>
      ))}
      <Mediation loan={loan} />
      {review && (
        <>
          <p>
            <a className="button button-secondary" href="#anmeldelser">
              Anmeld {personName(review.counterpart)}
            </a>
          </p>
          <p className="help">
            {hiddenUntil(review, personName(review.counterpart))}
          </p>
        </>
      )}
    </StatusCard>
  );
}

/**
 * The rarer steps (UX-INT-009), below the agreement and the other party
 * as in KF7: only what the loan offers now.
 */
function LoanMoreActions({
  loan,
  condition,
}: {
  loan: Loan;
  /** What was registered as damage, deficiency or loss (PS-LOAN-023). */
  condition: LoanConditionReports | null;
}) {
  const { secondary } = loanSteps(loan);
  const mayReport = condition?.mayReport ?? false;
  const { actions } = loan;

  const proposes = actions.proposeAmendment !== null && !newHandoverDay(loan);

  if (
    !mayReport &&
    secondary.length === 0 &&
    !proposes &&
    !actions.cancel &&
    actions.offerResponsibility.length === 0
  ) {
    return null;
  }

  return (
    <MoreActions>
      <Steps steps={secondary} />
      {proposes && <ProposeAmendment loan={loan} />}
      <OfferResponsibility loan={loan} />
      {condition?.mayReport && (
        <ReportCondition
          // Each report is a new command with its own idempotency key:
          // the form starts over once the page shows the last one.
          key={condition.reports.length}
          path={loanApi(loan.id)}
          loanId={loan.id}
          other={otherParty(loan)}
        />
      )}
      <Cancel loan={loan} />
    </MoreActions>
  );
}

const closedBecause: Record<LoanLogisticsCloseReason, string> = {
  loan_ended: "Samtalen om lånet er stengt fordi lånet er avsluttet.",
  parties_changed:
    "Samtalen om lånet er stengt fordi lånet har fått en annen utlåner.",
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
  return (
    <section className={styles.flat} aria-label="Avtalen">
      <dl className="facts">
        <dt>Periode</dt>
        <dd>{formatPeriod(loan.period)}</dd>
        <dt>Vilkår</dt>
        <dd>{loan.agreement.loanTerms ?? "Ingen egne vilkår"}</dd>
        <dt>Beskrivelse</dt>
        <dd>{loan.agreement.description}</dd>
      </dl>
    </section>
  );
}

/**
 * One loan for one of its parties (WP-64, WP-87, KF7): the loan's steps,
 * the status and every step the loan offers, the agreement and the other
 * party, the reviews once it has ended, and the timeline, which a wider
 * screen shows beside the rest. No part of the loan needs another page
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

  if (!loanIdSchema.safeParse(loanId).success) {
    notFound();
  }

  const query = await searchParams;
  const loan = await pageQueryIfAllowed(readLoan, { loanId });

  // Not a party: a co-owner who may see it gets the restricted view
  // (UX-PRIV-013), and a former party of its reviews, such as the lender
  // before a change, keeps those reviews; to anyone else it does not exist.
  if (!loan) {
    const [view, reviews] = await Promise.all([
      pageQueryIfAllowed(readLoanAsCoOwner, { loanId }),
      pageQueryIfAllowed(readLoanReviews, { loanId }),
    ]);
    const shown = reviews && <Reviews reviews={reviews} />;

    if (view) return <CoOwnerLoan view={view}>{shown}</CoOwnerLoan>;
    if (reviews) return <ReviewsOnly reviews={reviews}>{shown}</ReviewsOnly>;
    notFound();
  }
  const [history, logistics, reviews, condition, contact] = await Promise.all([
    collectPages(
      (cursor) => pageQuery(readLoanHistory, { loanId, cursor }),
      ({ entries }) => entries,
      pagesShown(query, historyKey),
    ),
    // Newest first, and at most one open: the one that matters now.
    chatEnabled()
      ? pageQuery(readLoanLogistics, { loanId }).then(
          (result) => result?.channels[0],
        )
      : undefined,
    // The reviews are their reviewers': after a change of lender, the former.
    pageQueryIfAllowed(readLoanReviews, { loanId }),
    pageQueryIfAllowed(readLoanConditionReports, { loanId }),
    // The server decides: a block closes it, and the logistics channel
    // (WP-44) is the way left then.
    chatContactLink(
      loan.role === "lender" ? loan.borrowerUserId : loan.responsibleLenderId,
      { kind: "loan_request", requestId: loan.requestId },
    ),
  ]);
  const other = loan.role === "lender" ? "borrower" : "lender";

  return (
    <main className="main-wide">
      <PageHeader
        kind="Lån"
        picture={
          <ThingThumbnail
            src={firstImageHref(loan.images, (imageId) =>
              loanImageHref(loan.id, imageId),
            )}
            size="title"
            placeholder
          />
        }
        title={loanTitle(loan)}
        back={{ href: loansHref, label: "Lån" }}
        context={<OriginTag origin={loan.origin} />}
      />
      <Progress progress={loanProgress(loan)} />
      <div className={styles.layout}>
        <div className={styles.column}>
          <LoanStatus loan={loan} reviews={reviews} />
          {condition && (
            <ConditionReports
              path={loanApi(loan.id)}
              loanId={loan.id}
              condition={condition}
            />
          )}
          {logistics && <Logistics channel={logistics} />}
          <Agreement loan={loan} />
          <Party person={loan.parties[other]} role={other} contact={contact} />
          <LoanMoreActions loan={loan} condition={condition} />
          {reviews && <Reviews reviews={reviews} />}
        </div>
        <div className={styles.column}>
          <Timeline
            id={historyKey}
            title={loan.agreement.title}
            entries={history.items}
            more={
              history.nextCursor === null
                ? null
                : morePagesHref(
                    loanHref(loan.id),
                    query,
                    historyKey,
                    historyKey,
                  )
            }
            open={query[historyKey] !== undefined}
          />
        </div>
      </div>
    </main>
  );
}
