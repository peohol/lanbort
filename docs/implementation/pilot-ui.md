# Intern pilotoversikt – funksjons- og sikkerhetsspesifikasjon

> **Beslutningsgrunnlag:** Produkteier ønsker ikke å føre testresultater manuelt i GitHubs tekstredigerer eller i en chatsamtale. Opprett en **egen liten, rollebeskyttet pilotflate i den eksisterende Lånbort-appen**, ikke en ny tjeneste eller generell plattformforvalterfunksjon. Dette dokumentet beskriver ønsket implementering; funksjonen er **ikke bygget** gjennom dokumentasjons-PR-en.

## Formål og grenser

- Styringsdokumentet ligger i [pilot-testplan.md](pilot-testplan.md). Den kanoniske katalogen har [98 stabile test-ID-er](pilot-testmatrise.md).
- Testeren skal kunne registrere et testresultat fra mobil på få trykk uten GitHub-konto og uten kode- eller filredigering.
- **Fremdrift lagres som strukturerte private data i Supabase**, ikke ved å endre Markdown, offentlige GitHub-issues, chatmeldinger eller appens ordinære låneposter.
- Løsningen skal ikke kreve nye betalte tjenester. Gjenbruk Next.js, Supabase, gjeldende innlogging, UI-komponenter, logging og backup.
- En pilotflate er et internt arbeidsverktøy, ikke en funksjon i ordinær Lånbort, og må ikke åpne funksjoner som er deaktivert i pilot (plattformforvaltning, Vipps, betaling).

## Tilgang, URL og livssyklus

En egen intern rute, eksempelvis `/pilot`, uten plass i ordinær hovednavigasjon. Ikke stole på skjult URL: hver sidelesning og hver API-handling må avvise uvedkommende på serversiden, uavhengig av knapper. Benytt eksisterende `route.user`-grense og domeneautorisering for operasjoner, med databasekontroll som ekstra sperre.

- Egen, minste-privilegium **pilotansvarlig**-rettighet. Innledningsvis kun produkteierens konto, via eksplisitt konfigurert tilgang; ikke gjenbruk plattformforvalterrollen eller slå på `PLATFORM_STEWARDS_ENABLED`.
- Vanlige brukere ser ingen testresultater og kan ikke legge inn eller endre administrativ teststatus, heller ikke gjennom direkte API-kall.
- Funksjonen er av som standard og aktiveres bevisst under piloten. Avsluttet kampanje er som hovedregel skrivebeskyttet.
- Vurder om testledere senere kan ha avgrensede rettigheter. Ikke gi andre deltakere administrativ innsikt bare for å avgi tilbakemelding.

## Skjermbilder / visninger

### 1. Pilotoversikt

Vis tydelig kampanjestatus, pågående fase, `Bestått / Feilet / Blokkert / Ikke testet / Må testes igjen / Ikke relevant`, og fremdrift per funksjonsområde. Vis separate tellere for basis-, ordinære og utvidede scenarioer. Tell **ikke relevant** separat, ikke som bestått.

- Søk etter test-ID eller beskrivelse, filtrer på område, fase, prioritet, tildelt tester og status.
- Velg «Neste tester» (uprovde B/O først), «Feilet», «Må testes igjen», «Blokkert» eller «Alt».
- Tydelig indikator for alvorlige åpne feil og oppgaver som stopper neste pilotfase.
- Responsivt, mobilvennlig grensesnitt med tilgjengelighet i tråd med resten av Lånbort.

### 2. Ett testkort, få trykk

Hvert kort viser ID, hva som skal prøves, forventet resultat, relevante forutsetninger og siste resultat. Knappene er eksempelvis **Bestått**, **Feilet**, **Blokkert**, **Må testes igjen**, **Ikke relevant**; resultatet må også kunne registreres fra detaljvisningen på mobil.

Ved registrering: dato/klokkeslett (automatisk), appversjon/deploy, testrolle/testerpseudonym, enhetskategori/nettleser, om hjelp var nødvendig, og en valgfri kort merknad. **Feilet** skal be om en kort konkret feilbeskrivelse og alvorlighetsgrad; **Ikke relevant** eller **Blokkert** krever begrunnelse. Mulighet for lenke til en **privat** avviksrapport, ikke som standard offentlig issue.

En ny test av samme scenario oppretter en **ny kjøring**, ikke overskriving av tidligere observasjon. Status på forsiden er siste gyldige kjøring og retest-regler, med mulighet til å vise historikken. Etter kodeendring kan relevant test manuelt markeres «Må testes igjen».

### 3. Gjennomføring per fase

Vis faste milepæler fra [testplanen](pilot-testplan.md) og hvilke B/O/U-tester som må være gjennomført for å starte neste fase. Ikke tillat at «grønn CI» automatisk markeres som «manuelt bestått». Lag en kort, sanert/aggregert ukesstatus uten deltakerdata.

### 4. Avslutning og eksport

Én handling for å eksportere private rå testresultater som CSV/JSON (kun autorisert pilotansvarlig) og én rapport for aggregerte resultater uten personidentifikatorer. Ikke send filer automatisk til GitHub, ekstern analyseleverandør eller offentlig lagring. Anonymisert sluttrapport kan tas inn i repoet etter gjennomgang.

## Datamodell og sporbarhet

Lag et lite, separat pilotdomene med databasemigrasjon og tester. Et mulig minsteoppsett:

1. **Pilotkampanje:** stabil ID, navn, datoer, fase, status, kildeversjon av testkatalogen.
2. **Testkatalog:** faste ID-er med prioritet, område, handling, forventet resultat og revisjon. Bevar testdefinisjonen som var gjeldende da kjøringen ble gjort, eller referer til uforanderlig katalogrevisjon.
3. **Testkjøring:** unik ID, kampanje, testcase-ID/revisjon, tidspunkt, app/deploy-versjon, status, testerpseudonym, device/browser, hjelp nødvendig, kort merknad og lenke til privat avvik.
4. **Revisjonshendelser:** append-only hvem registrerte/endres, hva som ble endret, og når. Ingen stille omskriving.
5. **Avviksreferanser:** alvorlighetsgrad, status, testcase-ID-er, sanert problemtekst, eventuelt intern privat lenke.

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
6. Vurder senere frivillig deltakerflate for å gi tilbakemelding, men ikke la oppgaveinstrukser farge første UX-observasjon.

Dette er **ikke** en bestilling på et stort analyseverktøy eller egen tjeneste. Lever helst en enkel, pålitelig pilotflate som er lett å deaktivere etter evalueringen.
