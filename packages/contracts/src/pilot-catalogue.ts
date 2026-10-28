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
 * How a requirement is found to hold: `automatic`, by checks the server
 * runs against the deployment and its services when the lead asks;
 * `journal`, from the pilot journal itself, always as it stands; `manual`,
 * by the lead, who confirms it and says how it was checked.
 */
export const pilotRequirementChecks = [
  "automatic",
  "journal",
  "manual",
] as const;
export type PilotRequirementCheck = (typeof pilotRequirementChecks)[number];

/**
 * What must hold before a phase may end, besides its tests (the readiness
 * checklist, pilot-ui.md «Gjennomføring per fase»). Every requirement is
 * mandatory. Written for the product owner: `title` says what must hold,
 * `why` why it matters, and `how` how it is checked, or for a manual one,
 * what to do. An id is never reused.
 */
export interface PilotRequirement {
  readonly id: string;
  readonly phase: number;
  readonly check: PilotRequirementCheck;
  readonly title: string;
  readonly why: string;
  readonly how: string;
}

export const pilotRequirements: readonly PilotRequirement[] = [
  {
    id: "ci",
    phase: 0,
    check: "automatic",
    title: "De automatiske testene er grønne",
    why: "Versjonen deltakerne bruker, har bestått alle de automatiske testene.",
    how: "Lånbort spør GitHub om testkjøringene for versjonen som er publisert. Alle må være ferdige og uten feil.",
  },
  {
    id: "deploy",
    phase: 0,
    check: "automatic",
    title: "Deltakerne får den nyeste versjonen",
    why: "Appen som er ute, er den nyeste versjonen av hovedgrenen, ikke en eldre versjon eller en prøveversjon.",
    how: "Lånbort sjekker at den kjører i produksjon, og sammenligner versjonen sin med den nyeste på hovedgrenen (main) i GitHub.",
  },
  {
    id: "protected-flow",
    phase: 0,
    check: "automatic",
    title: "Bare testet kode kan publiseres",
    why: "Ingen endring skal kunne gå ut til deltakerne før de automatiske testene er grønne.",
    how: "Lånbort sjekker hos GitHub at hovedgrenen er beskyttet med krav om grønne tester før noe slås sammen.",
  },
  {
    id: "migrations",
    phase: 0,
    check: "automatic",
    title: "Databasen er oppdatert",
    why: "Databasen har alle endringene denne versjonen av appen er laget for.",
    how: "Lånbort sammenligner databaseendringene appen ble bygget med, med dem som er kjørt i databasen.",
  },
  {
    id: "email",
    phase: 0,
    check: "automatic",
    title: "Varsler på e-post blir sendt",
    why: "Deltakerne får e-post om forespørsler og svar, også når de ikke har appen åpen.",
    how: "Lånbort sjekker at e-postutsendingen er satt opp, at ingen varsel har ventet i køen i over en time, og at ingen er avvist de siste sju dagene.",
  },
  {
    id: "restore-drill",
    phase: 0,
    check: "automatic",
    title: "Gjenoppretting fra sikkerhetskopi er øvd",
    why: "Vi vet at dataene kan hentes tilbake hvis noe går galt.",
    how: "Lånbort sjekker hos GitHub at den siste gjenopprettingsøvelsen («Restore drill») var vellykket, og at den ikke er eldre enn 40 dager.",
  },
  {
    id: "signup-closed",
    phase: 0,
    check: "automatic",
    title: "Bare inviterte kan lage konto",
    why: "Piloten er lukket: andre enn dem du inviterer, skal ikke komme inn.",
    how: "Lånbort spør innloggingstjenesten om ny registrering er slått av.",
  },
  {
    id: "journal-private",
    phase: 0,
    check: "automatic",
    title: "Pilotjournalen er privat",
    why: "Testresultatene og deltakerlisten ligger bare i Lånborts egen database og kan ikke leses utenfra.",
    how: "Lånbort sjekker i databasen at ingen av rollene nettleseren kan bruke, får lese eller endre pilotens tabeller.",
  },
  {
    id: "contact",
    phase: 0,
    check: "automatic",
    title: "Kontaktkanalene er satt opp",
    why: "Deltakere og andre vet hvor de melder fra om sikkerhet og personvern.",
    how: "Lånbort sjekker at kontaktadressen og navnet på den ansvarlige er satt, at security.txt på nettstedet ikke er utløpt, og at private sårbarhetsmeldinger er slått på i GitHub.",
  },
  {
    id: "phase-tests",
    phase: 0,
    check: "journal",
    title: "Testene for klargjøring er gjennomført",
    why: "Testene i fase 0 er prøvd, og de viktige er bestått.",
    how: "Følger testresultatene i pilotjournalen: viktige tester må være bestått, og de andre må ha et resultat.",
  },
  {
    id: "critical-defects",
    phase: 0,
    check: "journal",
    title: "Ingen alvorlige feil står åpne",
    why: "Ingen feil som stopper piloten eller en sentral del av den (P0 eller P1), står uløst.",
    how: "Følger feillisten i pilotjournalen.",
  },
  {
    id: "backup",
    phase: 0,
    check: "manual",
    title: "Sikkerhetskopien tas hver natt",
    why: "Den egne sikkerhetskopien lages hver natt i det private backup-repoet, som Lånbort ikke kan se selv.",
    how: "Åpne det private backup-repoet på GitHub og velg «Actions». Se at de siste nattlige kjøringene av «Backup» har grønt merke. Skriv når den siste kjørte.",
  },
  {
    id: "security-channel",
    phase: 0,
    check: "manual",
    title: "Henvendelser om sikkerhet blir lest",
    why: "Noen leser og svarer på det som kommer til kontaktadressen, under hele piloten.",
    how: "Send en e-post til kontaktadressen på siden «Personvern og sikkerhet» under Konto, og se at den kommer fram der du leser e-post. Skriv når du sendte den, og at den kom fram.",
  },
  {
    id: "feedback-channel",
    phase: 0,
    check: "manual",
    title: "Tilbakemeldinger fra deltakerne blir fulgt opp",
    why: "Deltakerne vet hvor de sier fra, og noen følger med der under hele piloten.",
    how: "Bestem hvor deltakerne skal gi tilbakemeldinger, og send en prøvemelding dit. Skriv hvilken kanal det er, og hvem som følger den opp.",
  },
  {
    id: "consent",
    phase: 0,
    check: "manual",
    title: "Deltakerne er informert og har sagt ja",
    why: "Hver deltaker vet hva piloten går ut på, hva som lagres og hvor lenge, og at det er frivillig.",
    how: "Gi hver deltaker informasjonen før de inviteres, og få et tydelig ja. Skriv hvordan informasjonen ble gitt, og hvor samtykkene ligger.",
  },
];

/** The requirements a phase must meet before it ends; none for most. */
export const pilotRequirementsOf = (phase: number) =>
  pilotRequirements.filter((requirement) => requirement.phase === phase);

/**
 * How long an automatic check counts. The lead runs the checks again right
 * before a phase ends, so what was true then is what lets it end.
 */
export const pilotCheckFreshMs = 60 * 60 * 1000;

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
