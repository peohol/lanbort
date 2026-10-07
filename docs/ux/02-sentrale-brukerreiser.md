# Sentrale brukerreiser

> **Status:** UX-modell v0.1. Reisene beskriver normalforløp; avvik finnes i eget dokument.

## Ny bruker

### UX-JRN-001 — Kontoopprettelse skal være kort
**Forankring:** UX-P19; PS-USR-001

1. Oppgi e-post.
2. Verifiser e-post.
3. Oppgi virkelig navn og bekreft 18+.
4. Eventuelt legg til profilbilde/presentasjon.
5. Gå direkte til Hjem.

Ingen lang produktomvisning kreves. Hjelp gis når brukeren møter et nytt konsept.

## Finne og bli med i miljø

### UX-JRN-002 — Miljøtype skal være forståelig før innmelding
**Forankring:** UX-P11; PS-ENV-001

Brukeren skal før handling forstå om miljøet er åpent, lukket eller bare tilgjengelig via invitasjon og hvilke opplysninger som kreves.

Åpent: Finn → miljø → krav/regler → bli medlem.

Lukket: Finn → begrenset forhåndsvisning → send innmelding → følg status i kontekst/Hjem.

Skjult: mottatt intern invitasjon → se nødvendig introduksjon/regler → fyll eventuelle krav → aksepter.

## Opprette og publisere objekt

### UX-JRN-003 — Ett objektoppsett uansett inngang
**Forankring:** UX-P02; PS-OBJ-001, PS-OBJ-002

Brukeren kan starte fra Mine ting eller fra et miljø. Samme skjema brukes:
1. tittel og kategori
2. beskrivelse og eventuelle bilder
3. tilgjengelighet
4. valgfrie vilkår
5. velg publiseringskontekst(er): «Venner» og/eller miljøer, der «Venner» er av som standard (PS-OBJ-020)
6. gjennomgå og publiser

Starter brukeren i et miljø, er dette miljøet forhåndsvalgt, men objektet opprettes fortsatt som brukerens globale objekt.

## Miljøbasert lån

### UX-JRN-004 — Forespørsel skal samles i ett kort forløp
**Forankring:** UX-P03, UX-P07; PS-LOAN-004

Objekt → velg ønsket periode/start → eventuelt skriv en kort melding → gjennomgå → send. UI skal ikke be om samme tidsinformasjon både som intervall og varighet.

Meldingen er valgfri og vises i forespørselen for begge parter, ikke i Samtaler. Feltet forklarer kort at den er synlig for den andre parten og ikke er ende-til-ende-kryptert, og at videre samtale skjer i privat chat (PS-LOAN-004).

Etter sending går brukeren direkte til lånedetaljen med tydelig status «Venter på svar fra …».

### UX-JRN-005 — Godkjenning skal vise avtalen som faktisk inngås
**Forankring:** UX-P03; PS-LOAN-006

Utlåner ser forespørsel, periode, relevante vilkår og kollisjonsstatus. Ved godkjenning viser bekreftelsesflaten hva som blir bindende. Godkjenning skal ikke presenteres som en triviell «liker»-handling.

## Direkte vennelån

### UX-JRN-013 — Direkte vennelån starter fra vennens objekt
**Forankring:** UX-P02; PS-OBJ-020, PS-USR-004, PS-LOAN-001

En venn finner objektet på eierens profil eller med filteret «Venner» i Finn. Derfra brukes samme forespørselsforløp som i UX-JRN-004, med opprinnelsen «Direkte mellom venner» som kontekst. Det finnes ingen egen liste over alle venners ting utenom profilen og filteret.

### UX-JRN-006 — Ansvarserklæringen er del av godkjenningen, ikke onboarding
**Forankring:** UX-P03, UX-P19; PS-LOAN-003

Ansvarserklæring vises først når et konkret direkte vennelån skal etableres. Begge parter må aktivt bekrefte den for akkurat dette lånet.

## Overlevering

### UX-JRN-007 — Lånedetaljen skal alltid vise neste praktiske steg
**Forankring:** UX-P04; PS-LOAN-012, PS-LOAN-022

Før overlevering vises:
- avtalt tidspunkt/periode
- nødvendig praktisk informasjon
- tydelig status
- relevante handlinger: bekreft overlevering, foreslå endring, kanseller

Begge parter kan bekrefte overleveringen. Én parts bekreftelse uten motsigelse gjør lånet utlånt, så UI-et skal ikke vente på at begge har bekreftet (PS-LOAN-022).

Når tidspunktet passerer uten avklaring, erstattes normalhandlingen av avklaringsvalg uten at brukeren må finne en egen feilmassasje. Valgene er likeverdige faktaalternativer (UX-INT-001).

## Aktivt lån og retur

### UX-JRN-008 — Returforløpet skal være gjensidig forståelig
**Forankring:** UX-P04; PS-LOAN-014, PS-LOAN-015

Når retur nærmer seg, vises avtalt returtid og eventuell mulighet for å foreslå forlengelse. Låntaker kan melde returnert; UI skal samtidig forklare at retur først er endelig når ansvarlig utlåner har bekreftet mottak.

Utlåners returbekreftelse får 30 sekunders synlig angremulighet.

### UX-JRN-009 — Tidlig retur oppdaterer fremtiden umiddelbart etter endelig bekreftelse
**Forankring:** PS-LOAN-020

Når retur er endelig bekreftet, viser systemet lånet som avsluttet på faktisk tidspunkt og kan gjøre den frigjorte perioden tilgjengelig igjen dersom ingen annen sperre finnes.

## Anmeldelse

### UX-JRN-010 — Anmeldelsen tilpasses faktisk forløp
**Forankring:** PS-TRUST-001, PS-TRUST-003

Etter vurderingsberettiget avslutning viser systemet bare dimensjoner som faktisk kan vurderes. Før innsending forklares kort at vurderingen holdes skjult frem til motparten har levert eller fristen går ut.

## Medeier

### UX-JRN-011 — Medeierskap skal ikke gi falsk kontroll over eksisterende lån
**Forankring:** PS-OBJ-007, PS-LOAN-008

Mine ting viser hvem som medeier objektet og eventuelle begrensninger. På eksisterende lån vises ansvarlig utlåner tydelig; andre medeiere får bare handlinger de faktisk har rett til.

## Administrator

### UX-JRN-012 — Administrativt arbeid vises som oppgaver, ikke skjulte superbrukerknapper
**Forankring:** UX-P05; PS-COM-011

Når bruker har administratorrolle kan Hjem/miljø vise konkrete ventende oppgaver: innmeldinger, objektgodkjenning, administratorkontakt eller saker. Inhabil bruker skal ikke tilbys behandlingshandlinger.
