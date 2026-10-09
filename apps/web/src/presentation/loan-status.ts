import type {
  HandoverOutcome,
  Loan,
  LoanRequestRole,
  ReturnOutcome,
} from "@lanbort/contracts";
import type { IconName } from "@/components/icon";
import type { Tone } from "@/components/tag";
import {
  formatDay,
  formatPeriod,
  formatShortPeriod,
  formatTime,
} from "./dates";
import { personName } from "./people";

/** Where the loan's commands are in the API. */
export const loanApi = (loanId: string) => `/api/loans/${loanId}`;

export { personName };

const otherSide = (role: LoanRequestRole): LoanRequestRole =>
  role === "borrower" ? "lender" : "borrower";

/** The other party, by name (UX-INT-004). */
export const otherParty = (loan: Loan) =>
  personName(loan.parties[otherSide(loan.role)]);

/** A sentence starts with a capital, whatever the thing is called. */
const sentence = (text: string) =>
  text.charAt(0).toLocaleUpperCase("nb-NO") + text.slice(1);

/**
 * The loan's title from the reader's side (KF7): «Stige til Ola» for the
 * lender, «Stige fra Kari» for the borrower.
 */
export function loanTitle(loan: Loan): string {
  return loan.role === "lender"
    ? `${loan.agreement.title} til ${personName(loan.parties.borrower)}`
    : `${loan.agreement.title} fra ${personName(loan.parties.lender)}`;
}

/** Whether what the parties disagree about is the return, not the handover. */
const aboutReturn = (loan: Loan) =>
  loan.return.borrower !== null || loan.return.lender !== null;

/**
 * The open proposal changes only the return day (an extension, or an
 * earlier return), not when it is handed over.
 */
const returnDayOnly = (loan: Loan) =>
  loan.amendment !== null && loan.amendment.period.start === loan.period.start;

/**
 * A change of the responsible lender is the lender's and the co-owner's
 * business until the borrower has to answer it (KF7): nothing changes for
 * the borrower before that.
 */
const visibleTransfer = (loan: Loan) => {
  const transfer = loan.responsibilityTransfer;

  return transfer && (loan.role === "lender" || transfer.needsBorrowerConsent)
    ? transfer
    : null;
};

/**
 * The loan's situation as the status card says it (UX-INT-001, UX-INT-004,
 * KF1 v2, KF7): a short label for who or what it waits on, a headline that
 * says the situation in words, and what to know about it. Never an
 * internal status, and never whose fault anything is (UX-EXC-002).
 */
export interface LoanSituation {
  /** «Venter på deg», «Avtalt», «Hos Ola»: said beside the tone's icon. */
  readonly label: string;
  readonly tone: Tone;
  /** Another icon than the tone's (`Tag`), or none. */
  readonly icon?: IconName | null;
  readonly headline: string;
  readonly body: readonly string[];
}

const handoverPhrases: Record<HandoverOutcome, (title: string) => string> = {
  handed_over: (title) => `${title} ble overlevert`,
  not_handed_over: () => "overleveringen ikke skjedde",
};

const returnPhrases: Record<ReturnOutcome, (title: string) => string> = {
  returned: (title) => `${title} er levert tilbake`,
  still_has: (title) => `${title} ikke er levert tilbake ennå`,
  received: (title) => `${title} er kommet tilbake`,
  not_received: (title) => `${title} ikke er kommet tilbake`,
};

/** What each party said, as people would retell it (UX-EXC-002). */
function statements(loan: Loan): string[] {
  const title = loan.agreement.title;
  const other = otherParty(loan);
  const said = (role: LoanRequestRole) => {
    const statement = aboutReturn(loan)
      ? loan.return[role] && returnPhrases[loan.return[role].outcome](title)
      : loan.handover[role] &&
        handoverPhrases[loan.handover[role].outcome](title);

    return statement
      ? `${role === loan.role ? "Du" : other} sa at ${statement}.`
      : null;
  };

  return [said(loan.role), said(otherSide(loan.role))].filter(
    (text) => text !== null,
  );
}

function endedSituation(loan: Loan): LoanSituation | null {
  const { ending } = loan;

  if (!ending) return null;

  const own = loan.role;
  const other = otherParty(loan);
  const title = loan.agreement.title;
  const by =
    ending.endedBy === null ? null : ending.endedBy === own ? "Du" : other;

  switch (ending.reason) {
    case "returned":
      return {
        label: "Avsluttet",
        tone: "positive",
        headline: "Lånet er avsluttet",
        body: [
          `${by ?? "En medeier"} bekreftet ${formatTime(ending.endedAt)} at ${title} er tilbake.`,
        ],
      };
    case "cancelled":
      return {
        label: "Kansellert",
        tone: "neutral",
        icon: "close",
        headline: by ? `${by} kansellerte lånet` : "Lånet er kansellert",
        body: [
          `${sentence(title)} ble ikke overlevert, og ${formatPeriod(loan.period)} er ledig igjen.`,
        ],
      };
    case "stopped":
      return {
        label: "Stanset",
        tone: "neutral",
        icon: "info",
        headline: "Lånet kan ikke gjennomføres",
        body: [
          "Lånet er stoppet på grunn av en plattformbegrensning. Ingen av dere har kansellert det, og det teller ikke som at noen uteble.",
        ],
      };
    case "not_completed":
      return {
        label: "Ikke gjennomført",
        tone: "neutral",
        icon: "info",
        headline: "Lånet ble ikke gjennomført",
        body: [
          "Overleveringen skjedde ikke, så lånet ble aldri aktivt. Tidslinjen viser hva hver av dere sa.",
        ],
      };
    case "unresolved": {
      const waiting = loan.control?.confirmedAt === null;
      const body = [
        "Lånet ble avsluttet uten avklaring. Det sier ingenting om hva som skjedde, eller om hvem som har rett.",
      ];

      if (waiting && own === "lender") {
        return {
          label: "Venter på deg",
          tone: "attention",
          headline: `Bekreft når du har ${title} igjen`,
          body: [
            ...body,
            `${sentence(title)} kan ikke lånes ut igjen før du har bekreftet at du har den.`,
          ],
        };
      }

      return {
        label: waiting ? `Venter på ${other}` : "Avsluttet uavklart",
        tone: waiting ? "waiting" : "neutral",
        headline: "Lånet er avsluttet uten avklaring",
        body: waiting
          ? [...body, `Venter på at ${other} bekrefter å ha ${title} igjen.`]
          : body,
      };
    }
  }
}

function amendmentSituation(loan: Loan): LoanSituation | null {
  const { amendment } = loan;

  if (!amendment) return null;

  const other = otherParty(loan);
  const what = returnDayOnly(loan)
    ? `ny returdag: ${formatDay(amendment.period.end)}`
    : `ny periode: ${formatPeriod(amendment.period)}`;
  const agreed = formatPeriod(loan.period);

  if (amendment.proposedBy === loan.role) {
    return {
      label: `Venter på ${other}`,
      tone: "waiting",
      headline: `Du har foreslått ${what}`,
      body: [
        `Ingenting endres før ${other} godtar. Til da gjelder avtalen som før: ${agreed}.`,
      ],
    };
  }

  return {
    label: "Venter på deg",
    tone: "attention",
    headline: `${other} foreslår ${what}`,
    body: loan.actions.amendment.includes("accept")
      ? [
          `Avtalt nå: ${agreed}. Godtar du, gjelder den nye avtalen for dere begge.`,
        ]
      : [
          `Forslaget kan ikke godtas nå. Sier du nei, gjelder avtalen som før: ${agreed}.`,
        ],
  };
}

function transferSituation(loan: Loan): LoanSituation | null {
  const transfer = visibleTransfer(loan);

  if (!transfer) return null;

  const borrower = personName(loan.parties.borrower);
  const lender = personName(loan.parties.lender);

  if (loan.role === "borrower") {
    if (transfer.borrowerConsented) return null;

    return {
      label: "Venter på deg",
      tone: "attention",
      headline: `${lender} vil gi ansvaret for lånet til en medeier`,
      body: [
        "Medeieren ble eier etter at lånet ble godkjent. Derfor skjer det bare hvis du godtar. Avtalen endres ikke.",
      ],
    };
  }

  if (!transfer.recipientAccepted) {
    return {
      label: "Venter på medeieren",
      tone: "waiting",
      headline: "Du har spurt en medeier om å bli ansvarlig utlåner",
      body: [
        transfer.needsBorrowerConsent
          ? `Du er ansvarlig til medeieren godtar. Medeieren ble eier etter at lånet ble godkjent, så ${borrower} må også godta det. Avtalen endres ikke.`
          : `Du er ansvarlig til medeieren godtar. Avtalen med ${borrower} endres ikke, og ${borrower} får beskjed først når ansvaret er flyttet.`,
      ],
    };
  }

  if (transfer.needsBorrowerConsent && !transfer.borrowerConsented) {
    return {
      label: `Venter på ${borrower}`,
      tone: "waiting",
      headline: `Venter på at ${borrower} godtar den nye ansvarlige utlåneren`,
      body: [
        `Medeieren ble eier etter at lånet ble godkjent, så ${borrower} må godta byttet. Avtalen endres ikke.`,
      ],
    };
  }

  return null;
}

/**
 * The caller's own return confirmation in its undo buffer, at any point of
 * the return (also an early one, PS-LOAN-016/020).
 */
function pendingReturnSituation(loan: Loan): LoanSituation | null {
  const { pending } = loan.return;

  if (!pending) return null;

  const title = loan.agreement.title;

  return {
    label: "Retur bekreftet",
    tone: "positive",
    headline:
      pending.outcome === "received"
        ? `Du har bekreftet at du har fått tilbake ${title}`
        : `Du har meldt ${title} returnert`,
    // Only while the server still offers to undo it: once its time is over
    // it counts as made.
    body: loan.actions.undoReturn
      ? [`Du kan angre til ${formatTime(pending.effectiveAt)}.`]
      : [],
  };
}

function handoverSituation(loan: Loan, today: string): LoanSituation {
  const own = loan.role;
  const other = otherParty(loan);
  const title = loan.agreement.title;
  const start = formatDay(loan.period.start);
  const lender = own === "lender";

  if (loan.status === "reserved") {
    if (loan.period.start === today) {
      return {
        label: "I dag",
        tone: "attention",
        icon: "calendar",
        headline: lender
          ? `I dag gir du ${title} til ${other}`
          : `I dag henter du ${title}`,
        body: [
          lender
            ? `Bekreft når ${other} har fått ${title}. Det holder at én av dere bekrefter. Da er lånet aktivt.`
            : `Bekreft når du har fått ${title}. Det holder at én av dere bekrefter. Da er lånet aktivt.`,
        ],
      };
    }

    return {
      label: "Avtalt",
      tone: "positive",
      headline: lender
        ? `${sentence(title)} er reservert for ${other}`
        : `${sentence(title)} er reservert for deg`,
      body: [
        lender
          ? `${other} henter ${title} ${start}. Hvor og når på dagen avtaler dere selv.`
          : `Du henter ${title} ${start}. Hvor og når på dagen avtaler dere selv.`,
      ],
    };
  }

  const mine = loan.handover[own];
  const theirs = loan.handover[otherSide(own)];
  const due = loan.handover.answerDueAt;

  if (mine === null && theirs === null) {
    return {
      label: "Avklares",
      tone: "attention",
      headline: `Ble ${title} overlevert?`,
      body: [
        `${sentence(start)} har passert, og ingen av dere har registrert overleveringen.`,
      ],
    };
  }

  if (mine === null) {
    return {
      label: "Venter på deg",
      tone: "attention",
      headline: `${other} sier at overleveringen ikke skjedde`,
      body: due
        ? [
            `Svar innen ${formatTime(due)}. Uten svar avsluttes lånet som ikke gjennomført.`,
          ]
        : [],
    };
  }

  return {
    label: `Venter på ${other}`,
    tone: "waiting",
    headline: `Venter på at ${other} forteller om overleveringen`,
    body: due
      ? [
          `Du sa at overleveringen ikke skjedde. Svarer ikke ${other} innen ${formatTime(due)}, avsluttes lånet som ikke gjennomført.`,
        ]
      : [],
  };
}

function returnSituation(loan: Loan): LoanSituation {
  const own = loan.role;
  const other = otherParty(loan);
  const title = loan.agreement.title;
  const end = formatDay(loan.period.end);
  const lender = own === "lender";
  const mine = loan.return[own];
  const theirs = loan.return[otherSide(own)];

  if (mine) {
    return {
      label: `Venter på ${other}`,
      tone: "waiting",
      headline: lender
        ? `Venter på at ${other} forteller om returen`
        : `Venter på at ${other} bekrefter retur`,
      body: [
        lender
          ? `Du sa at ${returnPhrases[mine.outcome](title)}.`
          : `Du meldte ${title} returnert ${formatTime(mine.reportedAt)}. Lånet er avsluttet når ${other} har bekreftet mottaket.`,
      ],
    };
  }

  if (theirs) {
    return {
      label: "Venter på deg",
      tone: "attention",
      headline:
        theirs.outcome === "returned"
          ? `${other} har meldt ${title} returnert`
          : `${other} sier at ${returnPhrases[theirs.outcome](title)}`,
      body: [
        lender
          ? `Bekreft når du har fått ${title} tilbake. Returen er endelig først når du bekrefter.`
          : "Fortell hva som har skjedd.",
      ],
    };
  }

  return {
    label: "Avklares",
    tone: "attention",
    headline: lender
      ? `Har du fått ${title} tilbake?`
      : `Har du levert tilbake ${title}?`,
    body: [
      lender
        ? `Returdagen ${end} har passert, og ${other} har ikke meldt ${title} returnert.`
        : `Returdagen ${end} har passert. Meld returnert når du har levert, eller si fra om du fortsatt har ${title}.`,
    ],
  };
}

/**
 * UX-INT-004, UX-P04: the loan's situation for the one who reads it on
 * `today` (a calendar date in Norway). An open proposal comes first,
 * because it is what the loan waits for now.
 */
export function describeLoanStatus(loan: Loan, today: string): LoanSituation {
  const first =
    endedSituation(loan) ??
    amendmentSituation(loan) ??
    transferSituation(loan) ??
    pendingReturnSituation(loan);

  if (first) return first;

  const own = loan.role;
  const other = otherParty(loan);
  const title = loan.agreement.title;
  const end = formatDay(loan.period.end);

  switch (loan.status) {
    case "reserved":
    case "awaiting_handover":
      return handoverSituation(loan, today);
    case "active":
      return own === "lender"
        ? {
            label: `Hos ${other}`,
            tone: "waiting",
            headline: `${sentence(title)} er hos ${other} til ${end}`,
            body: [`Du får beskjed når ${other} melder ${title} returnert.`],
          }
        : {
            label: "Hos deg",
            tone: "neutral",
            icon: "clock",
            headline: `${sentence(title)} er hos deg til ${end}`,
            body: [
              `Når du har levert tilbake, melder du ${title} returnert. ${other} bekrefter når ${title} er tilbake.`,
              ...(loan.agreement.loanTerms
                ? [`Vilkår: ${loan.agreement.loanTerms}`]
                : []),
            ],
          };
    case "awaiting_return":
      return returnSituation(loan);
    case "late":
      return {
        label: "Forsinket",
        tone: "warning",
        headline: `${sentence(title)} skulle vært levert tilbake ${end}`,
        body: [
          own === "lender"
            ? `${other} har sagt at ${title} ikke er levert tilbake ennå.`
            : `Du har sagt at du fortsatt har ${title}. Lever tilbake så snart du kan, eller foreslå en ny returdag ${other} kan godta.`,
        ],
      };
    case "disputed":
      return {
        label: "Uenighet",
        tone: "warning",
        headline: `Dere har sagt ulike ting om ${aboutReturn(loan) ? "returen" : "overleveringen"}`,
        body: [
          ...statements(loan),
          "Lånbort tar ikke stilling til hvem som har rett.",
        ],
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

/** The loan's way from request to done (KF1 v2, KF7), in its five steps. */
export const loanStages = [
  "Forespurt",
  "Reservert",
  "Utlånt",
  "Retur",
  "Gjennomført",
] as const;

/**
 * Where the loan is on its way: which step it has come to, and that step's
 * own word when the loan is not going as planned («Overlevering avklares»,
 * «Kansellert»). The step names a deviation; the status card explains it
 * (UX-EXC-001).
 */
export interface LoanProgress {
  readonly current: number;
  readonly label: string;
}

const atStage = (
  current: number,
  label: string = loanStages[current] ?? "",
): LoanProgress => ({ current, label });

export function loanProgress(loan: Loan): LoanProgress {
  switch (loan.ending?.reason) {
    case "returned":
      return atStage(4);
    case "cancelled":
      return atStage(1, "Kansellert");
    case "stopped":
      return atStage(1, "Stanset");
    case "not_completed":
      return atStage(1, "Ikke gjennomført");
    case "unresolved":
      return atStage(aboutReturn(loan) ? 4 : 1, "Avsluttet uavklart");
    case undefined:
      break;
  }

  if (loan.return.pending) return atStage(3);

  switch (loan.status) {
    case "reserved":
      return atStage(1);
    case "awaiting_handover":
      return atStage(1, "Overlevering avklares");
    case "active":
      return atStage(2);
    case "awaiting_return":
      return atStage(3, aboutReturn(loan) ? "Retur" : "Retur avklares");
    case "late":
      return atStage(3, "Forsinket");
    case "disputed":
      return aboutReturn(loan)
        ? atStage(3, "Uenighet")
        : atStage(1, "Uenighet");
    case "ended":
      return atStage(4, "Avsluttet");
  }
}

/** A step the caller can take, as one API command (UX-INT-001). */
export interface LoanStep {
  readonly label: string;
  readonly path: string;
  readonly body: object;
  /** The page's main step, filled; the others are drawn alike. */
  readonly primary?: boolean;
}

const returnLabels: Record<ReturnOutcome, (title: string) => string> = {
  returned: () => "Meld returnert",
  still_has: (title) => `Jeg har fortsatt ${title}`,
  received: (title) => `Jeg har fått tilbake ${title}`,
  not_received: (title) => `Jeg har ikke fått tilbake ${title}`,
};

/**
 * A clarification offers its answers side by side, and none is the
 * suggested one (KF7, UX-INT-001); a single step is the main one.
 */
const asAnswers = (steps: LoanStep[]): LoanStep[] =>
  steps.length === 1 && steps[0] ? [{ ...steps[0], primary: true }] : steps;

/**
 * The steps the domain offers the caller (`loan.actions`), worded as what
 * each does (UX-INT-003). The ones that belong to where the loan is now are
 * in the status card; the rest, such as taking one's own proposal back,
 * contradicting a handover after the loan started or a problem with a
 * confirmed return (PS-LOAN-017), are kept apart but easy to find
 * (UX-INT-009).
 */
export function loanSteps(loan: Loan): {
  primary: LoanStep[];
  secondary: LoanStep[];
} {
  const api = loanApi(loan.id);
  const title = loan.agreement.title;
  const { actions, amendment } = loan;
  const transfer = visibleTransfer(loan);
  const agreementVersion = loan.agreement.version;
  const handoverPhase =
    loan.status === "reserved" ||
    loan.status === "awaiting_handover" ||
    (loan.status === "disputed" && !aboutReturn(loan));

  // An extension names only its day; a new period names both.
  const short = (period: { start: string; end: string }) =>
    formatShortPeriod(
      returnDayOnly(loan) ? { start: period.end, end: period.end } : period,
    );
  const answers = amendment
    ? actions.amendment.map((answer) => ({
        label:
          answer === "decline"
            ? actions.amendment.includes("accept")
              ? `Behold ${short(loan.period)}`
              : "Si nei til forslaget"
            : `Godta ${returnDayOnly(loan) ? "ny returdag" : "ny periode"} ${short(amendment.period)}`,
        path: `${api}/amendments/${amendment.id}/${answer}`,
        body: {},
        primary: answer === "accept",
      }))
    : [];
  const consent = transfer
    ? actions.responsibility.map((answer) => ({
        label:
          answer === "accept" ? "Godta ny ansvarlig utlåner" : "Ikke godta",
        path: `${api}/responsibility/${transfer.id}/${answer}`,
        body: {},
        primary: answer === "accept",
      }))
    : [];
  const handover = actions.handover.map((outcome) => ({
    label:
      outcome === "not_handed_over"
        ? "Overleveringen skjedde ikke"
        : loan.role === "lender"
          ? `${otherParty(loan)} har fått ${title}`
          : `Jeg har fått ${title}`,
    path: `${api}/handover`,
    body: { agreementVersion, outcome },
  }));
  const returns = actions.return.map((outcome) => ({
    label: returnLabels[outcome](title),
    path: `${api}/return`,
    body: { agreementVersion, outcome },
  }));
  const undo = actions.undoReturn
    ? [{ label: "Angre", path: `${api}/return/undo`, body: {} }]
    : [];
  const control = actions.confirmControl
    ? [
        {
          label: `Jeg har ${title} igjen`,
          path: `${api}/control`,
          body: {},
          primary: true,
        },
      ]
    : [];
  const ended = loan.status === "ended";
  // Taking one's own proposal back is rarer than waiting for the answer.
  const withdrawals = [
    ...(actions.withdrawAmendment && amendment
      ? [
          {
            label: "Trekk forslaget",
            path: `${api}/amendments/${amendment.id}/withdraw`,
            body: {},
          },
        ]
      : []),
    ...(actions.withdrawResponsibility && transfer
      ? [
          {
            label: "Trekk tilbudet om ansvaret",
            path: `${api}/responsibility/${transfer.id}/withdraw`,
            body: {},
          },
        ]
      : []),
  ];

  // While it is lent out, the lender confirming it back early is rarer than
  // waiting for the borrower to return it (PS-LOAN-020).
  const returnsNow =
    !ended && !(loan.status === "active" && loan.role === "lender");
  const primary: LoanStep[] = [
    ...answers,
    ...consent,
    ...undo,
    ...control,
    ...(handoverPhase ? asAnswers(handover) : []),
    ...(returnsNow ? asAnswers(returns) : []),
  ];
  const lead = primary.findIndex((step) => step.primary);

  return {
    // One main step per card (UX-INT-001): the first that is one.
    primary: primary.map((step, index) =>
      step.primary && index !== lead ? { ...step, primary: false } : step,
    ),
    secondary: [
      ...withdrawals,
      ...(handoverPhase ? [] : handover),
      ...(returnsNow ? [] : returns),
    ],
  };
}
