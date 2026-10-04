# Åpne detaljbeslutninger

> **Status:** Felles arbeidsregister for uavklarte detaljvalg i produktspesifikasjon, UX og systemarkitektur.

## Formål

Dette dokumentet brukes når planarbeidet avdekker et konkret valg som må avklares senere, men som **ikke** er et nytt spørsmål om Lånborts grunnleggende produktmodell.

Typiske eksempler er:

- konkrete terskler, frister og standardverdier
- felt og metadata som må fastsettes
- detaljer i brukerflyt eller interaksjonsmønstre
- tekniske mekanismer og arkitekturvalg som ennå ikke har tilstrekkelig beslutningsgrunnlag
- valg som avhenger av juridisk, sikkerhetsmessig eller teknisk avklaring

Reelle spørsmål om produktets grunnmodell hører fortsatt hjemme i [visjonens åpne spørsmål](vision/open-questions.md).

## Arbeidsregel

- Hvert åpent spørsmål får en permanent ID: `OD-0001`, `OD-0002` osv.
- Angi hvilket lag som eier spørsmålet: **produktspesifikasjon**, **UX**, **arkitektur** eller **tverrgående**.
- Beskriv spørsmålet kort og konkret. Ikke skriv en full utredning her.
- Pek ved behov til relevante krav, UX-regler, visjonskilder eller andre dokumenter.
- Et åpent detaljvalg er **ikke** en normativ beslutning og skal derfor ikke brukes som kilde for implementering.
- Når spørsmålet avgjøres, føres selve beslutningen inn i det kanoniske dokumentet som eier den.
- Den avgjorte posten beholdes kort under «Avklart» med lenke til den kanoniske beslutningen. Registeret skal ikke duplisere beslutningsteksten.

## Mal

```md
### OD-0001 — Kort spørsmål

- **Lag:** Produktspesifikasjon | UX | Arkitektur | Tverrgående
- **Status:** Åpen
- **Berører:** PS-..., UX-..., VP-... eller relevante dokumentlenker
- **Spørsmål:** Hva må avgjøres?
- **Avhenger av:** Eventuell analyse, juridisk avklaring, teknisk undersøkelse eller annet beslutningsgrunnlag.
```

Når spørsmålet er avgjort:

```md
### OD-0001 — Kort spørsmål

- **Lag:** ...
- **Status:** Avklart
- **Beslutning:** Se [kanonisk dokument](...).
```

## Åpne

### OD-0001 — Plattformpolicy for regulerte og risikofylte objekter
- **Lag:** Tverrgående
- **Status:** Åpen
- **Berører:** VP-17, PS-OBJ-017
- **Spørsmål:** Hvilke objektkategorier skal forbys, begrenses eller kreve særvilkår?
- **Avhenger av:** Juridisk og sikkerhetsmessig vurdering før bred lansering.

### OD-0002 — Oppbevaringstider per datatype
- **Lag:** Tverrgående
- **Status:** Åpen
- **Berører:** PS-ADM-011, PS-NFR-009, PS-NFR-013
- **Spørsmål:** Hvor lenge skal låne-, saks-, modererings-, sikkerhets- og øvrige historikkdata bevares?
- **Avhenger av:** Produktbehov, personvern og juridisk vurdering.

### OD-0003 — Dokumentasjonskrav ved dødsfall eller varig utilgjengelighet
- **Lag:** Produktspesifikasjon
- **Status:** Åpen
- **Berører:** PS-ADM-007, PS-ADM-008
- **Spørsmål:** Hvilket bevisnivå kreves for å verifisere forholdet og en legitim representant?
- **Avhenger av:** Misbruksrisiko og juridisk vurdering.
- **Inntil besluttet (Peder, 4. oktober 2026):** Særprosessen er utsatt og inngår ikke i piloten. Ingen representant kan få tilgang før en senere, eksplisitt policy tillater det, og ingen del av produktet er bygget for å gi slik tilgang. En melding om mulig dødsfall eller varig utilgjengelighet (PS-COM-015) åpner bare en fortrolig verifikasjonssak og endrer verken konto, lån eller tilganger, heller ikke når saken er behandlet og lukket. Automatiske tester holder dette fast i både domene og database (WP-54), og må endres bevisst sammen med denne beslutningen.

### OD-0004 — Endelige eksterne varslingskanaler og standardvalg
- **Lag:** UX
- **Status:** Åpen
- **Berører:** PS-COM-003
- **Spørsmål:** Hvilke kombinasjoner av web push, e-post og eventuell senere mobilpush skal være standard for hvert varslingsnivå?
- **Avhenger av:** Pilotdata og teknisk støtte.

### OD-0006 — Endelig kategoritaksonomi for objekter
- **Lag:** Produktspesifikasjon
- **Status:** Åpen
- **Berører:** PS-OBJ-002
- **Spørsmål:** Hvilke kategorier og underkategorier skal pilotversjonen tilby?
- **Avhenger av:** Faktisk innhold i pilotmiljøet og OD-0001.

### OD-0007 — Juridisk lanseringsgjennomgang
- **Lag:** Tverrgående
- **Status:** Åpen
- **Berører:** produktvilkår, personvern, moderering, risikofylte objekter
- **Spørsmål:** Hvilke konkrete norske/EØS-krav må innarbeides i vilkår, personvern, moderering, datalivssyklus og tilgjengelighet før bred lansering?
- **Avhenger av:** Kvalifisert juridisk vurdering av gjeldende rett.

### OD-0008 — Uavhengig behandling av alvorlige saker om plattformforvaltningen
- **Lag:** Tverrgående
- **Status:** Åpen
- **Berører:** PS-ADM-013
- **Spørsmål:** Hvilken organisatorisk ordning skal brukes dersom alle interne plattformforvaltere er inhabile?
- **Avhenger av:** Organisasjonsform og skala før bred lansering.

### OD-0010 — Mekanisme for privilegert autentisering
- **Lag:** Tverrgående
- **Status:** Åpen
- **Berører:** PS-USR-008, PS-USR-009, [autorisasjon og tilgang](architecture/04-autorisasjon-og-tilgang.md), ADR-0007, WP-12
- **Spørsmål:** Hvilken konkret autentiseringsmekanisme skal gi det ekstra sikkerhetsnivået som kreves for plattformforvaltere og andre særskilt privilegerte handlinger?
- **Avhenger av:** Sammenligning av sikkerhet, brukeropplevelse, recovery, leverandørmodenhet og kostnad for aktuelle alternativer, blant annet passkeys/WebAuthn, TOTP og leverandørbasert sterk re-autentisering. Vanlige brukere skal ikke gjøres avhengige av MFA som følge av denne beslutningen. Ingen mekanisme er godkjent; passkeys/WebAuthn er et interessant alternativ, men ikke besluttet, og TOTP/autentiseringsapp skal ikke innføres som produktegenskap uten en eksplisitt beslutning her.
- **Sperre:** Må avklares før privilegerte plattformforvalterhandlinger tas i reell bruk, men ikke før det mekanismenøytrale grunnlaget (WP-12) bygges og integreres. Til da avvises slike handlinger ([autorisasjon og tilgang](architecture/04-autorisasjon-og-tilgang.md)).
- **Utredning:** [Mekanisme for privilegert autentisering](architecture/utredninger/OD-0010-privilegert-autentisering.md) anbefaler WebAuthn (passkey eller sikkerhetsnøkkel) som andre faktor bare for plattformforvaltere. Anbefalingen er ikke vedtatt.

### OD-0011 — Framtidig Vipps-innlogging og identitetsgrunnlag
- **Lag:** Tverrgående
- **Status:** Åpen
- **Berører:** PS-USR-001, [brukeridentitet og grunnkrav](vision/02-brukere-roller-og-relasjoner.md), ADR-0007
- **Spørsmål:** Skal Vipps på sikt brukes som foretrukket eller alternativ innlogging og som sterkere identitetsgrunnlag for norske brukere, og i så fall hvordan skal dette samspille med dagens konto- og autentiseringsmodell?
- **Avhenger av:** Teknisk og kontraktsmessig utredning av Vipps Login, hvilke verifiserte identitetsopplysninger og sikkerhetsgarantier tjenesten faktisk gir, personvern, recovery og alternativ tilgang for brukere som ikke kan eller ønsker å bruke Vipps. Kostnad og mulig sponsor-/samarbeidsmodell med Vipps kan inngå i vurderingen, men skal ikke være en teknisk forutsetning. Det skal også vurderes særskilt om fersk Vipps-autentisering kan ha en rolle ved privilegert re-autentisering.

### OD-0012 — Avstemningsfrist ved skjult → lukket
- **Lag:** Produktspesifikasjon
- **Status:** Åpen
- **Berører:** PS-ENV-008, VP-08
- **Spørsmål:** Hvor lang frist skal medlemmene ha til å stemme når et skjult miljø foreslås gjort lukket? Visjonen viser til «den fastsatte avstemningsfristen», men angir ingen lengde. Inntil dette er besluttet, avviser implementasjonen å starte en slik avstemning; selve avstemningsreglene (2/3 av alle aktive) er bygget og testet. Fristen settes ett sted (`typeChangeDays`).
- **Avhenger av:** Produktvurdering.

### OD-0013 — Hvor venner finner hverandres objekter
- **Lag:** Produktspesifikasjon / UX
- **Status:** Åpen
- **Berører:** PS-LOAN-001, PS-USR-004
- **Spørsmål:** Hvilken flate skal en venn bruke for å se eiernes objekter før en direkte låneforespørsel? Inntil dette er besluttet, finnes ingen liste over venners objekter. Forhåndsvisningen av en direkte forespørsel svarer bare for et objekt-ID den som spør allerede har, og bare når vedkommende er venn med en eier.
- **Avhenger av:** Produktvurdering og UX for direkte vennelån.

### OD-0014 — Vesentlig eller redaksjonell vilkårsendring
- **Lag:** Produktspesifikasjon
- **Status:** Åpen
- **Berører:** PS-LOAN-005
- **Spørsmål:** Hvordan skilles en vesentlig vilkårsendring fra en redaksjonell? Vilkårene er fritekst, så systemet kan ikke avgjøre det selv. Inntil dette er besluttet, krever enhver endring i objektets lånevilkår ny bekreftelse fra låntaker. Andre endringer (tittel, beskrivelse, bilder) gjør det ikke. Regelen står ett sted (`app.loan_terms_differ`).
- **Avhenger av:** Produktvurdering, eventuelt et valg for eier om endringen er vesentlig.

### OD-0015 — Meldingen i en låneforespørsel og ende-til-ende-kryptering
- **Lag:** Produktspesifikasjon / Arkitektur
- **Status:** Åpen
- **Berører:** PS-LOAN-004, PS-COM-005, PS-COM-006, PS-NFR-007, OD-0005
- **Spørsmål:** Er meldingen i en låneforespørsel privat fritekst som skal ende-til-ende-krypteres (PS-COM-005), eller del av den strukturerte henvendelsen (PS-COM-006)? Inntil dette er besluttet, lagres den på forespørselen, vises bare for partene og kopieres aldri til hendelser eller logger. Kommer den inn under kryptering, flyttes den til chatten (WP-43).
- **Avhenger av:** Produktvurdering. Krypteringsmodellen er avgjort i [ADR-0010](architecture/decisions/ADR-0010-e2ee-protokoll-enheter-og-recovery.md).

### OD-0016 — Når ansvarlig utlåner regnes som reelt utilgjengelig
- **Lag:** Produktspesifikasjon
- **Status:** Åpen
- **Berører:** PS-LOAN-009, PS-LOAN-015, PS-LOAN-021, scenario 10, OD-0003
- **Spørsmål:** Hva skal til før ansvarlig utlåner regnes som reelt utilgjengelig for et lån, slik at en medeier kan overta ansvaret eller bekrefte fysisk mottak i den snevre rollen? Hvem fastslår det (frist uten svar, melding fra medeier eller låntaker, saksbehandling), og hvordan skilles det fra kortvarig fravær og fra død/varig utilgjengelighet (OD-0003)? Inntil dette er besluttet, registrerer ingen del av produktet utilgjengelighet. Overtakelse og snever mottaksbekreftelse er ferdig bygget og testet, men kan først tas i bruk når denne beslutningen gir dem en kilde. Frivillig overføring virker uavhengig av dette.
- **Avhenger av:** Produktvurdering, eventuelt saksbehandlingen (WP-45) og OD-0003.

### OD-0017 — Hvem avslutter et lån som administrativt uavklart, og når
- **Lag:** Produktspesifikasjon
- **Status:** Åpen
- **Berører:** PS-LOAN-018, PS-LOAN-019, PS-COM-011, OD-0010
- **Spørsmål:** Hvem kan avslutte et lån som administrativt uavklart (miljøets administrator som mekler, plattformforvalter, en frist uten avklaring, eller partene selv), og etter hvilken prosess? Visjonen sier at dette fastsettes senere, og at administratoren i et miljølån er mekler, ikke dommer. Inntil dette er besluttet, kan bare en egen prosess avslutte et lån slik, og ingenting i produktet kjører den. Selve avslutningen, sperren av objektet og eiers bekreftelse av kontroll før nye lån er ferdig bygget og testet. Gjelder det også direkte vennelån, som ikke har noen administrator?
- **Avhenger av:** Produktvurdering, eventuelt OD-0010 for plattformforvalter.

### OD-0018 — Når en konto regnes som inaktiv
- **Lag:** Produktspesifikasjon
- **Status:** Åpen
- **Berører:** PS-ADM-001, pilotregel for inaktivitet (docs/product-spec/07)
- **Spørsmål:** Etter hvor lang tids inaktivitet skal en konto settes i dvale, hva regnes som aktivitet, og hvilket varsel (kanal, frist) skal brukeren få før det skjer? Dvalemekanismen er bygget (`account.make_dormant`, bare for prosessen `account.inactivity`), men ingen jobb kaller den før dette er besluttet.
- **Avhenger av:** Produktvurdering, varslingskanaler (OD-0004) og eventuelt OD-0002.

### OD-0019 — Hvilke abonnementshendelser som varsles, og hvor ofte
- **Lag:** Produktspesifikasjon / UX
- **Status:** Åpen
- **Berører:** PS-OBJ-014, PS-COM-003, [visjon 04](vision/04-utlansobjekter.md) («Abonnement», «Vesentlige endringer»)
- **Spørsmål:** Hvilke hendelser skal et objektabonnement varsle om som standard, hvilke kan brukeren velge selv, og hvor ofte kan samme person varsles om et objekt (visjonen nevner omtrent hver andre time for hyppige redigeringer)? Gjelder det for eksempel endret tittel, beskrivelse, vilkår eller bilder? Inntil dette er besluttet, varsler et abonnement bare at objektet er blitt tilgjengelig for nye lån igjen, som visjonen fremhever; endringer i innholdet varsler ingen abonnenter. Nye regler legges inn ved siden av den regelen og samme tilgangskontroll.
- **Avhenger av:** Produktvurdering og varslingspreferanser (OD-0004).

### OD-0020 — Hvem kan stenge lånelogistikk-kanalen tidlig
- **Lag:** Produktspesifikasjon
- **Status:** Åpen
- **Berører:** PS-COM-007, PS-USR-007, VP-11
- **Spørsmål:** Hvem kan stenge logistikk-kanalen for et lån før lånet er avsluttet, ved trakassering eller særskilt sikkerhetsrisiko: hver av partene selv, plattformforvalter etter en rapport, eller begge? Kravet sier at kanalen kan stenges tidligere, men ikke av hvem. Inntil dette er besluttet, stenges kanalen bare når lånet avsluttes eller partene byttes. Selve stengingen er bygget og testet (endelig, også ved ny blokkering), men bare prosessen `loan_logistics.safety_closures` kan utføre den, og ingenting i produktet kjører den. Beslutningen legger sin vei inn der.
- **Avhenger av:** Produktvurdering av trakassering, sikkerhet og hva den andre parten mister.

## Avklart

### OD-0005 — Kryptografisk modell for ende-til-ende-kryptert chat
- **Lag:** Arkitektur
- **Status:** Avklart
- **Beslutning:** Se [ADR-0010](architecture/decisions/ADR-0010-e2ee-protokoll-enheter-og-recovery.md).

### OD-0009 — Konkret implementeringsstack og driftsleverandører
- **Lag:** Arkitektur
- **Status:** Avklart
- **Beslutning:** Se [ADR-0006](architecture/decisions/ADR-0006-applikasjonsstack-og-runtime.md), [ADR-0007](architecture/decisions/ADR-0007-supabase-data-auth-og-storage.md) og [ADR-0008](architecture/decisions/ADR-0008-integrasjoner-og-drift.md).
