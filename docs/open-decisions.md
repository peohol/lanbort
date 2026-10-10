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
- **Avklares før:** Milepælen eller funksjonen som ikke kan gå videre uten beslutningen.
```

Når spørsmålet er avgjort:

```md
### OD-0001 — Kort spørsmål

- **Lag:** ...
- **Status:** Avklart
- **Beslutning:** Se [kanonisk dokument](...).
```

## Status før UI-arbeidet

Gjennomgått 6. oktober 2026. Ingen åpne spørsmål blokkerer UI-arbeidet som helhet. De to som gjorde det, [OD-0013](#od-0013--hvor-venner-finner-hverandres-objekter) og [OD-0015](#od-0015--meldingen-i-en-låneforespørsel-og-ende-til-ende-kryptering), ble avgjort samme dag. Planleggingen av brukerflaten avdekket [OD-0024](#od-0024--om-eieren-vises-på-tingene-i-et-miljø), som ble avgjort samme dag. [Skjerm- og flytinventaret](ux/08-skjerm-og-flytinventar.md) avdekket to til, [OD-0025](#od-0025--fjerning-og-utestengelse-av-aktive-medlemmer-i-et-miljø) og [OD-0026](#od-0026--hvor-plattformforvalterens-inngrep-på-kontoer-og-miljøer-gjøres), som bare berører miljøadministrasjon og plattformforvalterens flater. Profilbildet avdekket [OD-0027](#od-0027--formen-profilbildet-vises-i), og designet for personer, venner og tillit avdekket OD-0028–OD-0032. Disse seks ble avgjort 9. oktober 2026. Gjennomgangen av kjerneflyt 5 (samtaler og enheter) samme dag avdekket [OD-0043](#od-0043--varsler-om-nye-meldinger-i-privat-chat), [OD-0044](#od-0044--når-gjenopprettingsnøkkelen-for-privat-chat-tilbys) og [OD-0045](#od-0045--én-privat-samtale-per-person-eller-per-lån), som ble avgjort samme dag. Designet for lånets side og anmeldelser avdekket [OD-0033](#od-0033--hvordan-skade-mangel-eller-tap-registreres-på-et-lån)–[OD-0036](#od-0036--varsel-når-anmeldelsene-blir-synlige), som ble avgjort samme dag. Designet for rapportering, saker og konfliktløsning avdekket OD-0038–OD-0042, som også ble avgjort samme dag. De andre åpne spørsmålene gjelder drift, juridisk avklaring eller funksjoner som står avslått til de er avgjort; UI-et viser ikke slike funksjoner før beslutningen finnes. Feltet «Avklares før» sier til når hvert av dem må avgjøres.

## Åpne

### OD-0001 — Plattformpolicy for regulerte og risikofylte objekter
- **Lag:** Tverrgående
- **Status:** Åpen
- **Berører:** VP-17, PS-OBJ-017
- **Spørsmål:** Hvilke objektkategorier skal forbys, begrenses eller kreve særvilkår?
- **Avhenger av:** Juridisk og sikkerhetsmessig vurdering før bred lansering.
- **Pilot:** Piloten har en konservativ grense uten særvilkår ([PS-OBJ-019](product-spec/03-utlansobjekter.md)). Spørsmålet gjelder bred lansering og om noe av det som venter, kan åpnes.
- **Avklares før:** bred lansering (Port E). Pilotgrensen gjelder til da.

### OD-0002 — Oppbevaringstider per datatype
- **Lag:** Tverrgående
- **Status:** Åpen
- **Berører:** PS-ADM-011, PS-NFR-009, PS-NFR-013
- **Spørsmål:** Hvor lenge skal låne-, saks-, modererings-, sikkerhets- og øvrige historikkdata bevares?
- **Avhenger av:** Produktbehov, personvern og juridisk vurdering.
- **Avklares før:** pilot med reelle brukere (Port D) som en eksplisitt pilotpolicy; endelige regler før bred lansering (Port E).

### OD-0003 — Dokumentasjonskrav ved dødsfall eller varig utilgjengelighet
- **Lag:** Produktspesifikasjon
- **Status:** Åpen
- **Berører:** PS-ADM-007, PS-ADM-008
- **Spørsmål:** Hvilket bevisnivå kreves for å verifisere forholdet og en legitim representant?
- **Avhenger av:** Misbruksrisiko og juridisk vurdering.
- **Inntil besluttet (Peder, 4. oktober 2026):** Særprosessen er utsatt og inngår ikke i piloten. Ingen representant kan få tilgang før en senere, eksplisitt policy tillater det, og ingen del av produktet er bygget for å gi slik tilgang. En melding om mulig dødsfall eller varig utilgjengelighet (PS-COM-015) åpner bare en fortrolig verifikasjonssak og endrer verken konto, lån eller tilganger, heller ikke når saken er behandlet og lukket. Automatiske tester holder dette fast i både domene og database (WP-54), og må endres bevisst sammen med denne beslutningen.
- **Avklares før:** representanttilgang eventuelt skal aktiveres. Utsatt og utenfor piloten.

### OD-0004 — Endelige eksterne varslingskanaler og standardvalg
- **Lag:** UX
- **Status:** Åpen
- **Berører:** PS-COM-003
- **Spørsmål:** Hvilke kombinasjoner av web push, e-post og eventuell senere mobilpush skal være standard for hvert varslingsnivå?
- **Avhenger av:** Pilotdata og teknisk støtte.
- **Avklares før:** kan avgjøres gradvis med pilotdata (WP-41). UI-design bygger på de tre varslingsnivåene, varslingssenteret og e-post.

### OD-0007 — Juridisk lanseringsgjennomgang
- **Lag:** Tverrgående
- **Status:** Åpen
- **Berører:** produktvilkår, personvern, moderering, risikofylte objekter
- **Spørsmål:** Hvilke konkrete norske/EØS-krav må innarbeides i vilkår, personvern, moderering, datalivssyklus og tilgjengelighet før bred lansering?
- **Avhenger av:** Kvalifisert juridisk vurdering av gjeldende rett.
- **Avklares før:** bred lansering (Port E).

### OD-0008 — Uavhengig behandling av alvorlige saker om plattformforvaltningen
- **Lag:** Tverrgående
- **Status:** Åpen
- **Berører:** PS-ADM-013
- **Spørsmål:** Hvilken organisatorisk ordning skal brukes dersom alle interne plattformforvaltere er inhabile?
- **Avhenger av:** Organisasjonsform og skala før bred lansering.
- **Avklares før:** bred lansering (Port E), dersom organisasjonen har behovet.

### OD-0011 — Framtidig Vipps-innlogging og identitetsgrunnlag
- **Lag:** Tverrgående
- **Status:** Åpen
- **Berører:** PS-USR-001, [brukeridentitet og grunnkrav](vision/02-brukere-roller-og-relasjoner.md), ADR-0007
- **Spørsmål:** Skal Vipps på sikt brukes som foretrukket eller alternativ innlogging og som sterkere identitetsgrunnlag for norske brukere, og i så fall hvordan skal dette samspille med dagens konto- og autentiseringsmodell?
- **Avhenger av:** Teknisk og kontraktsmessig utredning av Vipps Login, hvilke verifiserte identitetsopplysninger og sikkerhetsgarantier tjenesten faktisk gir, personvern, recovery og alternativ tilgang for brukere som ikke kan eller ønsker å bruke Vipps. Kostnad og mulig sponsor-/samarbeidsmodell med Vipps kan inngå i vurderingen, men skal ikke være en teknisk forutsetning. Det skal også vurderes særskilt om fersk Vipps-autentisering kan ha en rolle ved privilegert re-autentisering.
- **Avklares før:** ingen fast frist. Dagens innlogging med e-postkode gjelder.

### OD-0014 — Vesentlig eller redaksjonell vilkårsendring
- **Lag:** Produktspesifikasjon
- **Status:** Åpen
- **Berører:** PS-LOAN-005
- **Spørsmål:** Hvordan skilles en vesentlig vilkårsendring fra en redaksjonell? Vilkårene er fritekst, så systemet kan ikke avgjøre det selv. Inntil dette er besluttet, krever enhver endring i objektets lånevilkår ny bekreftelse fra låntaker. Andre endringer (tittel, beskrivelse, bilder) gjør det ikke. Regelen står ett sted (`app.loan_terms_differ`).
- **Avhenger av:** Produktvurdering, eventuelt et valg for eier om endringen er vesentlig.
- **Avklares før:** kan vente. Dagens strenge regel (enhver vilkårsendring krever ny bekreftelse) er trygg å designe etter.

### OD-0016 — Når ansvarlig utlåner regnes som reelt utilgjengelig
- **Lag:** Produktspesifikasjon
- **Status:** Åpen
- **Berører:** PS-LOAN-009, PS-LOAN-015, PS-LOAN-021, scenario 10, OD-0003
- **Spørsmål:** Hva skal til før ansvarlig utlåner regnes som reelt utilgjengelig for et lån, slik at en medeier kan overta ansvaret eller bekrefte fysisk mottak i den snevre rollen? Hvem fastslår det (frist uten svar, melding fra medeier eller låntaker, saksbehandling), og hvordan skilles det fra kortvarig fravær og fra død/varig utilgjengelighet (OD-0003)? Inntil dette er besluttet, registrerer ingen del av produktet utilgjengelighet. Overtakelse og snever mottaksbekreftelse er ferdig bygget og testet, men kan først tas i bruk når denne beslutningen gir dem en kilde. Frivillig overføring virker uavhengig av dette.
- **Avhenger av:** Produktvurdering, eventuelt saksbehandlingen (WP-45) og OD-0003.
- **Avklares før:** overtakelse og snever mottaksbekreftelse tas i bruk.

### OD-0017 — Hvem avslutter et lån som administrativt uavklart, og når
- **Lag:** Produktspesifikasjon
- **Status:** Åpen
- **Berører:** PS-LOAN-018, PS-LOAN-019, PS-COM-011, OD-0010
- **Spørsmål:** Hvem kan avslutte et lån som administrativt uavklart (miljøets administrator som mekler, plattformforvalter, en frist uten avklaring, eller partene selv), og etter hvilken prosess? Visjonen sier at dette fastsettes senere, og at administratoren i et miljølån er mekler, ikke dommer. Inntil dette er besluttet, kan bare en egen prosess avslutte et lån slik, og ingenting i produktet kjører den. Selve avslutningen, sperren av objektet og eiers bekreftelse av kontroll før nye lån er ferdig bygget og testet. Gjelder det også direkte vennelån, som ikke har noen administrator?
- **Avhenger av:** Produktvurdering, eventuelt OD-0010 for plattformforvalter.
- **Avklares før:** administrativ avslutning tas i bruk.

### OD-0018 — Når en konto regnes som inaktiv
- **Lag:** Produktspesifikasjon
- **Status:** Åpen
- **Berører:** PS-ADM-001, pilotregel for inaktivitet (docs/product-spec/07)
- **Spørsmål:** Etter hvor lang tids inaktivitet skal en konto settes i dvale, hva regnes som aktivitet, og hvilket varsel (kanal, frist) skal brukeren få før det skjer? Dvalemekanismen er bygget (`account.make_dormant`, bare for prosessen `account.inactivity`), men ingen jobb kaller den før dette er besluttet.
- **Avhenger av:** Produktvurdering, varslingskanaler (OD-0004) og eventuelt OD-0002.
- **Avklares før:** automatisk dvale tas i bruk.

### OD-0019 — Hvilke abonnementshendelser som varsles, og hvor ofte
- **Lag:** Produktspesifikasjon / UX
- **Status:** Åpen
- **Berører:** PS-OBJ-014, PS-COM-003, [visjon 04](vision/04-utlansobjekter.md) («Abonnement», «Vesentlige endringer»)
- **Spørsmål:** Hvilke hendelser skal et objektabonnement varsle om som standard, hvilke kan brukeren velge selv, og hvor ofte kan samme person varsles om et objekt (visjonen nevner omtrent hver andre time for hyppige redigeringer)? Gjelder det for eksempel endret tittel, beskrivelse, vilkår eller bilder? Inntil dette er besluttet, varsler et abonnement bare at objektet er blitt tilgjengelig for nye lån igjen, som visjonen fremhever; endringer i innholdet varsler ingen abonnenter. Nye regler legges inn ved siden av den regelen og samme tilgangskontroll.
- **Avhenger av:** Produktvurdering og varslingspreferanser (OD-0004).
- **Avklares før:** kan vente. Dagens regel (varsel når objektet blir tilgjengelig igjen) er trygg å designe etter.

### OD-0021 — Hvem kan utnevne plattformforvaltere i appen
- **Lag:** Tverrgående
- **Status:** Åpen
- **Berører:** PS-USR-008, WP-12
- **Spørsmål:** Skal plattformforvaltere kunne utnevnes og fjernes inne i appen, og i så fall av hvem? Inntil dette er besluttet, skjer det bare med den revisjonsloggede driftskommandoen.
- **Avklares før:** kan vente. Driftskommandoen dekker behovet.

### OD-0022 — Backupnivå for piloten
- **Lag:** Arkitektur
- **Status:** Åpen
- **Berører:** PS-NFR-014, [ADR-0009](architecture/decisions/ADR-0009-backup-i-utviklingsfasen.md), WP-72
- **Spørsmål:** Hvilket backupnivå skal piloten ha: betalt Supabase-plan med daglig backup (eventuelt Point-in-Time Recovery), planlagte krypterte dumps på gratisplanen, eller lengre RPO for en liten pilot? Inntil dette er besluttet, beholdes Supabase Free med gjenoppbygging og manuelle dumps (produkteier, 6. oktober 2026).
- **Avklares før:** appen åpnes for et eksternt testpanel (Port D).

### OD-0023 — Registrering og recovery for plattformforvalteres WebAuthn
- **Lag:** Tverrgående
- **Status:** Åpen
- **Berører:** PS-USR-008, [ADR-0011](architecture/decisions/ADR-0011-webauthn-for-plattformforvaltere.md), WP-12
- **Spørsmål:** Hvordan registrerer en plattformforvalter passkeys eller sikkerhetsnøkler, hvor mange må være registrert før rollen virker, og hvordan gjenopprettes tilgang når én eller alle går tapt? [Utredningen](architecture/utredninger/OD-0010-privilegert-autentisering.md#anbefalt-modell-i-detalj) anbefaler minst to autentikatorer, en engangs registreringskode som overleveres utenom e-post, og en revisjonslogget driftsvei ved tap av alle.
- **Avklares før:** WebAuthn-mekanismen bygges (WP-12), og dermed før privilegerte plattformforvalterhandlinger tas i bruk (Port D). Til da er de avvist.

### OD-0025 — Fjerning og utestengelse av aktive medlemmer i et miljø
- **Lag:** Produktspesifikasjon
- **Status:** Åpen
- **Berører:** PS-ENV-004, PS-TRUST-013, PS-TRUST-016, PS-USR-009, [visjon 03](vision/03-miljoer.md) («Kontinuitet ved avvikling, utestengelse og manglende administrasjon»), [skjerm- og flytinventaret](ux/08-skjerm-og-flytinventar.md#medlemmer-og-utestengelse)
- **Spørsmål:** Visjonen forutsetter at et medlem kan bli utestengt etter at et lån er godkjent, og at administratorene modererer i eget miljø, men verken visjonen eller spesifikasjonen sier om lokal moderering kan avslutte et aktivt medlemskap eller stenge medlemmet ute fra nye forsøk. Hvis ja: kreves en rapport eller sak som grunnlag, hvilke kriterier og konsekvenser gjelder, er avslutning av medlemskap og sperre mot nytt forsøk to separate tiltak, og hva får medlemmet vite? Den etablerte rollemodellen sier allerede at alle administratorer har samme løpende myndighet i ordinær drift, mens eieren bare har særskilte organisatoriske fullmakter; dette detaljvalget åpner derfor ikke et nytt eier-vs.-administrator-skille. I dag kan noen bare stenges ute når en søknad avslås, og de lokale tiltakene i en rapport gjelder publiseringer, ikke medlemskap. Inntil dette er besluttet, har administratorene ingen handling for å fjerne et aktivt medlem.
- **Avhenger av:** Produktvurdering av miljøadministratorens myndighet og habilitet.
- **Avklares før:** miljøadministrasjonen skal kunne fjerne medlemmer. Til da vises ingen slik handling.
- **Anbefaling:** La habile administratorer avslutte et aktivt medlemskap med begrunnelse, eventuelt også stenge for nye forsøk, som et sporbart modereringstiltak (PS-TRUST-016) med samme virkning på pågående lån som utmelding.

### OD-0026 — Hvor plattformforvalterens inngrep på kontoer og miljøer gjøres
- **Lag:** UX
- **Status:** Åpen
- **Berører:** UX-IA-007, UX-PRIV-006, PS-ADM-003, PS-ADM-009, PS-ADM-010, PS-ADM-014, PS-TRUST-016, [visjon 03](vision/03-miljoer.md) («Administrasjon»), OD-0023, [skjerm- og flytinventaret](ux/08-skjerm-og-flytinventar.md#inngrep-på-kontoer)
- **Spørsmål:** UX-modellen sier at plattformforvalterens handlinger ligger «i relevant plattformkontekst» og at forvalterne får en arbeidskø, men ikke hvor inngrep som ikke hører til én bestemt rapport gjøres: suspensjon og gjeninnsetting, kontrollert kontoavslutning, duplikat og falsk identitet, og inngrep mot misbruk av en administrator- eller eierrolle i et miljø. Skal slike inngrep alltid startes fra en sak i plattformkøen, fra personens eller miljøets side for den som har rollen, eller fra en egen plattformflate?
- **Avhenger av:** Fase 7 i [planen for UI-designfasen](planning/ui-design-plan.md) og OD-0023.
- **Avklares før:** plattformforvalterens flater designes og vises (etter OD-0023). Til da finnes ingen slik flate i appen.
- **Anbefaling:** Start alle inngrep fra en sak i plattformkøen, slik at begrunnelse, habilitet og historikk følger saken (PS-TRUST-016, PS-ADM-014), og vis ingen forvalterhandlinger på ordinære person- og miljøsider.

## Avklart

### OD-0050 — Varsel til søkeren når en søknad er avgjort
- **Lag:** Produktspesifikasjon
- **Status:** Avklart (produkteier, 10. oktober 2026)
- **Beslutning:** Se [PS-ENV-017](product-spec/02-miljoer.md). Varsel i appen både ved godkjenning og avslag; godkjenningen leder til miljøet med velkomsten, avslaget er nøytralt uten begrunnelse eller hvem som avgjorde.

### OD-0054 — Eiernavn når en ting er delt direkte med venner
- **Lag:** Produktspesifikasjon
- **Status:** Avklart (produkteier, 10. oktober 2026)
- **Beslutning:** Se [PS-OBJ-022](product-spec/03-utlansobjekter.md). Navnet vises bare for eiere betrakteren selv er venn med, også ved medeierskap, og håndheves på serveren.

### OD-0048 — Omtrentlig medlemstall før medlemskap
- **Lag:** Produktspesifikasjon
- **Status:** Avklart (produkteier, 10. oktober 2026)
- **Beslutning:** Se [PS-ENV-016](product-spec/02-miljoer.md). Rundet tall: «under 10 medlemmer» for små miljøer, ellers nærmeste ti.

### OD-0049 — Tingens bilder på lånets side
- **Lag:** Produktspesifikasjon
- **Status:** Avklart (produkteier, 10. oktober 2026)
- **Beslutning:** Se [PS-OBJ-021](product-spec/03-utlansobjekter.md#ps-obj-021--den-som-ser-tingens-navn-ser-også-bildene).

### OD-0038 — Hva den som rapporterte, får vite når saken lukkes
- **Lag:** Produktspesifikasjon / UX
- **Status:** Avklart (produkteier, 9. oktober 2026)
- **Beslutning:** Se [PS-COM-020](product-spec/05-kommunikasjon-varsler-og-saker.md). En rapport eller mekling lukkes med en kort avslutningsmelding til partene, uten konfidensielle vurderinger, tiltak mot andre, andres beskyttede opplysninger eller hvem som rapporterte. En mekling kan få en nøytral oppsummering av om partene ble enige. Ikke bygget ennå; kravene står under WP-88 i [UI-arbeidspakkene](implementation/ui-work-packages.md#wp-88--saker-og-arbeidskø).

### OD-0039 — Hva den et modereringstiltak rammer, får vite
- **Lag:** Produktspesifikasjon
- **Status:** Avklart (produkteier, 9. oktober 2026)
- **Beslutning:** Se [PS-TRUST-018](product-spec/06-tillit-anmeldelser-og-moderering.md). Et påkrevd varsel med tiltaket, omfanget, en kort begrunnelse og en vei til ny vurdering, uten å røpe rapporten, melderen eller saksinnhold. Ikke bygget ennå; kravene står under WP-88.

### OD-0040 — Om den som åpnet en sak, kan trekke den
- **Lag:** Produktspesifikasjon
- **Status:** Avklart (produkteier, 9. oktober 2026)
- **Beslutning:** Se [PS-COM-021](product-spec/05-kommunikasjon-varsler-og-saker.md). En henvendelse kan avsluttes av den som tok kontakt. En rapport kan trekkes, men det sletter ikke innsendte opplysninger og stanser ikke en nødvendig vurdering. En mekling lukkes bare av en habil administrator. Ikke bygget ennå; kravene står under WP-88.

### OD-0041 — Åpen mekling når partene selv avklarer lånet
- **Lag:** Produktspesifikasjon / UX
- **Status:** Avklart (produkteier, 9. oktober 2026)
- **Beslutning:** Se [PS-COM-022](product-spec/05-kommunikasjon-varsler-og-saker.md). Ingen automatisk lukking. Saken viser lånets status og at partene har avklart det, med «Lukk saken» som neste steg, uten å gå foran tidskritiske saker i køen. Appen lukker allerede ikke automatisk; visningen er ikke bygget.

### OD-0042 — Rapporter til Lånbort før plattformforvalterne kan behandle dem
- **Lag:** Produktspesifikasjon / UX
- **Status:** Avklart (produkteier, 9. oktober 2026)
- **Beslutning:** Se [UX-EXC-011](ux/03-avvik-konflikter-og-unntaksforlop.md). Anbefalingen ble avvist. Til plattformforvalterne kan behandle saker (OD-0023), tilbyr appen ingen aktiv flyt for rapport til Lånbort; den sier ærlig at det ikke er tilgjengelig ennå og tilbyr miljøets administratorer der de har mandat. Før piloten åpnes, må sikkerhetskritiske meldinger ha en reell, betjent kanal. Appen tilbyr flyten i dag; endringen i brukerflaten står under WP-88, og data og tilgangsregler på serveren er uendret.

### OD-0033 — Hvordan skade, mangel eller tap registreres på et lån
- **Lag:** Produktspesifikasjon / UX
- **Status:** Avklart (produkteier, 9. oktober 2026)
- **Beslutning:** Se [PS-LOAN-023](product-spec/04-laneforlop.md). Begge parter kan registrere skade, mangel eller tap ved returen og senere, som en sporbar hendelse med hvem som opplyste hva. Motparten kan si seg uenig eller legge til sin forklaring. Det er ingen lånestatus og hindrer ikke avslutning når returen er avklart. Bygget 9. oktober 2026 (#95 og lånets side).

### OD-0034 — Hva en medeier som ikke er part, ser av et lån
- **Lag:** UX
- **Status:** Avklart (produkteier, 9. oktober 2026)
- **Beslutning:** Se [UX-PRIV-013](ux/05-kontekst-roller-og-personvern.md) og [UX-JRN-011](ux/02-sentrale-brukerreiser.md). Avgrenset innsyn for medeiere i eierkretsen ved godkjenning eller spurt om ansvaret, håndhevet på serveren. Bygget 9. oktober 2026 (#94 og lånets side).

### OD-0035 — Tilsvar på en anmeldelse uten tekst
- **Lag:** Produktspesifikasjon
- **Status:** Avklart (produkteier, 9. oktober 2026)
- **Beslutning:** Se [PS-TRUST-005](product-spec/06-tillit-anmeldelser-og-moderering.md). Ett tilsvar til alle publiserte anmeldelser, også uten fritekst. Slik virker appen allerede.

### OD-0036 — Varsel når anmeldelsene blir synlige
- **Lag:** Produktspesifikasjon / UX
- **Status:** Avklart (produkteier, 9. oktober 2026)
- **Beslutning:** Se [PS-TRUST-003](product-spec/06-tillit-anmeldelser-og-moderering.md). Ett informasjonsvarsel i appen til hver part når anmeldelser blir synlige, uten duplikater, e-post eller påminnelse som standard. Ikke bygget.

### OD-0045 — Én privat samtale per person eller per lån
- **Lag:** Produktspesifikasjon / UX
- **Status:** Avklart (produkteier, 9. oktober 2026)
- **Beslutning:** Se [PS-COM-017](product-spec/05-kommunikasjon-varsler-og-saker.md). Én privat samtale per personpar, med lenker til og fra lånene; logistikk-kanalen ved blokkering er egen per lån. Én samtale per par er bygget (WP-43). Lenkene er delvis bygget: «Skriv til» fra en venns side og utlånerens «Skriv til» fra forespørselen og lånet; «Gå til samtalen med …» fra forespørselen og lånet, låntakerens lenke og lenken fra et spørsmål om en ting gjenstår.

### OD-0043 — Varsler om nye meldinger i privat chat
- **Lag:** Produktspesifikasjon / UX
- **Status:** Avklart (produkteier, 9. oktober 2026)
- **Beslutning:** Se [PS-COM-018](product-spec/05-kommunikasjon-varsler-og-saker.md) og ADR-0010 punkt 12. Ett samlet informasjonsvarsel per samtale i appen, med navn og antall, uten innhold eller lån; e-post av som standard og generisk. Bygget 9. oktober 2026.

### OD-0044 — Når gjenopprettingsnøkkelen for privat chat tilbys
- **Lag:** UX
- **Status:** Avklart (produkteier, 9. oktober 2026)
- **Beslutning:** Se [PS-COM-019](product-spec/05-kommunikasjon-varsler-og-saker.md). Én gang etter at privat chat er slått på, varig i Mine enheter, og én diskret påminnelse etter at brukeren har begynt å utveksle meldinger. Ikke bygget ennå.

### OD-0027 — Formen profilbildet vises i
- **Lag:** UX
- **Status:** Avklart (produkteier, 9. oktober 2026)
- **Beslutning:** Se [PS-USR-002](product-spec/01-brukere-kontoer-og-relasjoner.md). Sirkel, både der bildet vises og i beskjæringen. Appen viser og beskjærer allerede som sirkel.

### OD-0028 — Varsel om avslag, tilbaketrekking og fjernet vennskap
- **Lag:** Produktspesifikasjon
- **Status:** Avklart (produkteier, 9. oktober 2026)
- **Beslutning:** Se [PS-USR-011](product-spec/01-brukere-kontoer-og-relasjoner.md) og [UX-IA-019](ux/01-informasjonsarkitektur-og-navigasjon.md). Ingen varsel; relasjonen oppdateres, og gamle varsler gir ikke handlinger som har falt bort. Slik virker appen allerede.

### OD-0029 — Ny venneforespørsel etter avslag
- **Lag:** Produktspesifikasjon
- **Status:** Avklart (produkteier, 9. oktober 2026)
- **Beslutning:** Se [PS-USR-012](product-spec/01-brukere-kontoer-og-relasjoner.md). Avsenderen kan ikke sende på nytt før mottakeren selv tar initiativ, vist nøytralt og håndhevet på serveren. Bygget 9. oktober 2026 (se WP-86 i [UI-arbeidspakkene](implementation/ui-work-packages.md#wp-86--personer-venner-og-tillit)).

### OD-0030 — Aktivitetstall på personens side
- **Lag:** Produktspesifikasjon
- **Status:** Avklart (produkteier, 9. oktober 2026)
- **Beslutning:** Se [PS-TRUST-017](product-spec/06-tillit-anmeldelser-og-moderering.md). Ingen generelle aktivitetstall; personlig statistikk kan vurderes senere under Konto.

### OD-0031 — Hvor Konto ligger i navigasjonen
- **Lag:** UX
- **Status:** Avklart (produkteier, 9. oktober 2026)
- **Beslutning:** Se [UX-IA-020](ux/01-informasjonsarkitektur-og-navigasjon.md). Fullskjerms lag på mobil med egen stabel; Tilbake går innenfor Konto, og Lukk går til nøyaktig skjermen brukeren kom fra.

### OD-0032 — Rekkefølgen på rollene i tillitsprofilen
- **Lag:** UX
- **Status:** Avklart (produkteier, 9. oktober 2026)
- **Beslutning:** Se [UX-PRIV-012](ux/05-kontekst-roller-og-personvern.md). Rollen inngangen gjelder, står først; ved nøytrale innganger «Som låntaker», så «Som utlåner».

### OD-0005 — Kryptografisk modell for ende-til-ende-kryptert chat
- **Lag:** Arkitektur
- **Status:** Avklart
- **Beslutning:** Se [ADR-0010](architecture/decisions/ADR-0010-e2ee-protokoll-enheter-og-recovery.md).

### OD-0006 — Kategoritaksonomi for objekter
- **Lag:** Produktspesifikasjon
- **Status:** Avklart
- **Beslutning:** Pilotens kategorier, se [PS-OBJ-018](product-spec/03-utlansobjekter.md). Underkategorier legges til som data når pilotinnholdet viser behov.

### OD-0009 — Konkret implementeringsstack og driftsleverandører
- **Lag:** Arkitektur
- **Status:** Avklart
- **Beslutning:** Se [ADR-0006](architecture/decisions/ADR-0006-applikasjonsstack-og-runtime.md), [ADR-0007](architecture/decisions/ADR-0007-supabase-data-auth-og-storage.md) og [ADR-0008](architecture/decisions/ADR-0008-integrasjoner-og-drift.md).

### OD-0010 — Mekanisme for privilegert autentisering
- **Lag:** Tverrgående
- **Status:** Avklart (produkteier, 6. oktober 2026)
- **Beslutning:** Se [ADR-0011](architecture/decisions/ADR-0011-webauthn-for-plattformforvaltere.md). Passkey/WebAuthn som ekstra sterk bekreftelse, bare for plattformforvaltere; fysisk sikkerhetsnøkkel støttes, men kreves ikke. Registrering og recovery er åpne i OD-0023. Ikke bygget ennå (WP-12).

### OD-0012 — Avstemningsfrist ved skjult → lukket
- **Lag:** Produktspesifikasjon
- **Status:** Avklart (produkteier, 6. oktober 2026)
- **Beslutning:** Se [PS-ENV-008](product-spec/02-miljoer.md). 7 dager til å akseptere eller forlate; den som ikke har akseptert, fjernes når fristen utløper. Bygget i serverdelen av WP-85.

### OD-0024 — Om eieren vises på tingene i et miljø
- **Lag:** Produktspesifikasjon / UX
- **Status:** Avklart (produkteier, 6. oktober 2026)
- **Beslutning:** Se [PS-ENV-015](product-spec/02-miljoer.md). Aktive medlemmer ser medlemslisten og eierne av tingene i miljøet, og kan åpne profilen og sende venneforespørsel derfra. Historisk personvern (PS-ENV-009) gjelder for begge. Medlemslisten bygges i WP-84, eierne på tingene i WP-89.

### OD-0013 — Hvor venner finner hverandres objekter
- **Lag:** Produktspesifikasjon / UX
- **Status:** Avklart (produkteier, 6. oktober 2026)
- **Beslutning:** Se [PS-OBJ-020](product-spec/03-utlansobjekter.md) og [UX-JRN-013](ux/02-sentrale-brukerreiser.md). «Venner» er et eget publiseringsvalg per objekt, av som standard; synlige objekter vises på eierens profil for venner og med filteret «Venner» i Finn, og en direkte låneforespørsel starter derfra. Serverdelen er bygget; UI-et gjenstår (WP-27).

### OD-0015 — Meldingen i en låneforespørsel og ende-til-ende-kryptering
- **Lag:** Produktspesifikasjon / Arkitektur
- **Status:** Avklart (produkteier, 6. oktober 2026)
- **Beslutning:** Se [PS-LOAN-004](product-spec/04-laneforlop.md) og [PS-COM-005](product-spec/05-kommunikasjon-varsler-og-saker.md). Den valgfrie meldingen er del av den strukturerte forespørselen og krypteres ikke ende-til-ende; den er bare synlig for partene og kopieres ikke til hendelser eller logger. Videre fritekst skjer i E2EE-chat. Bygget i WP-83.

### OD-0020 — Hvem kan stenge lånelogistikk-kanalen tidlig
- **Lag:** Produktspesifikasjon
- **Status:** Avklart (produkteier, 6. oktober 2026)
- **Beslutning:** Se [PS-COM-007](product-spec/05-kommunikasjon-varsler-og-saker.md). Ingen part kan stenge samtalen mens lånet pågår; partene kan dempe eller arkivere den. Demping og arkivering er ikke bygget ennå (WP-44).
