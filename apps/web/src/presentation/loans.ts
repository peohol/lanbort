import type {
  DesiredEnd,
  DesiredStart,
  LoanEndReason,
  LoanRequestStatus,
  LoanStatus,
} from "@lanbort/contracts";
import { formatDay } from "./dates";

/** UX-P04: a loan's status as a situation, never the internal state. */
export const loanStatusLabels: Record<LoanStatus, string> = {
  reserved: "Avtalt, ikke overlevert ennå",
  awaiting_handover: "Venter på avklaring av overleveringen",
  active: "Utlånt",
  awaiting_return: "Venter på avklaring av returen",
  late: "Forsinket",
  disputed: "Usikker eller uenighet",
  ended: "Avsluttet",
};

export const loanEndReasonLabels: Record<LoanEndReason, string> = {
  cancelled: "Avlyst før overlevering",
  not_completed: "Ikke gjennomført",
  returned: "Levert tilbake",
};

export const loanRequestStatusLabels: Record<LoanRequestStatus, string> = {
  requested: "Venter på svar fra eieren",
  awaiting_terms_confirmation: "Venter på at låntakeren bekrefter nye vilkår",
  on_hold: "Satt på vent av miljøet",
  approved: "Godkjent",
  ended: "Ikke lenger åpen",
};

/** «Låner» / «Låner bort» (UX-IA-006). */
export const loanRoleLabels = {
  borrower: "Du låner",
  lender: "Du låner bort",
} as const;

/** The time a request asks for (PS-LOAN-004), as the borrower put it. */
export function formatDesiredPeriod(start: DesiredStart, end: DesiredEnd) {
  const from =
    start.kind === "asap"
      ? "Så snart som mulig"
      : `Fra ${formatDay(start.date)}`;
  const until =
    end.kind === "date"
      ? `til ${formatDay(end.date)}`
      : `i ${end.days} ${end.days === 1 ? "dag" : "dager"}`;

  return `${from} ${until}`;
}
