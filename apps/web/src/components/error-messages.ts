import type { ApiErrorCode } from "@lanbort/contracts";

const messages: Partial<Record<ApiErrorCode | "network", string>> = {
  invalid_code:
    "Koden er feil eller utløpt. Sjekk e-posten eller be om en ny kode.",
  account_inactive:
    "Kontoen din er ikke aktiv. Du kan fortsatt fullføre lån du allerede har.",
  invalid_input: "Sjekk det du har fylt ut, og prøv igjen.",
  rate_limited: "Det har vært for mange forsøk. Vent litt og prøv igjen.",
  unauthenticated: "Du er ikke logget inn lenger. Logg inn på nytt.",
  unavailable: "Lånbort er utilgjengelig akkurat nå. Prøv igjen om litt.",
  conflict:
    "E-postadressen er allerede knyttet til en annen konto. Ta kontakt med oss for å få hjelp.",
  network:
    "Fikk ikke kontakt med Lånbort. Det du har fylt ut er beholdt. Prøv igjen.",
};

export function errorMessage(code: ApiErrorCode | "network"): string {
  return messages[code] ?? "Noe gikk galt. Prøv igjen.";
}
