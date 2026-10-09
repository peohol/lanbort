import type {
  LoanRequest,
  LoanRequestEndReason,
  LoanRequestRole,
} from "@lanbort/contracts";
import type { Tone } from "@/components/tag";
import { type LoanProgress, loanStages, personName } from "./loan-status";

/**
 * The responsibility declaration both parties of a direct friend loan
 * accept (PS-LOAN-003, vision «Ansvarserklæring ved direkte vennelån»), as
 * of `responsibilityDeclarationVersion` 1. A new wording is a new version.
 */
export const responsibilityDeclaration = [
  "Lånbort hjelper dere å finne hverandre, avtale lånet og holde oversikt over det.",
  "Dere har selv ansvaret for tingen og for lånet mellom dere.",
  "Uenighet om tilbakelevering, skade, tap eller erstatning må dere løse selv.",
  "Lånbort mekler ikke og avgjør ikke slike uenigheter. Trusler, svindel og annet misbruk kan du likevel alltid melde fra om.",
] as const;

/**
 * What the message field says about who sees it (PS-LOAN-004, OD-0015),
 * naming who reads it: «Kari», or «Eieren».
 */
export const requestMessageHelp = (reader: string) =>
  `${reader} ser meldingen i forespørselen. Den er ikke ende-til-ende-kryptert. Videre prat tar dere i den private samtalen.`;

/**
 * Why a request ended. The neutral reasons never say who did what
 * (PS-LOAN-002, PS-USR-006).
 */
const endedBecause: Record<
  LoanRequestEndReason,
  (role: LoanRequestRole) => string
> = {
  withdrawn: (role) =>
    role === "borrower"
      ? "Du trakk forespørselen"
      : "Låntakeren trakk forespørselen",
  declined: (role) =>
    role === "borrower"
      ? "Eieren sa nei denne gangen"
      : "Forespørselen ble avslått",
  access_lost: () =>
    "Forespørselen gjelder ikke lenger, fordi tilgangen den bygde på er borte",
  publication_ended: () =>
    "Forespørselen gjelder ikke lenger, fordi tingen ikke er tilgjengelig der den ble funnet",
  object_unavailable: () =>
    "Forespørselen gjelder ikke lenger, fordi tingen ikke kan lånes ut nå",
  period_unavailable: () =>
    "Forespørselen gjelder ikke lenger, fordi tiden ble avtalt med et annet lån",
};

export interface LoanRequestStatusText {
  /** «Venter på deg», «Avtalt»: who or what it waits on, in a word or two. */
  readonly label: string;
  readonly text: string;
  readonly tone: Tone;
  /** What to know about it, when there is more to say. */
  readonly body?: string;
}

/**
 * The request's situation for the one who reads it (UX-P04, UX-INT-004):
 * what it waits for, and from whom. The owners are not named to the
 * borrower before an answer; the lender sees who asks.
 */
export function describeLoanRequest(
  request: LoanRequest,
): LoanRequestStatusText {
  const borrower = request.role === "borrower";
  const name = personName(request.borrower);

  switch (request.status) {
    case "requested":
      if (borrower)
        return {
          label: "Venter på eieren",
          text: "Venter på svar fra eieren",
          tone: "waiting",
          body: "Du får varsel når eieren svarer. Ingenting er avtalt før eieren godkjenner.",
        };
      return {
        label: "Venter på deg",
        text:
          request.responsibility && !request.responsibility.acceptedByYou
            ? `${name} vil låne. Godta ansvarserklæringen før du svarer`
            : `${name} vil låne. Venter på svaret ditt`,
        tone: "waiting",
      };
    case "awaiting_terms_confirmation":
      return borrower
        ? {
            label: "Venter på deg",
            text: "Vilkårene er endret. Bekreft de nye vilkårene før eieren kan svare",
            tone: "warning",
          }
        : {
            label: `Venter på ${name}`,
            text: `Venter på at ${name} bekrefter de nye vilkårene`,
            tone: "waiting",
          };
    case "on_hold":
      return {
        label: "På vent",
        text: "Satt på vent av miljøet. Den kan besvares når miljøet åpner for det igjen",
        tone: "neutral",
      };
    case "approved":
      return {
        label: "Avtalt",
        text: "Godkjent. Lånet er avtalt",
        tone: "positive",
      };
    case "ended":
      return {
        label: "Avsluttet",
        text: endedBecause[request.endReason ?? "access_lost"](request.role),
        tone: "neutral",
      };
  }
}

/**
 * Where the request is on the loan's way (KF1 v2): asked for until an
 * answer; once approved, the loan it became is reserved.
 */
export function requestProgress(request: LoanRequest): LoanProgress {
  switch (request.status) {
    case "approved":
      return { current: 1, label: loanStages[1] };
    case "ended":
      return { current: 0, label: "Avsluttet" };
    case "on_hold":
      return { current: 0, label: "På vent" };
    default:
      return { current: 0, label: loanStages[0] };
  }
}

/**
 * Where a request or loan came from, as its context (UX-PRIV-003): «Via
 * Gården» or «Direkte mellom venner». An environment the reader may no
 * longer see is not named (PS-ENV-009).
 */
export function originLabel(origin: LoanRequest["origin"]): string {
  return origin.kind === "direct"
    ? "Direkte mellom venner"
    : `Via ${origin.environment?.name ?? "et miljø"}`;
}
