/**
 * The closed pilot's test catalogue (docs/implementation/pilot-testplan.md):
 * the one authoritative list of the 98 manual test points, their areas and
 * the pilot's phases. The pilot surface reads it, and the tables in
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
export const pilotCatalogueVersion = "1.0";

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

export interface PilotCase {
  /** Stable id: the area's letter and a two-digit number, never reused. */
  readonly id: string;
  readonly priority: PilotPriority;
  /** The phase the test is planned for; tried in it or earlier. */
  readonly phase: number;
  readonly action: string;
  readonly expected: string;
}

const c = (
  id: string,
  priority: PilotPriority,
  phase: number,
  action: string,
  expected: string,
): PilotCase => ({ id, priority, phase, action, expected });

/** The test points, area by area, in the matrix's order. */
// prettier-ignore
export const pilotCases: readonly PilotCase[] = [
  // A – Konto, innlogging og vennskap
  c("A01", "B", 1, "Inviter ny deltaker, logg inn med e-postkode, fullfør alder og navn", "Konto opprettes bare for invitert adresse; bruker kommer til Hjem"),
  c("A02", "B", 0, "Forsøk registrering fra ikke-invitert adresse", "Ingen konto opprettes og svaret røper ikke invitasjonsstatus"),
  c("A03", "B", 1, "Prøv korrekt, feil, utløpt og gjentatt engangskode", "Riktig kode virker; avslag forklares uten kontolekkasje"),
  c("A04", "O", 1, "Logg ut og inn igjen, også på en annen nettleser", "Konto, profil og vanlige data bevares"),
  c("A05", "O", 2, "Rediger profil og varslings-/konto-innstillinger", "Oppdateringer lagres og er synlige etter ny innlogging"),
  c("A06", "O", 1, "Send, godta, avslå og trekk venneforespørsler", "Begge parter ser korrekt relasjon uten feilaktige varsler"),
  c("A07", "O", 2, "Spør eksisterende medlem om vennskap via e-post, med e-postvarsling av", "Forespørselen kommer i appen; ingen uønsket e-post sendes"),
  c("A08", "O", 2, "Produkteier inviterer ny adresse med «Spør også om å bli venner»", "Innlogging blir mulig, og mottakeren får valgfri ventende forespørsel"),
  c("A09", "O", 2, "Bli venner ved QR-kode og ved manuell kode", "Skann gir forespørsel, ikke automatisk vennskap"),
  c("A10", "U", 4, "Prøv utløpt/erstattet QR-kode, egen kode og ny forespørsel etter avslag", "Avvises nøytralt uten å røpe relasjon"),
  c("A11", "U", 4, "Blokker og opphev blokkering", "Ny uønsket kontakt sperres; eksisterende låneforpliktelser bevares"),

  // M – Miljøer og medlemskap
  c("M01", "B", 1, "Opprett åpent miljø og meld inn ny deltaker", "Miljøet kan finnes; innmelding skjer uten manuell godkjenning"),
  c("M02", "O", 2, "Opprett lukket miljø og søk medlemskap", "Ikke-medlem ser begrenset informasjon; administrator må behandle"),
  c("M03", "O", 2, "Be om mer informasjon i innmeldingssøknad", "Søkeren ser spørsmålet og kan svare"),
  c("M04", "O", 2, "Godkjenn og avslå søknader", "Søkeren varsles riktig og får riktig adgang"),
  c("M05", "O", 2, "Inviter eksisterende medlem til skjult miljø", "Kun adressaten får invitasjon og kan velge"),
  c("M06", "B", 1, "Søk etter skjult miljø som uvedkommende", "Skjult miljø, medlemsliste og ting er utilgjengelige"),
  c("M07", "O", 2, "Se miljøregler, medlemsliste, roller og publiserte ting som medlem", "Bare opplysninger rollen gir rett til vises"),
  c("M08", "O", 3, "Forlat miljø frivillig", "Ny tilgang fjernes; eksisterende godkjente lån består"),
  c("M09", "O", 2, "Inviter ny administrator og godta/avslå rolle", "Rettigheter endres først etter gyldig aksept"),
  c("M10", "U", 4, "Administrator avslutter medlemskap og vurderer ny søknad", "Tiltaket er sporbar, adgang oppdateres og ny vurdering er mulig"),
  c("M11", "U", 4, "Endre type eller medlemskrav på testmiljø", "Påkrevde samtykker, frister og informasjon håndteres"),
  c("M12", "U", 4, "Avvikle tomt testmiljø, deretter et miljø med historikk", "Ingen ny aktivitet; bare berettiget historisk innsyn består"),

  // T – Ting, bilder, søk og medeierskap
  c("T01", "B", 1, "Registrer ting med tittel, kategori og beskrivelse", "Tingen opprettes riktig"),
  c("T02", "B", 1, "Last opp 1–5 bilder; åpne både hovedbilde og øvrige bilder", "Bildene vises riktig for dem som har tilgang"),
  c("T03", "O", 2, "Endre bilder og slett/arkiver testting", "Miniatyrbilder og historiske visninger oppfører seg riktig"),
  c("T04", "O", 2, "Opprett og endre tilgjengelighetsperioder og vilkår", "Endringene gjenspeiles på tingens side og i nye forespørsler"),
  c("T05", "O", 2, "Publiser i ett/to miljøer og separat for venner", "Synlighet følger hvert eksplisitte publiseringsvalg"),
  c("T06", "O", 2, "Finn ting via Finn, vennefilter og miljøsøk", "Relevante treff vises, uvedkommende treff ikke"),
  c("T07", "O", 3, "Se ting som er utlånt, sperret eller ikke tilgjengelig", "Nøytral status uten å røpe private årsaker"),
  c("T08", "O", 2, "Finn egne og medeide ting under Mine ting", "Status og handlinger er forståelige"),
  c("T09", "O", 2, "Følg en tilgjengelig ting der funksjonen tilbys", "Varsel/abonnement følger synlighet og tilgjengelighet"),
  c("T10", "O", 3, "Arkiver og reaktiver en ting", "Tingen forsvinner fra vanlig søk og kommer tilbake korrekt"),
  c("T11", "U", 4, "Slett en testting uten forpliktelser", "Slettingen respekterer historiske opplysninger og personvern"),
  c("T12", "U", 4, "Prøv å slette en ting med aktivt/godkjent lån", "Forpliktelsen hindrer feilaktig sletting"),
  c("T13", "U", 4, "Inviter medeier; godta og administrer tingen fra begge kontoer", "Rettigheter og endringshistorikk er korrekte"),
  c("T14", "U", 4, "La medeier begrense tilgjengelighet og oppheve egen begrensning", "Begrensning håndheves mot alle nye lån"),
  c("T15", "U", 4, "Rediger samme ting samtidig på ulike enheter/medeiere", "Ingen stille overskriving av nye endringer"),

  // L – Forespørsler, avtaler, overlevering og retur
  c("L01", "B", 1, "Be venn om direktelån", "Forespørsel opprettes i riktig vennskontekst med ansvarserklæring"),
  c("L02", "B", 1, "Be om miljølån", "Riktig miljøkontekst og mottaker beholdes"),
  c("L03", "O", 1, "Velg start/slutt, vilkår og valgfri melding; kontroller oppsummering", "Avtalegrunnlag vises forståelig før innsending"),
  c("L04", "B", 1, "Godkjenn forespørsel som utlåner", "Avtale og reservasjon opprettes én gang"),
  c("L05", "O", 3, "Avslå og trekk tilbake ventende forespørsler", "Begge ser endelig status og korrekt varsel"),
  c("L06", "B", 1, "Send overlappende forespørsler på samme ting", "Én godkjenning sperrer kolliderende lån"),
  c("L07", "O", 3, "Endre vesentlige vilkår mens forespørsel venter", "Låntaker må bekrefte endringer før avtale"),
  c("L08", "B", 1, "Åpne Lån fra begge kontoer før og etter godkjenning", "Korrekt status, part og neste steg vises"),
  c("L09", "B", 1, "Bekreft faktisk overlevering", "Lån går riktig fra reservert til utlånt"),
  c("L10", "O", 3, "Foreslå forlengelse og annen avtaleendring; godta og avslå", "Bare gjensidig godkjente og kollisjonsfrie endringer lagres"),
  c("L11", "U", 4, "Kanseller godkjent lån før overlevering", "Begge parter kan kansellere, reservasjon frigjøres"),
  c("L12", "O", 3, "Låntaker registrerer retur", "Utlåner ser ventende mottaksbekreftelse"),
  c("L13", "B", 1, "Utlåner bekrefter mottatt ting", "Lånet fullføres med uendret historikk"),
  c("L14", "O", 3, "Angre returbekreftelse i løpet av 30 sekunder, prøv også utløpt frist", "Angring kun innen frist; senere problem blir ny hendelse"),
  c("L15", "O", 3, "Returner tidlig og søk senere i frigjort periode", "Restperioden blir ledig dersom ingen annen sperre finnes"),
  c("L16", "U", 4, "La overlevering/retur passere avtalte frister", "Nøytral avklaring og korrekte varsler vises"),
  c("L17", "U", 4, "La partene oppgi motstridende overleverings-/returopplysninger", "Uenighet vises uten skyldplassering eller feilaktig gjenåpning"),
  c("L18", "U", 4, "Registrer fiktiv skade, mangel eller tap på avtalt testlån", "Begge forklaringer loggføres uten å omskrive hverandre"),
  c("L19", "U", 4, "Opphev vennskap eller medlemskap etter godkjenning", "Nødvendig adgang til å avslutte lånet består"),
  c("L20", "U", 4, "Overfør ansvar mellom medeiere, eventuelt med låntakers aksept", "Ansvar flyttes bare etter riktige samtykker"),

  // K – Varsler, chat og enheter
  c("K01", "B", 1, "Utløs viktige varsler om nye forespørsler og oppgaver", "Varsler kommer til rett bruker én gang"),
  c("K02", "O", 2, "Trykk varsler fra ulike flater", "Åpner rett lån, ting, forespørsel eller samtale"),
  c("K03", "O", 2, "Utfør Hjem-oppgaver og se at de forsvinner fra ventelisten", "Oppgavestatus oppdateres uten at andre skjules"),
  c("K04", "O", 2, "Kontroller markering av nye varsler i appnavigasjonen", "Teller/markering stemmer etter lesing"),
  c("K05", "O", 2, "Skru av og på e-post- og chatvarsler", "Preferanser følges; påkrevde sikkerhetsvarsler sendes"),
  c("K06", "B", 1, "Aktiver privat chat med pilotsamtykke", "Chat aktiveres først etter uttrykkelig bekreftelse"),
  c("K07", "B", 1, "Send og motta privat melding mellom to inviterte", "Bare samtalepartene kan lese meldingen"),
  c("K08", "O", 2, "Demp samtale og fjern den fra samtalelisten", "Egne valg påvirker bare eget innsyn/varsler"),
  c("K09", "O", 2, "Koble ny mobil/PC til chatkontoen", "Koblingen må godkjennes etter gjeldende protokoll"),
  c("K10", "O", 2, "Se automatisk enhetstype/navn og gi manuelt navn/ikon", "Enheter kan skilles fra hverandre"),
  c("K11", "O", 2, "Godkjenn og tilbakekall chat-enhet", "Sikkerhetsvarsel sendes og ny adgang stoppes ved tilbakekalling"),
  c("K12", "U", 4, "Prøv recovery eller chat-tilbakestilling med isolert testkonto", "Historikk/nøkler håndteres som dokumentert; ingen falsk gjenoppretting"),
  c("K13", "U", 4, "Kontroller forventninger om lesebekreftelser og admininnsyn", "Ingen falske lesebekreftelser eller administrator-tilgang"),
  c("K14", "U", 4, "Blokker kontakt under aktivt lån", "Ordinær chat stoppes, snever lånelogistikk består"),

  // R – Anmeldelser og tillit
  c("R01", "O", 3, "La begge parter anmelde gjennomført lån", "Rett skala/dimensjoner og bare gyldig anmelderrett"),
  c("R02", "O", 3, "La én part unnlate å anmelde frem til 14-dagersfrist", "Dobbelblind publisering og tidsfrist fungerer"),
  c("R03", "O", 3, "Gi lav vurdering der begrunnelse kreves", "Formular håndhever begrunnelse"),
  c("R04", "O", 3, "Gi ett tilsvar på publisert anmeldelse", "Bare ett tilsvar og uendret original"),
  c("R05", "O", 3, "Se tillitsvisning fra forskjellige roller/kontekster", "Riktige aggregerte signaler og datagrunnlag vises"),
  c("R06", "U", 4, "Prøv anmeldelse fra skjult miljø mot uvedkommende", "Kontekst, identitet og fritekst lekker ikke"),
  c("R07", "U", 4, "Blokker motparten etter lånet, før anmeldelse", "Opptjent anmeldelsesrett består"),

  // D – Miljøadministrasjon, rapporter og saker
  c("D01", "O", 2, "La miljøadministrator motta medlems-/publiseringsoppgaver", "Oppgavene vises på riktig sted med riktig status"),
  c("D02", "O", 2, "Krev forhåndsgodkjenning og godkjenn/avvis publisering", "Miljøsynlighet følger avgjørelsen"),
  c("D03", "O", 3, "Send melding til miljøets administratorer", "Sak oppstår i riktig administrativ kontekst"),
  c("D04", "O", 3, "Rapporter testting, testperson eller testanmeldelse", "Rapport går bare til habil/mulig behandlingsnivå"),
  c("D05", "O", 3, "Tildel, behandle og lukk sak med avslutningsmelding", "Partene får korrekt status uten konfidensielle data"),
  c("D06", "U", 4, "Prøv mekling med motstridende forklaringer", "Administrator ser kun uttrykkelig saksmateriale, aldri privat chat"),
  c("D07", "U", 4, "La administrator være part i rapportert sak", "Inhabil administrator mister behandlingsrett"),
  c("D08", "U", 4, "Moderer publisering eller medlem i ett miljø", "Tiltaket gjelder lokalt og har forklaring/historikk"),
  c("D09", "U", 4, "Test sak i miljø uten habil administrator", "Saken blir ventende uten falsk eskalering"),
  c("D10", "B", 0, "Kontroller at global plattformforvaltning er av under pilot", "Ingen aktive globale modereringsvalg vises"),

  // S – Personvern, kontolivssyklus og robusthet
  c("S01", "B", 1, "Prøv direkte URL-er og søk mot skjulte data som utenforstående", "Ingen skjulte ting, medlemsdata eller samtaler blir tilgjengelige"),
  c("S02", "O", 0, "Finn personvern-/sikkerhetsinformasjon og kontaktkanal", "Teksten er forståelig og samsvarer med faktisk drift"),
  c("S03", "O", 1, "Bruk mobil og PC; logg inn/ut på ulike nettlesere", "Normal kontodata og riktig enhetsmodell oppfører seg korrekt"),
  c("S04", "U", 4, "Avbryt nettverk eller gjenta samme innsending på testdata", "Ingen dobbeltsending eller doble lån"),
  c("S05", "U", 4, "Deaktiver dedikert testkonto med eksisterende forpliktelser", "Ingen nye avtaler; nødvendige avslutningshandlinger består"),
  c("S06", "U", 4, "Slett dedikert testkonto uten aktive bindinger", "Sletting/anonymisering følger dokumentert livssyklus"),
  c("S07", "U", 4, "Forsøk sletting av konto med aktivt testlån", "Aktive bindinger håndteres eksplisitt; intet stille tap"),
  c("S08", "U", 4, "Prøv tilgang etter slettet ting, arkivert miljø eller bortfalt relasjon", "Historiske data vises bare til dem med gyldig rett"),
  c("S09", "B", 0, "Verifiser feillogger, alerting, sikkerhetskopi og driftsberedskap", "Feil kan oppdages; ingen sensitiv data logges eller havner i offentlig repo"),
];

/** The area a test belongs to, from its id. */
export const pilotAreaOf = (testId: string) =>
  pilotAreas.find((area) => testId.startsWith(area.code));

/** A test id as the catalogue writes them: an area letter and two digits. */
export const pilotTestIdPattern = /^[AMTLKRDS][0-9]{2}$/;
