# Intern pilotoversikt – funksjons- og sikkerhetsspesifikasjon

> **Beslutningsgrunnlag:** Produkteier ønsker ikke å føre testresultater manuelt i GitHubs tekstredigerer eller i en chatsamtale. Opprett en **egen liten, rollebeskyttet pilotflate i den eksisterende Lånbort-appen**, ikke en ny tjeneste eller generell plattformforvalterfunksjon. Dette dokumentet er kravgrunnlaget for pilotflaten, som nå er bygget; se [Slik aktiveres og brukes pilotflaten](#slik-aktiveres-og-brukes-pilotflaten).

## Slik aktiveres og brukes pilotflaten

### Slå den på og av

- Pilotflaten finnes bare der `PILOT_ENABLED=true` (lokalt og i CI, fra `.env.example`). Uten bryteren svarer `/pilot` og `/api/pilot` som om de ikke fantes, og Konto viser ingen pilotlenke. Resten av appen merker ingen forskjell.
- I produksjon settes `PILOT_ENABLED=true` som miljøvariabel i Vercel-prosjektet, og fjernes igjen etter piloten. Dataene blir liggende, utilgjengelige, til de slettes etter reglene i [oppbevaring](retention.md).
- Også med bryteren på ser bare pilotansvarlig og pilotdeltakere noe. Alle andre får «finnes ikke», på sider, API og eksport.

### Hvem som har tilgang

- **Pilotansvarlig** gis bare av databasens eier, aldri fra appen, og står i databasen, ikke i repoet. I Supabase sin SQL-editor (eller via arbeidsflyten som kjører SQL mot produksjon):

  ```sql
  select app.grant_pilot_lead('<e-postadressen kontoen logger inn med>', 'Produkteier');
  ```

  Kontoen må finnes og ha bekreftet adressen. Tilgangen tas bort med `select app.revoke_pilot_lead('<e-postadresse>');`, som virker med en gang. Rollen er ikke plattformforvalterrollen og gir ingen tilgang til andres lån, samtaler eller profiler.
- **Pilotdeltakere** legges til av pilotansvarlig under «Deltakere», med e-postadressen de logger inn med. De får et pseudonym (P-01, P-02 …), som er alt som står i resultater og eksport. Navnet ser bare pilotansvarlig. Innloggingen er den vanlige; ingen får konto av å bli deltaker.

### Bruk

Pilotansvarlig finner «Pilot» under Konto → Annet. Deltakere finner «Mine pilotoppgaver» samme sted.

- **Kampanje:** start piloten («Lukket pilot»), se hvilke tester som stopper neste fase, gå videre til neste fase når kravene er oppfylt, og avslutt. En avsluttet kampanje kan leses, ikke endres. En ny kampanje kan startes etterpå.
- **Klargjøring (fase 0):** en sjekkliste med hvert obligatorisk krav før de første deltakerne inviteres, med status (Bestått, Feilet, Ikke kontrollert, Krever manuell bekreftelse), en kort forklaring og, bak «Vis detaljer», hvordan det kontrolleres, hva som ble funnet og lenker til kilden. «Kontroller nå» lar serveren kontrollere at alle fire CI-jobbene (`pilotRequiredChecks`, samme som jobbene i `ci.yml`) har kjørt og bestått for akkurat den versjonen som er publisert, at produksjonen kjører nyeste versjon av hovedgrenen, at hovedgrenen krever alle fire for alle, også administratorer, at databasen har alle migrasjonene appen ble bygget med, e-postvarslingen (minst én e-post faktisk sendt siste sju dager, ellers en testmelding til pilotansvarlig som e-posttjenesten må ta imot), gjenopprettingsøvelsen, at ny registrering er stengt, at pilotjournalen er utilgjengelig for nettleserens roller, og kontaktkanalene. Hver kjøring lagres. GitHub-kontrollene leser det offentlige repoet Vercel bygget fra; utenfor produksjon står de som «Ikke kontrollert». `GITHUB_READ_TOKEN` (et token uten rettigheter) er valgfritt og gir bare høyere grense for antall oppslag. Klassisk grenbeskyttelse som gjelder alle kan kontrolleres uten token; for et regelsett viser GitHub bare den som kan endre det hvem som kan gå utenom, så da står kravet som «Ikke kontrollert». Testene i fasen og åpne P0/P1-feil følger pilotjournalen. Det appen ikke kan se selv (nattlig backup i det private repoet, at henvendelser faktisk leses, tilbakemeldingskanal, samtykke), bekrefter pilotansvarlig med en kort beskrivelse av hvordan det ble kontrollert; navn og tidspunkt settes av serveren, og en bekreftelse kan trekkes tilbake. «Gå videre til fase 1» krever at alt er bestått, med automatiske kontroller fra den siste timen, og serveren håndhever det samme. Sjekklisten lagres slik den sto i det øyeblikket fasen ble avsluttet, og vises slik etterpå. Kravene står i katalogen (`pilotRequirements`) og i [testplanen](pilot-testplan.md#sjekkliste-før-en-fase-avsluttes).
- **Oversikt:** fremdrift etter status og fase, med detaljert fremdrift etter tema og oppgavetype ved behov, og varsel om alvorlige åpne feil (P0/P1). Testene grupperes som standard etter **fase → tema → oppgavetype** med overskrift, kort forklaring og sammenleggbare oppgavelister. Den aktive fasen er åpen som standard; framtidige faser kan åpnes ved behov. Bruk naturlige norske navn, ikke interne bokstavkoder, i overskrifter, filtre og oppgavekort. Filtrering og søk skal virke på tvers av gruppene, også ved søk på test-ID. Oppgaver som gjenstår sorteres fasevis, ikke som én sammenhengende prioritert liste. «Bestått» kan registreres med ett trykk fra listen.
- **Testkortet:** hva som skal prøves og forventes, et skjema for nytt resultat (status, feil med alvorlighet og privat lenke, merknad, tester, enhet, miljø, om det trengtes hjelp), oppgaver til deltakere og hele historikken. Tidspunkt og appversjon settes av serveren. Et nytt resultat legges til; ingenting skrives over, og et resultat registrert mot tidligere ordlyd viser den ordlyden.
- **Feil:** alle avvik med alvorlighet og status, endring av dem, og «Be om ny test», som markerer testene feilen gjelder som «Må testes på nytt».
- **Deltakere:** legg til og fjern deltakere, og se testene deres.
- **Mine pilotoppgaver (deltakere):** bare egne oppgaver med målet pilotansvarlig skrev, og knappene «Fikk det til», «Sto fast» og «Trenger hjelp» med en valgfri kommentar. Det er deltakerens egen rapport, ikke et offisielt resultat.
- **Rapport:** tellinger etter fase, område og prioritet, åpne feil etter alvorlighet, og nedlasting av resultatene som regneark (CSV) eller JSON, og av et sammendrag uten personopplysninger. Hver eksport føres i pilotens hendelseslogg. Filene lastes bare ned til den som ber om dem.

### Testkatalogen

De 98 testene står i én kilde, `packages/contracts/src/pilot-cases.ts` (med områder og faser i `pilot-catalogue.ts`), som appen bruker direkte. Hver test har en kort tittel, forventet resultat i klart språk, hva som må være klart før du starter, stegene i rekkefølge og hva som må ses for at testen er bestått. Tabellene og instruksene i [testmatrisen](pilot-testmatrise.md) og fasetabellen i [testplanen](pilot-testplan.md) lages fra den med `pnpm pilot:docs`, og CI stopper hvis de ikke stemmer. En test-ID gjenbrukes aldri. Endret ordlyd lagres som en ny revisjon første gang den brukes, så tidligere resultater beholder ordlyden de ble testet mot.

### Data og sikkerhet

- Pilotjournalen ligger i egne tabeller (`app.pilot_*`) som verken søk, varsler, profiler eller vanlige brukerdata leser. Resultater, endringshistorikk og deltakernes rapporter kan bare legges til, ikke endres eller slettes; bare et avviks alvorlighet og status kan endres.
- Alle pilotoperasjoner går gjennom serverens vanlige kommando- og spørregrense med egne policyer, og databasen sjekker i tillegg at den som skriver er aktiv pilotansvarlig, og at kampanjen er åpen. Se [servergrensen](server-boundary.md#pilotjournalen).
- Merknader, feiltitler og kommentarer logges aldri. Hendelsesloggen har bare handling, tidspunkt og ID-er.
- Oppbevaring: se [oppbevaring](retention.md).

## Formål og grenser

- Styringsdokumentet ligger i [pilot-testplan.md](pilot-testplan.md). Den kanoniske katalogen har [98 stabile test-ID-er](pilot-testmatrise.md).
- Testeren skal kunne registrere et testresultat fra mobil på få trykk uten GitHub-konto og uten kode- eller filredigering.
- **Fremdrift lagres som strukturerte private data i Supabase**, ikke ved å endre Markdown, offentlige GitHub-issues, chatmeldinger eller appens ordinære låneposter.
- Løsningen skal ikke kreve nye betalte tjenester. Gjenbruk Next.js, Supabase, gjeldende innlogging, UI-komponenter, logging og backup.
- Pilotflatene er adskilte arbeidsverktøy, ikke funksjoner i ordinær Lånbort, og må ikke åpne funksjoner som er deaktivert i pilot (plattformforvaltning, Vipps, betaling).

## Tilgang, URL og livssyklus

En egen intern rute, eksempelvis `/pilot`, uten plass i ordinær hovednavigasjon. Ikke stole på skjult URL: hver sidelesning og hver API-handling må avvise uvedkommende på serversiden, uavhengig av knapper. Benytt eksisterende `route.user`-grense og domeneautorisering for operasjoner, med databasekontroll som ekstra sperre.

- Egen, minste-privilegium **pilotansvarlig**-rettighet. Innledningsvis kun produkteierens konto, via eksplisitt konfigurert tilgang; ikke gjenbruk plattformforvalterrollen eller slå på `PLATFORM_STEWARDS_ENABLED`.
- Andre brukere enn eksplisitt inviterte pilotdeltakere får ingen pilotfunksjoner. Pilotdeltakere kan **bare se egne tildelte oppgaver og sende egne tilbakemeldinger**, ikke hele testjournalen. Pilotansvarlig avgjør hva som er offisielt Bestått/Feilet.
- Funksjonen er av som standard og aktiveres bevisst under piloten. Avsluttet kampanje er som hovedregel skrivebeskyttet.
- Testlederrettigheter og deltakertilgang er to forskjellige roller. Ingen deltakere får administrativ innsikt ved å rapportere fra et oppgavekort.

## Skjermbilder / visninger

### 1. Pilotoversikt

Vis tydelig kampanjestatus, pågående fase, `Bestått / Feilet / Blokkert / Ikke testet / Må testes igjen / Ikke relevant`, og fremdrift per funksjonsområde. Vis separate tellere for basis-, ordinære og utvidede scenarioer. Tell **ikke relevant** separat, ikke som bestått.

- Søk etter test-ID eller beskrivelse, filtrer på tema, fase, oppgavetype, tildelt deltaker og status. Vis fasene samlet med korte beskrivelser, og gruppér oppgavene under norske temaoverskrifter.
- Velg «Neste tester» (uprovde B/O først), «Feilet», «Må testes igjen», «Blokkert» eller «Alt».
- Tydelig indikator for alvorlige åpne feil og oppgaver som stopper neste pilotfase.
- Responsivt, mobilvennlig grensesnitt med tilgjengelighet i tråd med resten av Lånbort.

### 2. Ett testkort, få trykk

Hvert kort viser hva som skal prøves, forventet resultat, relevante forutsetninger og siste resultat. Test-ID og interne kodeverdier brukes til sporbarhet i systemet, ikke som synlig oppgavetittel. Knappene er eksempelvis **Bestått**, **Feilet**, **Blokkert**, **Må testes igjen**, **Ikke relevant**; resultatet må også kunne registreres fra detaljvisningen på mobil.

Ved registrering: dato/klokkeslett (automatisk), appversjon/deploy, testrolle/testerpseudonym, enhetskategori/nettleser, om hjelp var nødvendig, og en valgfri kort merknad. **Feilet** skal be om en kort konkret feilbeskrivelse og alvorlighetsgrad; **Ikke relevant** eller **Blokkert** krever begrunnelse. Mulighet for lenke til en **privat** avviksrapport, ikke som standard offentlig issue.

En ny test av samme scenario oppretter en **ny kjøring**, ikke overskriving av tidligere observasjon. Status på forsiden er siste gyldige kjøring og retest-regler, med mulighet til å vise historikken. Etter kodeendring kan relevant test manuelt markeres «Må testes igjen».

### 3. Deltakerens «Mine pilotoppgaver»

Deltakere som uttrykkelig er tildelt tester, kan åpne en enkel, adskilt side med **egne** oppgaver, uten GitHub-konto. Hvert oppgavekort viser et kort **brukermål**, for eksempel «Finn en ting du vil låne», ikke en avslørende klikkoppskrift. Etter oppgaven kan deltakeren velge «Fikk det til», «Stoppet opp / fikk det ikke til» eller «Trenger hjelp», samt gi en frivillig kort kommentar. Dette registreres som **selvrapportert observasjon**, ikke automatisk «Bestått» i den offisielle matrisen.

I den tidlige, uveiledede brukertesten kan testlederen gi oppgavene muntlig og først vise rapporteringsflaten etter observasjonen, slik at grensesnittet ikke lærer deltakeren hvordan Lånbort skal brukes. Ingen deltakere får lese andres oppgaver, identitet, resultater eller avvik.

### 3. Gjennomføring per fase

Vis faste milepæler fra [testplanen](pilot-testplan.md) og hvilke krav som må være oppfylt før man går videre. Knappen skal hete **«Gå videre til fase N»**, bare vises for neste fase og være deaktivert til den aktuelle faseporten er oppfylt. Den samme regelen må håndheves på serveren, også ved direkte API-kall. Ikke tillat at «grønn CI» automatisk markeres som «manuelt bestått». Lag en kort, sanert/aggregert ukesstatus uten deltakerdata.

### 4. Avslutning og eksport

Én handling for å eksportere private rå testresultater som CSV/JSON (kun autorisert pilotansvarlig) og én rapport for aggregerte resultater uten personidentifikatorer. Ikke send filer automatisk til GitHub, ekstern analyseleverandør eller offentlig lagring. Anonymisert sluttrapport kan tas inn i repoet etter gjennomgang.

## Datamodell og sporbarhet

Lag et lite, separat pilotdomene med databasemigrasjon og tester. Et mulig minsteoppsett:

1. **Pilotkampanje:** stabil ID, navn, datoer, fase, status, kildeversjon av testkatalogen.
2. **Testkatalog:** faste ID-er med prioritet, område, handling, forventet resultat og revisjon. Bevar testdefinisjonen som var gjeldende da kjøringen ble gjort, eller referer til uforanderlig katalogrevisjon.
3. **Testkjøring:** unik ID, kampanje, testcase-ID/revisjon, tidspunkt, app/deploy-versjon, status, testerpseudonym, device/browser, hjelp nødvendig, kort merknad og lenke til privat avvik.
4. **Testoppgave og deltakertilbakemelding:** valgfri tildeling til pilotdeltaker, kort oppgavemål og selvrapportert utfall som skilles tydelig fra offisiell teststatus. Ingen bredere adgang til appdata følger med tildelingen.
5. **Revisjonshendelser:** append-only hvem registrerte/endres, hva som ble endret, og når. Ingen stille omskriving.
6. **Avviksreferanser:** alvorlighetsgrad, status, testcase-ID-er, sanert problemtekst, eventuelt intern privat lenke.

Hold en **énkildemodell for testdefinisjonene**: ved implementering flyttes de 98 ID-ene til en maskinlesbar katalog i repoet som også genererer/validerer Markdown-matrisen i CI, eller brukes en tilsvarende CI-verifisert byggeprosess. Ikke vedlikehold separate definisjoner for appen og dokumentet manuelt. Versjonér katalogen slik at endret ordlyd ikke omskriver tidligere testresultater. Ikke gjenbruk slettede ID-er.

Resultatjournalen må ikke gi den interne testrollen ekstra adgang til vanlige brukeres private lån, E2EE-meldinger eller personopplysninger. Et testcase kan knyttes til et **pseudonym** eller et frivillig referansenummer, ikke til en skjult ekstra-lesetilgang til produksjonsobjekter.

## Personvern og sikkerhet

- Lagre så lite persondata som mulig. Pseudonymer er fortsatt personopplysninger når de kan knyttes til personer; håndter koblingsnøkkelen separat ved behov.
- Ikke lagre fødselsdato, reelle navn/e-postadresser, kryptonøkler, privat chat, innhold i lånemeldinger, personlige skjermbilder eller rapporter om sårbarheter i pilotjournalen.
- Tilgangskontroll håndheves i API og database (RLS/DB-privilegier der passende); alle list-, lese-, skriv-, eksport- og historikkhandlinger testes negativt for ordinære kontoer og anonyme.
- Følg eksisterende CSRF-, sikkerhetsheader-, loggings- og rate-limit-mønstre; bruk `no-store` og ikke logg merknadsfelt eller rå resultater.
- Gjeldende backup gjelder også pilotdata; dokumentér særskilt oppbevaring/sletting av pilotjournal etter formål og sluttføring. Historisk rapport kan beholdes aggregert/anonymisert etter at persondata er slettet.
- Avvik som gjelder sikkerhet, kryptering eller identitetsbrudd håndteres gjennom eksisterende **privat** sikkerhetsprosess, ikke et offentlig GitHub-issue.
- Ingen frontend-«hemmelig kode» eller lenke er tilgangssperre. Ingen offentlig API-token, adminrolle eller service role i nettleseren.

## Test for funksjonen selv

- Uvedkommende konto får ingen pilotflate via direkte URL, API eller eksport.
- Pilotdeltaker ser bare egne tildelte oppgaver og kan ikke endre administrativ teststatus eller lese andres tilbakemeldinger.
- Ingen pilotflate tilbys dersom tilgangsflagget er av.
- Autorisert pilotansvarlig kan registrere samme case flere ganger og se korrekt historikk; samtidig registrering gir ingen tap.
- Ugyldige statusoverganger, lange merknader og forsøk på å legge inn andres testresultater avvises eller håndteres med trygge begrensninger.
- Pilotresultater er ikke synlige i vanlige søk, varsler, profiler eller offentlige feillogger.
- Nye testversjoner påvirker ikke historisk katalogrevisjon.
- Eksport er begrenset, sporbar og uten innhold utover det piloten faktisk registrerer.
- Mobilvisningen er enkel å bruke i praksis. Prioriter **få trykk**, oversikt og stabil lagring fremfor grafikk og generell rapportplattform.

## Innføringsrekkefølge

1. Avgjør minimalt datasett, tilgang, backup og retention før migrasjon.
2. Gjør testkatalogen maskinlesbar med dokument-/CI-synkronisering.
3. Bygg rollebeskyttet `/pilot`, API og Supabase-modell med les/skriv-historikk og enkel oversikt.
4. Sikkerhets-/autorisasjonstester og mobiltest; ingen kode publiseres med rød CI.
5. Aktiver kun for produkteier, prøv tre testcase-endringer og eksport; deretter start pilot.
6. Prøv også en minimal deltakerflate med egne oppgaver og selvrapportering, uten å la den farge første uveiledede UX-observasjon.

Dette er **ikke** en bestilling på et stort analyseverktøy eller egen tjeneste. Lever helst en enkel, pålitelig pilotflate som er lett å deaktivere etter evalueringen.
