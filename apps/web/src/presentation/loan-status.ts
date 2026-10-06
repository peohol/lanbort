import type {
  HandoverOutcome,
  Loan,
  LoanRequestRole,
  ReturnOutcome,
} from "@lanbort/contracts";
import { formatDay, formatPeriod, formatTime } from "./dates";
import { loanEndReasonLabels } from "./loans";
import { personName } from "./people";

export { personName };

const otherSide = (role: LoanRequestRole): LoanRequestRole =>
  role === "borrower" ? "lender" : "borrower";

/** The current status and the time it is about (UX-IA-008). */
export interface LoanStatusText {
  readonly text: string;
  readonly when: string | null;
}

/** Whether what the parties disagree about is the return, not the handover. */
const aboutReturn = (loan: Loan) =>
  loan.return.borrower !== null || loan.return.lender !== null;

/**
 * UX-INT-004, UX-P04: the loan's status as a situation, naming who or what
 * it waits for, never an internal status. An open proposal comes first,
 * because it is what the loan waits for now.
 */
export function describeLoanStatus(loan: Loan): LoanStatusText {
  const own = loan.role;
  const other = personName(loan.parties[otherSide(own)]);
  const title = loan.agreement.title;
  const { amendment, ending } = loan;
  const transfer = loan.responsibilityTransfer;

  if (ending) {
    const by =
      ending.endedBy === null
        ? ""
        : ending.endedBy === own
          ? " av deg"
          : ` av ${other}`;
    const control =
      loan.control?.confirmedAt === null
        ? own === "lender"
          ? `. Bekreft når du har ${title} igjen`
          : `. Venter på at ${other} bekrefter å ha ${title} igjen`
        : "";

    return {
      text: `${loanEndReasonLabels[ending.reason]}${by}${control}`,
      when: formatTime(ending.endedAt),
    };
  }

  if (amendment) {
    const period = formatPeriod(amendment.period);

    return amendment.proposedBy === own
      ? {
          text: `Venter på at ${other} svarer på forslaget om ny periode: ${period}`,
          when: null,
        }
      : { text: `${other} foreslår ny periode: ${period}`, when: null };
  }

  if (transfer && !transfer.recipientAccepted) {
    return {
      text: "Venter på at en medeier godtar å bli ansvarlig utlåner",
      when: null,
    };
  }

  if (transfer?.needsBorrowerConsent && !transfer.borrowerConsented) {
    return own === "borrower"
      ? {
          text: "En medeier vil bli ansvarlig utlåner. Svar på om du godtar det",
          when: null,
        }
      : {
          text: `Venter på at ${other} godtar den nye ansvarlige utlåneren`,
          when: null,
        };
  }

  // The caller's own confirmation in its undo buffer, at any point of the
  // return (also an early one, PS-LOAN-016/020).
  if (loan.return.pending) {
    return {
      text:
        loan.return.pending.outcome === "received"
          ? `Du har bekreftet at du har fått tilbake ${title}`
          : "Du har bekreftet returen",
      // Only while the server still offers to undo it: once its time is
      // over it counts as made.
      when: loan.actions.undoReturn
        ? `Du kan angre til ${formatTime(loan.return.pending.effectiveAt)}`
        : null,
    };
  }

  const start = formatDay(loan.period.start);
  const end = formatDay(loan.period.end);

  switch (loan.status) {
    case "reserved":
      return {
        text:
          own === "lender"
            ? `Avtalt: du låner bort ${title} til ${other}`
            : `Avtalt: du låner ${title} av ${other}`,
        when: `Overlevering ${start}`,
      };
    case "awaiting_handover":
      if (loan.handover[own] === null) {
        return { text: `Fortell om ${title} ble overlevert`, when: start };
      }

      return {
        text: `Venter på at ${other} forteller om overleveringen`,
        when: loan.handover.answerDueAt
          ? `Svarfrist ${formatTime(loan.handover.answerDueAt)}`
          : null,
      };
    case "active":
      return {
        text:
          own === "lender"
            ? `Utlånt til ${other}`
            : `Du har lånt ${title} av ${other}`,
        when: `Leveres tilbake ${end}`,
      };
    case "awaiting_return":
      if (loan.return[own] === null) {
        return {
          text:
            own === "lender"
              ? `Bekreft om du har fått tilbake ${title}`
              : `Fortell om du har levert tilbake ${title}`,
          when: end,
        };
      }

      return {
        text:
          own === "lender"
            ? `Venter på at ${other} forteller om returen`
            : `Venter på at ${other} bekrefter at ${title} er levert tilbake`,
        when: end,
      };
    case "late":
      return {
        text:
          own === "lender"
            ? `${other} har ikke levert tilbake ${title} ennå`
            : `Forsinket: ${title} skulle vært levert tilbake`,
        when: `Avtalt retur ${end}`,
      };
    case "disputed":
      return {
        text: `Dere har sagt ulike ting om ${aboutReturn(loan) ? "returen" : "overleveringen"}. Avklar det med ${other}`,
        when: null,
      };
    case "ended":
      return { text: "Avsluttet", when: null };
  }
}

/** A step the caller can take, as one API command (UX-INT-001). */
export interface LoanStep {
  readonly label: string;
  readonly path: string;
  readonly body: object;
}

const handoverLabels: Record<HandoverOutcome, (title: string) => string> = {
  handed_over: (title) => `${title} er overlevert`,
  not_handed_over: (title) => `${title} ble ikke overlevert`,
};

const returnLabels: Record<ReturnOutcome, (title: string) => string> = {
  returned: (title) => `Jeg har levert tilbake ${title}`,
  still_has: (title) => `Jeg har fortsatt ${title}`,
  received: (title) => `Jeg har fått tilbake ${title}`,
  not_received: (title) => `Jeg har ikke fått tilbake ${title}`,
};

/**
 * The steps the domain offers the caller (`loan.actions`), worded as what
 * each does (UX-INT-003). The ones that belong to where the loan is now are
 * primary; the rest, such as contradicting a handover after the loan
 * started or a problem with a confirmed return (PS-LOAN-017), are kept
 * apart but easy to find (UX-INT-009).
 */
export function loanSteps(loan: Loan): {
  primary: LoanStep[];
  secondary: LoanStep[];
} {
  const api = `/api/loans/${loan.id}`;
  const title = loan.agreement.title;
  const { actions, amendment } = loan;
  const transfer = loan.responsibilityTransfer;
  const agreementVersion = loan.agreement.version;
  const handoverPhase =
    loan.status === "reserved" ||
    loan.status === "awaiting_handover" ||
    (loan.status === "disputed" && !aboutReturn(loan));

  const answers = actions.amendment.flatMap((answer) =>
    amendment
      ? [
          {
            label:
              answer === "accept"
                ? `Godta ny periode: ${formatPeriod(amendment.period)}`
                : "Behold avtalt periode",
            path: `${api}/amendments/${amendment.id}/${answer}`,
            body: {},
          },
        ]
      : [],
  );
  const consent = actions.responsibility.flatMap((answer) =>
    transfer
      ? [
          {
            label:
              answer === "accept"
                ? "Godta ny ansvarlig utlåner"
                : "Ikke godta ny ansvarlig utlåner",
            path: `${api}/responsibility/${transfer.id}/${answer}`,
            body: {},
          },
        ]
      : [],
  );
  const handover = actions.handover.map((outcome) => ({
    label: handoverLabels[outcome](title),
    path: `${api}/handover`,
    body: { agreementVersion, outcome },
  }));
  const returns = actions.return.map((outcome) => ({
    label: returnLabels[outcome](title),
    path: `${api}/return`,
    body: { agreementVersion, outcome },
  }));
  const undo = actions.undoReturn
    ? [{ label: "Angre bekreftelsen", path: `${api}/return/undo`, body: {} }]
    : [];
  const control = actions.confirmControl
    ? [
        {
          label: `Jeg har ${title} igjen`,
          path: `${api}/control`,
          body: {},
        },
      ]
    : [];
  const ended = loan.status === "ended";

  return {
    primary: [
      ...answers,
      ...consent,
      ...undo,
      ...control,
      ...(handoverPhase ? handover : []),
      ...(ended ? [] : returns),
    ],
    secondary: [...(handoverPhase ? [] : handover), ...(ended ? returns : [])],
  };
}
