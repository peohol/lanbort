# Lukket pilot – gjennomførings- og oppfølgingsplan

> **Status:** Forslag 1.0, 18. oktober 2026. Dette dokumentet er en **offentlig metode- og styringsplan**, ikke en journal over brukere. De konkrete testpunktene har faste ID-er i [testmatrisen](pilot-testmatrise.md).

## 1. Formål, rammer og beslutningsmyndighet

Målet er å undersøke om vanlige brukere klarer å låne og låne bort ting uten veiledning, om de faktisk får nytte av appen, og om normalfunksjoner og relevante avvik fungerer. Dette er en **lukket pilot**, ikke en sikkerhetssertifisering eller en statistisk representativ brukerundersøkelse.

- 8–12 inviterte deltakere over omtrent fem uker, først en liten gruppe på 2–3.
- Minst to aktive miljøadministratorer i testpanelet; alle administratorer prøver også vanlig bruk.
- Minst ett åpent, ett lukket og ett skjult miljø; noen deltakere er venner, andre er ikke venner.
- Mål om omtrent 20–30 reelle, ufarlige registrerte ting og 12–15 fullførte faktiske lån (ikke minstekrav om å låne bort mot egen vilje).
- Egne testkontoer og testting brukes til destruktive og konfliktfylte scenarioer; reelle konflikter skal ikke fremprovoseres.
- Produkteier er ansvarlig for pilotdeltakere, sikkerhetshendelser, prioriteringer og beslutning om utvidelse/avslutning.

**Ikke med i piloten:** Vipps/ny identitetsmodell, betalingsabonnement, globale plattformforvalterinngrep, representanttilgang og andre ikke-aktiverte funksjoner. At disse ikke tilbys feilaktig, inngår i testen. Privat chat er aktivert i den lukkede piloten etter det dokumenterte midlertidige unntaket i [chat-risikovurderingen](chat-pilot-risikovurdering.md); uavhengig kryptografisk gjennomgang gjenstår før bred lansering.

## 2. Oppbevaring, synlighet og tilgang – obligatorisk

Kode-repoet `peohol/lanbort` er offentlig. Her lagres bare **generiske** testbeskrivelser, ID-er, metode, beslutninger og eventuelt **anonymiserte summeringer**. Dette dokumentet og testmatrisen inneholder ingen faktiske pilotdata.

Bygg og bruk en **egen, rollebeskyttet pilotflate i Lånbort** (se [UI-spesifikasjonen](pilot-ui.md)), og lagre faktiske resultater i separate private Supabase-tabeller. Deltakerne og pilotansvarlig skal ikke måtte redigere filer i GitHub eller føre testjournal i chat. Et privat GitHub Project kan eventuelt brukes som sekundær prosjektplan, men **ikke som primær testjournal**. Et offentlig GitHub-issue forblir offentlig selv om det ligger i et privat Project. Ikke lagre sensitivt innhold i offentlige issues, PR-er, Actions-logger eller commit-meldinger.

Anbefalte felt for hver testutførelse i den private journalen:

| Felt | Eksempel/regel |
| --- | --- |
| Test-ID | `L13`; peker til offentlig katalog |
| Status | Ikke startet / Bestått / Feilet / Blokkert / Må testes på nytt / Ikke relevant |
| Fase | 1–5 |
| Tester | Pseudonym `P-01` – ikke navn/e-post |
| Tidspunkt | Dato og klokkeslett |
| Appversjon | Kort commit-SHA eller deploy-ID |
| Miljø | Produksjon / isolert testmiljø |
| Utstyr | Mobil/nettbrett/PC, operativsystem og nettleser |
| Selvstendig utført | Ja / Nei – fikk hjelp |
| Observasjon | Kort, saklig beskrivelse uten personopplysninger |
| Avvik | Privat feilrapportreferanse; alvorlige sårbarheter håndteres separat |

Oppbevar koblingen mellom deltakerpseudonym og faktisk person **adskilt og tilgangsbegrenset**, bare dersom slik kobling er nødvendig. Begrens tilgangen til journalen til produkteier og eventuelle uttrykkelig autoriserte testledere. Deltakerne trenger ikke GitHub-konto for å gi tilbakemelding. Følg eksisterende oppbevaringsregler; fastsett slette-/revisjonsdato for pilotens egen journal før første persondata lagres.

**Rapportkanaler:** Vanlige innspill mottas i en betjent, avtalt privat kanal. Sikkerhetshendelser følger [driftsprosedyren](pilot-operations.md#alvorlige-hendelser) og sårbarheter meldes privat; rapporter om kryptering, autentisering eller personvern legges aldri i offentlige feilbeskrivelser. Ved offentlig kodefeil opprettes kun en sanert, teknisk reproduksjon uten faktiske brukere, nøkler, meldinger eller sårbarhetsdetaljer.

## 3. Faser, oppgaver og beslutningsporter

<!-- generert:pilot-faser start -->
| Fase | Når | Oppgaver | Port for videreføring |
| --- | --- | --- | --- |
| **0. Klargjøring** | 3–5 dager før invitasjoner | Bekreft grønn CI/deploy, beskyttet produksjonsflyt, migrasjoner, varsling, backup/gjenoppretting, kontaktkanal, sperret offentlig registrering, privat journal, samtykke/informasjon | Ingen åpne kritiske feil. Sikkerhets- og tilbakemeldingskanal faktisk betjent |
| **1. Førstegangsbruk** | Dag 1–3, 2–3 personer | Invitasjon, konto, navigasjon, vennskap, miljøinnmelding, registrere ting, første forespørsel, chat; observer uten å instruere på forhånd | Kjerneflytene kan fullføres; P0/P1 stoppere er rettet |
| **2. Hele panelet** | Dag 4–10 | Inviter øvrige, opprett miljøtyper, roller og ting; prøv medlemskap, QR/e-post-vennskap, publisering, søk og varsler | Deltakerne kan bli aktive og finne ting uten systematisk teknisk hinder |
| **3. Vanlige lån** | Dag 11–20 | Faktiske vennelån og miljølån over flere dager; godkjenning/avslag, overlevering, chat, endringer, retur, anmeldelser | Gjentatte normalforløp fungerer fra start til slutt uten fastlåst status |
| **4. Kontrollerte avvik** | Dag 21–28 | Dobbelbooking, kansellering, endrede vilkår, blokkering, returtvist, skade som testdata, lokalt moderering, medeierskap, kontosletting, chat-enheter, miljøavvikling | Alle utvidede scenarioer er testet eller unntaket er begrunnet |
| **5. Selvstendig bruk og avslutning** | Dag 29–35 | Reduser instruksjoner; observer frivillige returer og nye lån; intervjuer; sluttrapport, behandling av aktive forpliktelser | Fullstendig registrert dekning og eksplisitt beslutning om neste fase |
<!-- generert:pilot-faser slutt -->

### Sjekkliste før en fase avsluttes

Fase 0 er en operativ sjekkliste i pilotflaten (**Pilot › Klargjøring**), ikke bare en beskrivelse. Hvert krav er obligatorisk og står som **Bestått**, **Feilet**, **Ikke kontrollert** eller **Krever manuell bekreftelse**. «Bestått» vises bare med dokumentert grunnlag: en automatisk kontroll som serveren har kjørt den siste timen, pilotjournalen selv, eller pilotansvarliges bekreftelse med hvem, når og hvordan det ble kontrollert. «Gå videre til fase 1» er bare mulig når alt er bestått, og serveren avviser det ellers, også ved direkte API-kall.

<!-- generert:pilot-krav start -->
| Fase | Krav | Hvorfor | Kontroll | Slik kontrolleres det |
| :---: | --- | --- | --- | --- |
| 0 | De automatiske testene er grønne | Versjonen deltakerne bruker, har bestått alle de automatiske testene. | Automatisk | Lånbort spør GitHub om testkjøringene for versjonen som er publisert. Alle må være ferdige og uten feil. |
| 0 | Deltakerne får den nyeste versjonen | Appen som er ute, er den nyeste versjonen av hovedgrenen, ikke en eldre versjon eller en prøveversjon. | Automatisk | Lånbort sjekker at den kjører i produksjon, og sammenligner versjonen sin med den nyeste på hovedgrenen (main) i GitHub. |
| 0 | Bare testet kode kan publiseres | Ingen endring skal kunne gå ut til deltakerne før de automatiske testene er grønne. | Automatisk | Lånbort sjekker hos GitHub at hovedgrenen er beskyttet med krav om grønne tester før noe slås sammen. |
| 0 | Databasen er oppdatert | Databasen har alle endringene denne versjonen av appen er laget for. | Automatisk | Lånbort sammenligner databaseendringene appen ble bygget med, med dem som er kjørt i databasen. |
| 0 | Varsler på e-post blir sendt | Deltakerne får e-post om forespørsler og svar, også når de ikke har appen åpen. | Automatisk | Lånbort sjekker at e-postutsendingen er satt opp, at ingen varsel har ventet i køen i over en time, og at ingen er avvist de siste sju dagene. |
| 0 | Gjenoppretting fra sikkerhetskopi er øvd | Vi vet at dataene kan hentes tilbake hvis noe går galt. | Automatisk | Lånbort sjekker hos GitHub at den siste gjenopprettingsøvelsen («Restore drill») var vellykket, og at den ikke er eldre enn 40 dager. |
| 0 | Bare inviterte kan lage konto | Piloten er lukket: andre enn dem du inviterer, skal ikke komme inn. | Automatisk | Lånbort spør innloggingstjenesten om ny registrering er slått av. |
| 0 | Pilotjournalen er privat | Testresultatene og deltakerlisten ligger bare i Lånborts egen database og kan ikke leses utenfra. | Automatisk | Lånbort sjekker i databasen at ingen av rollene nettleseren kan bruke, får lese eller endre pilotens tabeller. |
| 0 | Kontaktkanalene er satt opp | Deltakere og andre vet hvor de melder fra om sikkerhet og personvern. | Automatisk | Lånbort sjekker at kontaktadressen og navnet på den ansvarlige er satt, at security.txt på nettstedet ikke er utløpt, og at private sårbarhetsmeldinger er slått på i GitHub. |
| 0 | Testene for klargjøring er gjennomført | Testene i fase 0 er prøvd, og de viktige er bestått. | Pilotjournalen | Følger testresultatene i pilotjournalen: viktige tester må være bestått, og de andre må ha et resultat. |
| 0 | Ingen alvorlige feil står åpne | Ingen feil som stopper piloten eller en sentral del av den (P0 eller P1), står uløst. | Pilotjournalen | Følger feillisten i pilotjournalen. |
| 0 | Sikkerhetskopien tas hver natt | Den egne sikkerhetskopien lages hver natt i det private backup-repoet, som Lånbort ikke kan se selv. | Manuell bekreftelse | Åpne det private backup-repoet på GitHub og velg «Actions». Se at de siste nattlige kjøringene av «Backup» har grønt merke. Skriv når den siste kjørte. |
| 0 | Henvendelser om sikkerhet blir lest | Noen leser og svarer på det som kommer til kontaktadressen, under hele piloten. | Manuell bekreftelse | Send en e-post til kontaktadressen på siden «Personvern og sikkerhet» under Konto, og se at den kommer fram der du leser e-post. Skriv når du sendte den, og at den kom fram. |
| 0 | Tilbakemeldinger fra deltakerne blir fulgt opp | Deltakerne vet hvor de sier fra, og noen følger med der under hele piloten. | Manuell bekreftelse | Bestem hvor deltakerne skal gi tilbakemeldinger, og send en prøvemelding dit. Skriv hvilken kanal det er, og hvem som følger den opp. |
| 0 | Deltakerne er informert og har sagt ja | Hver deltaker vet hva piloten går ut på, hva som lagres og hvor lenge, og at det er frivillig. | Manuell bekreftelse | Gi hver deltaker informasjonen før de inviteres, og få et tydelig ja. Skriv hvordan informasjonen ble gitt, og hvor samtykkene ligger. |
<!-- generert:pilot-krav slutt -->

De automatiske testene er en nødvendig teknisk grunnmur, men **erstatter ikke menneskelig gjennomføring**. Minst to uavhengige brukerpar bør prøve de sentrale normalforløpene. Registrer både vellykket fullføring og om det krevdes hjelp.

Test på faktiske mobil- og PC-enheter, helst med mer enn én nettleser/operativsystemkombinasjon. Beskytt deltakere mot uønsket press om å låne bort ting.

### Testdesign som krever planlegging

Start minst ett avsluttet lån tidlig for å prøve **14 dagers dobbelblind anmeldelsesfrist**. Prøv **5 minutters QR-gyldighet**, **30 sekunders retur-angrefrist**, minst ett tidsforløp med utløpt avtale og **14 dagers invitasjonsgyldighet**. Lange overgangsfrister for miljøtyper og medlemskrav må enten startes tidlig eller testes med kontrollert tid i et isolert miljø. Noter tydelig om scenarioet var reelt eller tidsstyrt.

### Testroller og oppgavekort

Tilordne minst én ansvarlig tester per ID, og en annen tester der to roller er nødvendige. Ikke la ett brukerpar stå for alle lån. Skriv korte brukeroppdrag uten å avsløre ønsket klikksti, f.eks. «Lån en ting av en venn til helgen» heller enn «Trykk Finn → …». For utvidede scenarioer får partene en kontrollert instruksjon om at hendelsen er fiktiv.

## 4. Fremdrift og målepunkter

**Status per testcase:** Ikke startet, Bestått, Feilet, Blokkert, Må testes på nytt eller Ikke relevant. Endres et forløp etter en feilretting, går saken til *Må testes på nytt*. Ikke regn en grønn CI-test som manuelt Bestått. Endringer i testkatalogen skjer gjennom PR, og ID-er gjenbrukes aldri.

**Ukentlig privat statusnotat:**
- Dekning per område: bestått / feilet / blokkert / ikke startet.
- Nye og fortsatt åpne feil, skilt på alvorlighetsgrad.
- Antall inviterte, aktiverte og frivillig aktive brukere (aggregert).
- Antall forespørsler, godkjenninger og fullførte lån (aggregert).
- Hvilke funksjoner som oppleves uklare, og hvor brukerne trengte hjelp.
- Neste ukes manglende testscenarioer og hvem som følger opp (kun pseudonym i journal).

**Kvalitativ evaluering:** To korte samtaler med hver deltaker, etter førstegangsbruk og ved avslutning. Spør særlig om forståelse, personvern, varsel, lånets status, nytteverdi, om de ønsker å fortsette, og hva som hindret dem. Skill observert atferd fra uttalte ønsker.

### Alvorlighetsgrader

- **P0 (stans):** tilgangs- eller datalekkasje, tap av viktige data, feilaktig dobbelbooking, alvorlig kryptografisk svakhet.
- **P1:** sentral flyt utilgjengelig, ingen realistisk omvei. Stans berørt del inntil rettet.
- **P2:** funksjonen virker, men med feil, forvirring eller betydelig friksjon. Prioriter og test igjen.
- **P3:** kosmetikk/forbedringsønsker. Samle til etter pilot, med mindre det hindrer forståelighet.

Store funksjons- og designendringer utsettes som hovedregel til etter piloten. Alle produksjonsendringer må bestå påkrevd CI og relevante manuelle retester; det er særlig viktig at ingen endring kan publiseres med rød kvalitetssjekk.

## 5. Kriterier for å avslutte piloten

- Samtlige **B**-punkter er bestått, og alle **O**-punkter har et dokumentert reelt testresultat.
- Alle **U**-punkter er prøvd minst én gang eller markert som Ikke relevant/Blokkert med årsak og videre oppfølging.
- Normalforløpet fra forespørsel til endelig retur er gjennomført av flere uavhengige brukerpar.
- Ingen uakseptable P0/P1-feil står åpne.
- Minst én periode uten pålagte oppgaver er observert, og sluttintervjuene er dokumentert.
- Reelle lån, brukertilgang og testmiljøer er avsluttet eller videreført bevisst; ingen historikk slettes ukritisk.
- En teknisk sluttrapport og en brukerrapport er skrevet uten identifiserende deltakerdata.

**Beslutning:** (A) større pilot/neste fase, (B) rettelser og ny begrenset pilot, eller (C) revurder produktmodellen. Ikke forveksle teknisk stabilitet med dokumentert brukerbehov.

## 6. Foreløpig valg om pilotverktøy og reposynlighet

Behold `peohol/lanbort` offentlig inntil en egen gjennomgang eventuelt gir en annen begrunnelse. Offentlig kildekode er ikke en erstatning for sikkerhet, og privat kildekode er ikke et vern for deltakerjournaler. Kildekode som tidligere var offentlig, kan finnes andre steder. Endret repo-synlighet kan påvirke eksterne sårbarhetsrapporter og enkelte GitHub-sikkerhetsfunksjoner.

**Bygg en liten, separat pilotflate innenfor den eksisterende Lånbort-appen før hele panelet inviteres.** Den skal være tilgjengelig bare for pilotansvarlig, bruke eksisterende innlogging og sikkerhetsmønstre, gi ett-trykks statusoppdateringer og vise fremdrift fra de 98 faste testcase-ID-ene. Bruk Supabase til en append-only resultatjournal, uten skrivearbeid i GitHubs tekstredigerer. Se [pilot-ui.md](pilot-ui.md) for nødvendig funksjonalitet og sikkerhetskontroller. Ikke bygg en egen tjeneste eller generelt administratorrammeverk. Ingen slik løsning eller repo-synlighetsendring er implementert av dokumentasjonsplanen.

## Referanser

- [Manuell testmatrise](pilot-testmatrise.md)
- [Drift av den lukkede piloten](pilot-operations.md)
- [Kvalitetsporter](quality-gates.md)
- [Backup og gjenoppretting](backup-restore.md)
- [Sikkerhetsvurdering av pilotchat](chat-pilot-risikovurdering.md)
- [Skjerm- og flytinventar](../ux/08-skjerm-og-flytinventar.md)
