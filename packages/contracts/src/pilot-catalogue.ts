/**
 * The closed pilot's test catalogue (docs/implementation/pilot-testplan.md):
 * the one authoritative list of the 98 manual test points (in
 * `pilot-cases.ts`), their areas and the pilot's phases. The pilot surface reads it, and the tables in
 * `pilot-testmatrise.md` and `pilot-testplan.md` are generated from it
 * (`pnpm pilot:docs`); a test fails when they differ.
 *
 * Change it through a pull request. An id is never reused or renumbered:
 * a test that is dropped keeps its id out of use. Changed wording gets a new
 * revision of the test (see `pilotCaseRevision` in the domain), so results
 * recorded against the old wording keep it.
 *
 * Public data only: never results, people or real events.
 */

/** The catalogue's version, as stated in the matrix. */
export const pilotCatalogueVersion = "1.1";

/**
 * B (basis) must pass before the normal pilot; O (ordinær) is ordinary use
 * tried by real participants; U (utvidet) is a controlled scenario with
 * fictional events, tried at least once.
 */
export const pilotPriorities = ["B", "O", "U"] as const;
export type PilotPriority = (typeof pilotPriorities)[number];

export const pilotPriorityNames: Record<PilotPriority, string> = {
  B: "Basis",
  O: "Ordinær",
  U: "Utvidet",
};

export const pilotAreas = [
  { code: "A", name: "Konto, innlogging og vennskap" },
  { code: "M", name: "Miljøer og medlemskap" },
  { code: "T", name: "Ting, bilder, søk og medeierskap" },
  { code: "L", name: "Forespørsler, avtaler, overlevering og retur" },
  { code: "K", name: "Varsler, chat og enheter" },
  { code: "R", name: "Anmeldelser og tillit" },
  { code: "D", name: "Miljøadministrasjon, rapporter og saker" },
  { code: "S", name: "Personvern, kontolivssyklus og robusthet" },
] as const;

export type PilotAreaCode = (typeof pilotAreas)[number]["code"];

export interface PilotPhase {
  readonly number: number;
  readonly name: string;
  readonly when: string;
  readonly tasks: string;
  /** What must hold before the pilot moves on to the next phase. */
  readonly gate: string;
}

/** The pilot's phases (pilot-testplan.md §3), each with its gate. */
export const pilotPhases: readonly PilotPhase[] = [
  {
    number: 0,
    name: "Klargjøring",
    when: "3–5 dager før invitasjoner",
    tasks:
      "Bekreft grønn CI/deploy, beskyttet produksjonsflyt, migrasjoner, varsling, backup/gjenoppretting, kontaktkanal, sperret offentlig registrering, privat journal, samtykke/informasjon",
    gate: "Ingen åpne kritiske feil. Sikkerhets- og tilbakemeldingskanal faktisk betjent",
  },
  {
    number: 1,
    name: "Førstegangsbruk",
    when: "Dag 1–3, 2–3 personer",
    tasks:
      "Invitasjon, konto, navigasjon, vennskap, miljøinnmelding, registrere ting, første forespørsel, chat; observer uten å instruere på forhånd",
    gate: "Kjerneflytene kan fullføres; P0/P1 stoppere er rettet",
  },
  {
    number: 2,
    name: "Hele panelet",
    when: "Dag 4–10",
    tasks:
      "Inviter øvrige, opprett miljøtyper, roller og ting; prøv medlemskap, QR/e-post-vennskap, publisering, søk og varsler",
    gate: "Deltakerne kan bli aktive og finne ting uten systematisk teknisk hinder",
  },
  {
    number: 3,
    name: "Vanlige lån",
    when: "Dag 11–20",
    tasks:
      "Faktiske vennelån og miljølån over flere dager; godkjenning/avslag, overlevering, chat, endringer, retur, anmeldelser",
    gate: "Gjentatte normalforløp fungerer fra start til slutt uten fastlåst status",
  },
  {
    number: 4,
    name: "Kontrollerte avvik",
    when: "Dag 21–28",
    tasks:
      "Dobbelbooking, kansellering, endrede vilkår, blokkering, returtvist, skade som testdata, lokalt moderering, medeierskap, kontosletting, chat-enheter, miljøavvikling",
    gate: "Alle utvidede scenarioer er testet eller unntaket er begrunnet",
  },
  {
    number: 5,
    name: "Selvstendig bruk og avslutning",
    when: "Dag 29–35",
    tasks:
      "Reduser instruksjoner; observer frivillige returer og nye lån; intervjuer; sluttrapport, behandling av aktive forpliktelser",
    gate: "Fullstendig registrert dekning og eksplisitt beslutning om neste fase",
  },
];

/**
 * What a tester is told: a short title and the expected result in plain
 * words, what must be ready, the steps in order, and what must be seen for
 * the test to pass. A change to any of it is a new revision of the test.
 */
export interface PilotWording {
  /** «Gjør»: one sentence on what the test tries. */
  readonly action: string;
  /** «Forventet»: what should happen, in a sentence or two. */
  readonly expected: string;
  /** «Før du starter»: accounts, relations and data that must exist. */
  readonly prepare: readonly string[];
  /** «Slik gjør du det»: the steps, in order. */
  readonly steps: readonly string[];
  /** «Testen er bestått når»: what must be seen, all of it. */
  readonly passWhen: readonly string[];
}

export interface PilotCase extends PilotWording {
  /** Stable id: the area's letter and a two-digit number, never reused. */
  readonly id: string;
  readonly priority: PilotPriority;
  /** The phase the test is planned for; tried in it or earlier. */
  readonly phase: number;
}

/** The test points, area by area, in the matrix's order. */
export { pilotCases } from "./pilot-cases";

/** The area a test belongs to, from its id. */
export const pilotAreaOf = (testId: string) =>
  pilotAreas.find((area) => testId.startsWith(area.code));

/** A test id as the catalogue writes them: an area letter and two digits. */
export const pilotTestIdPattern = /^[AMTLKRDS][0-9]{2}$/;
