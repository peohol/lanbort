import type {
  LoanRequest,
  LoanRequestEndReason,
  LoanRequestRole,
} from "@lanbort/contracts";
import type { Tone } from "@/components/tag";
import { personName } from "./loan-status";

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

/** What the message field says about who sees it (PS-LOAN-004, OD-0015). */
export const requestMessageHelp =
  "Valgfritt. Meldingen vises for eieren sammen med forespørselen og er ikke ende-til-ende-kryptert. Videre samtale skjer i privat chat.";

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
  readonly text: string;
  readonly tone: Tone;
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
        return { text: "Venter på svar fra eieren", tone: "waiting" };
      return {
        text:
          request.responsibility && !request.responsibility.acceptedByYou
            ? `${name} vil låne. Godta ansvarserklæringen før du svarer`
            : `${name} vil låne. Venter på svaret ditt`,
        tone: "waiting",
      };
    case "awaiting_terms_confirmation":
      return borrower
        ? {
            text: "Vilkårene er endret. Bekreft de nye vilkårene før eieren kan svare",
            tone: "warning",
          }
        : {
            text: `Venter på at ${name} bekrefter de nye vilkårene`,
            tone: "waiting",
          };
    case "on_hold":
      return {
        text: "Satt på vent av miljøet. Den kan besvares når miljøet åpner for det igjen",
        tone: "neutral",
      };
    case "approved":
      return { text: "Godkjent. Lånet er avtalt", tone: "positive" };
    case "ended":
      return {
        text: endedBecause[request.endReason ?? "access_lost"](request.role),
        tone: "neutral",
      };
  }
}

/** Where the request came from, as its context (UX-PRIV-003). */
export function requestOriginLabel(request: LoanRequest): string {
  return request.origin.kind === "direct"
    ? "Direkte mellom venner"
    : (request.origin.environment?.name ?? "Et miljø");
}
