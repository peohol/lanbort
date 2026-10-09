import type { CoOwnerLoanView } from "@lanbort/contracts";
import { loansHref } from "@/navigation/areas";
import { formatDay, formatPeriod, formatTime } from "./dates";
import {
  endingLabels,
  type LoanProgress,
  type LoanSituation,
  type LoanStep,
  loanApi,
  personName,
  progressOf,
  sentence,
  unresolvedNote,
} from "./loan-status";

/**
 * A loan as a co-owner who is not its party sees it (UX-PRIV-013, KF7):
 * from the owners' side, like the lender, but about the parties rather
 * than to them. They see the status, the period, the terms and who the
 * parties are, and only their own steps.
 */

/** «Stige til Ola», as the owners' side calls it. */
export const coOwnerLoanTitle = (view: CoOwnerLoanView) =>
  `${view.title} til ${personName(view.parties.borrower)}`;

/**
 * Where the loan is on its way. What a party said is not the co-owner's to
 * know, so a disagreement or an unresolved ending has no step.
 */
export const coOwnerProgress = (view: CoOwnerLoanView): LoanProgress | null =>
  progressOf({
    status: view.status,
    endReason: view.ending?.reason ?? null,
    aboutReturn: null,
    pendingReturn: false,
  });

/** The offer of the lender's role to the reader, while they may answer it. */
function offerSituation(view: CoOwnerLoanView): LoanSituation | null {
  const transfer = view.responsibilityTransfer;

  if (!transfer) return null;

  const borrower = personName(view.parties.borrower);
  const lender = personName(view.parties.lender);

  if (view.actions.responsibility.length > 0) {
    return {
      label: "Venter på deg",
      tone: "attention",
      headline: `${lender} spør om du vil bli ansvarlig utlåner`,
      body: [
        `Du tar over ${lender} sin plass i lånet til ${borrower}. Avtalen endres ikke: perioden er ${formatPeriod(view.period)}, og vilkårene er de samme. Du blir den som bekrefter returen og svarer på forslag.`,
        ...(transfer.needsBorrowerConsent
          ? [
              `Du ble medeier etter at lånet ble godkjent, så ${borrower} må også godta det.`,
            ]
          : []),
      ],
    };
  }

  if (transfer.needsBorrowerConsent && !transfer.borrowerConsented) {
    return {
      label: `Venter på ${borrower}`,
      tone: "waiting",
      headline: `Venter på at ${borrower} godtar deg som ansvarlig utlåner`,
      body: [
        `Du ble medeier etter at lånet ble godkjent, så ${borrower} må godta byttet. Til da er ${lender} ansvarlig. Avtalen endres ikke.`,
      ],
    };
  }

  return null;
}

function endedSituation(view: CoOwnerLoanView): LoanSituation | null {
  const { ending } = view;

  if (!ending) return null;

  const title = view.title;

  switch (ending.reason) {
    case "returned":
      return {
        ...endingLabels.returned,
        headline: "Lånet er avsluttet",
        body: [
          `Det ble bekreftet ${formatTime(ending.endedAt)} at ${title} er tilbake.`,
        ],
      };
    case "cancelled":
      return {
        ...endingLabels.cancelled,
        headline: "Lånet er kansellert",
        body: [
          `${sentence(title)} ble ikke overlevert, og ${formatPeriod(view.period)} er ledig igjen.`,
        ],
      };
    case "stopped":
      return {
        ...endingLabels.stopped,
        headline: "Lånet kan ikke gjennomføres",
        body: [
          "Lånet er stoppet på grunn av en plattformbegrensning. Ingen av partene har kansellert det.",
        ],
      };
    case "not_completed":
      return {
        ...endingLabels.not_completed,
        headline: "Lånet ble ikke gjennomført",
        body: ["Overleveringen skjedde ikke, så lånet ble aldri aktivt."],
      };
    case "unresolved":
      return view.actions.confirmControl
        ? {
            label: "Venter på deg",
            tone: "attention",
            headline: `Bekreft når du har ${title} igjen`,
            body: [
              unresolvedNote,
              `${sentence(title)} kan ikke lånes ut igjen før en av eierne har bekreftet å ha den.`,
            ],
          }
        : {
            ...endingLabels.unresolved,
            headline: "Lånet er avsluttet uten avklaring",
            body: [unresolvedNote],
          };
  }
}

/**
 * UX-INT-004: the loan's situation for a co-owner on `today`. Their own
 * answer comes first; otherwise what the parties are at, without what
 * either of them said.
 */
export function describeCoOwnerLoan(
  view: CoOwnerLoanView,
  today: string,
): LoanSituation {
  const first = endedSituation(view) ?? offerSituation(view);

  if (first) return first;

  const title = view.title;
  const borrower = personName(view.parties.borrower);
  const lender = personName(view.parties.lender);
  const end = formatDay(view.period.end);
  const responsible = `${lender} er ansvarlig utlåner.`;

  switch (view.status) {
    case "reserved":
      return {
        label: view.period.start === today ? "I dag" : "Avtalt",
        tone: "positive",
        headline: `${sentence(title)} er reservert for ${borrower}`,
        body: [
          `${borrower} henter ${title} ${formatDay(view.period.start)}. ${responsible}`,
        ],
      };
    case "awaiting_handover":
      return {
        label: "Avklares",
        tone: "waiting",
        headline: "Overleveringen avklares",
        body: [`${lender} og ${borrower} avklarer om ${title} ble overlevert.`],
      };
    case "active":
      return {
        label: `Hos ${borrower}`,
        tone: "waiting",
        headline: `${sentence(title)} er hos ${borrower} til ${end}`,
        body: [`${responsible} ${lender} bekrefter når ${title} er tilbake.`],
      };
    case "awaiting_return":
      return {
        label: "Retur",
        tone: "waiting",
        headline: "Returen avklares",
        body: [`${lender} og ${borrower} avklarer returen av ${title}.`],
      };
    case "late":
      return {
        label: "Forsinket",
        tone: "warning",
        headline: `${sentence(title)} skulle vært levert tilbake ${end}`,
        body: [`${lender} og ${borrower} avklarer returen.`],
      };
    case "disputed":
      return {
        label: "Uenighet",
        tone: "warning",
        headline: `${lender} og ${borrower} er uenige om lånet`,
        body: ["Lånbort tar ikke stilling til hvem som har rett."],
      };
    case "ended":
      return {
        label: "Avsluttet",
        tone: "neutral",
        headline: "Lånet er avsluttet",
        body: [],
      };
  }
}

/**
 * The co-owner's own steps (PS-LOAN-009, PS-LOAN-019): answering the offer
 * of the lender's role, and confirming having the object back after an
 * unresolved ending. Saying no is as easy as saying yes; after it, the
 * loan may no longer be theirs to see, so it leads back to the loans.
 */
export function coOwnerSteps(view: CoOwnerLoanView): LoanStep[] {
  const api = loanApi(view.id);
  const transfer = view.responsibilityTransfer;
  const answers = transfer
    ? view.actions.responsibility.map((answer) =>
        answer === "accept"
          ? {
              label: "Bli ansvarlig utlåner",
              path: `${api}/responsibility/${transfer.id}/accept`,
              body: {},
              primary: true,
            }
          : {
              label: "Si nei",
              path: `${api}/responsibility/${transfer.id}/decline`,
              body: {},
              next: loansHref,
            },
      )
    : [];
  const control = view.actions.confirmControl
    ? [
        {
          label: `Jeg har ${view.title} igjen`,
          path: `${api}/control`,
          body: {},
          primary: true,
        },
      ]
    : [];

  return [...answers, ...control];
}
