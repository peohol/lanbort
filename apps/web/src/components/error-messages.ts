import type { ApiFailureCode } from "./api-client";

/** What a failed command means in words, wherever it was made. */
export type ErrorMessages = Partial<Record<ApiFailureCode, string>>;

const messages: ErrorMessages = {
  invalid_code:
    "Koden er feil eller utløpt. Sjekk e-posten eller be om en ny kode.",
  account_inactive:
    "Kontoen din er ikke aktiv. Du kan fortsatt fullføre lån du allerede har.",
  invalid_input: "Sjekk det du har fylt ut, og prøv igjen.",
  rate_limited: "Det har vært for mange forsøk. Vent litt og prøv igjen.",
  unauthenticated: "Du er ikke logget inn lenger. Logg inn på nytt.",
  unavailable: "Lånbort er utilgjengelig akkurat nå. Prøv igjen om litt.",
  not_found: "Dette finnes ikke lenger, eller du har ikke tilgang til det.",
  forbidden: "Du kan ikke gjøre dette.",
  conflict:
    "Noe endret seg mens du så på siden. Siden viser nå det som gjelder; se over og prøv igjen om det fortsatt passer.",
  network:
    "Fikk ikke kontakt med Lånbort. Det du har fylt ut er beholdt. Prøv igjen.",
};

/** Sign-in and registration: the address belongs to another account. */
export const emailInUseMessages: ErrorMessages = {
  conflict:
    "E-postadressen er allerede knyttet til en annen konto. Ta kontakt med oss for å få hjelp.",
};

/**
 * The words for a failure. `specific` says what a code means where the
 * command was made, such as a conflict that is about an e-mail address.
 */
export function errorMessage(
  code: ApiFailureCode,
  specific: ErrorMessages = {},
): string {
  return specific[code] ?? messages[code] ?? "Noe gikk galt. Prøv igjen.";
}
