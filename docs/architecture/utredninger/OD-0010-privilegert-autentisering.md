# Utredning: mekanisme for privilegert autentisering (OD-0010)

> **Status:** Teknisk vurdering med anbefaling, 4. oktober 2026. Dette er **ikke** en beslutning. OD-0010 står åpen til produkteier har bestemt seg, og den eksisterende fail-closed-modellen gjelder uendret: ingen sesjon godtas som sterkere, og privilegerte plattformforvalterhandlinger avvises.

**Gjelder:** [OD-0010](../../open-decisions.md#od-0010--mekanisme-for-privilegert-autentisering), PS-USR-008, PS-USR-009, [autorisasjon og tilgang](../04-autorisasjon-og-tilgang.md), [ADR-0007](../decisions/ADR-0007-supabase-data-auth-og-storage.md), WP-12

## Anbefaling i korte trekk

**WebAuthn som andre faktor, bare for plattformforvaltere.** Forvalteren logger inn som alle andre (e-postkode) og bekrefter deretter privilegerte handlinger med en passkey eller en fysisk sikkerhetsnøkkel (fingeravtrykk, ansiktsgjenkjenning, PIN eller nøkkeltrykk).

- Vanlige brukere berøres ikke. De får ingen ny faktor, ingen spørsmål om MFA og ingen ny avhengighet.
- Hver forvalter skal ha **minst to** registrerte autentikatorer, helst én fysisk sikkerhetsnøkkel. Det er recovery-modellen. Det finnes ingen gjenopprettingskoder og ingen e-post- eller SMS-vei til forvaltertilgang.
- Mister en forvalter alle autentikatorene, gjenoppretter en revisjonslogget driftskommando tilgangen (samme mønster som `pnpm ops:platform-role`). Forvalterrollen er suspendert til nye nøkler er registrert.
- Første valg er Supabase Auths egen WebAuthn-faktor (`mfa/webauthn`) bak `packages/auth`. Hvis den ikke er stabil og dokumentert for hostede prosjekter når vi bygger, er reserveløsningen standard WebAuthn-verifisering på serveren med et etablert bibliotek, bundet til Supabase-sesjonen. Begge holdes bak samme adapter.
- Alt dette fungerer på Supabase Free. Den eneste mulige kostnaden er en fysisk sikkerhetsnøkkel per forvalter (engangskjøp, valgfritt men anbefalt).

Vipps-basert sterk re-autentisering anbefales **ikke** nå. Den bør vurderes på nytt bare hvis Vipps Login innføres for vanlige brukere (OD-0011). TOTP og SMS anbefales ikke.

## Hva mekanismen skal beskytte

Plattformforvaltere kan suspendere og avslutte kontoer, sperre objekter, fjerne anmeldelser og behandle plattformsaker. Den største risikoen er at noen tar over forvalterens innlogging, typisk ved å få tilgang til e-postkontoen eller lure forvalteren til å oppgi en kode på en falsk side (sanntids-phishing). Mekanismen må derfor:

1. være noe annet enn e-postkoden, siden e-post allerede er første faktor
2. tåle phishing, også når angriperen videreformidler alt i sanntid
3. ha en recovery som ikke åpner en enklere bakdør enn mekanismen selv
4. kunne kreves _fersk_ for den enkelte handlingen, ikke bare én gang per sesjon
5. passe inn i dagens arkitektur: nettleseren snakker aldri med Supabase og ser aldri et token, og domenet ser bare den nøytrale aktørmodellen
6. ikke binde Lånbort unødig til én leverandør, ikke kreve betalt Supabase-plan, og ikke påvirke vanlige brukere

## Alternativene

### 1. Passkeys/WebAuthn som andre faktor (anbefalt)

WebAuthn er W3C-standarden bak passkeys og fysiske sikkerhetsnøkler (FIDO2). Enheten lager et nøkkelpar per nettsted, og signaturen er bundet til nettstedets domene. En falsk side på et annet domene kan derfor ikke få en gyldig signatur, selv om forvalteren blir lurt.

| Kriterium            | Vurdering                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sikkerhet            | Best av alternativene. Phishing-resistent, ingen delt hemmelighet (serveren lagrer bare offentlig nøkkel), krever brukerverifisering på enheten.                                                                                                                                                                                                                                                                                                                                                                                       |
| Recovery             | Krever en bevisst modell: minst to autentikatorer per forvalter, og en revisjonslogget driftsvei når alle er tapt. Med få forvaltere er dette enkelt å håndheve.                                                                                                                                                                                                                                                                                                                                                                      |
| Nettleser og enhet   | Støttes av alle gjeldende hovednettlesere på PC og mobil (Chrome, Edge, Firefox, Safari). Passkeys kan synkroniseres via iCloud-nøkkelring, Google Passordbehandling eller passordbehandlere. Innebygde nettlesere i apper kan mangle støtte; forvaltere bruker en vanlig nettleser.                                                                                                                                                                                                                                                  |
| Supabase-integrasjon | supabase-js 2.117.2 (versjonen repoet bruker) har MFA-faktortypen `webauthn` med enroll/challenge/verify, og tokenet får `aal2` og metoden `mfa/webauthn` i `amr`. API-et er merket eksperimentelt, og Supabases MFA-veiledning for hostede prosjekter beskriver foreløpig bare TOTP og telefon. Passkey som _første_ faktor er i beta (mai 2026) og er ikke det vi trenger. Seremonien kan styres fra serveren: serveren henter utfordringen, nettleseren kjører `navigator.credentials.get()`, og serveren sender svaret til verifisering. |
| Leverandørbinding    | Lav. WebAuthn er en åpen standard. Bytter vi auth-leverandør, må forvalterne registrere nøklene på nytt, noe som er en liten jobb med få forvaltere.                                                                                                                                                                                                                                                                                                                                                                                   |
| Kostnad              | Ingen løpende kostnad. Bare telefon-MFA er et betalt Supabase-tillegg; WebAuthn-faktoren er ikke oppført som tillegg (må bekreftes ved implementering). Fysisk sikkerhetsnøkkel er et lite engangskjøp per forvalter.                                                                                                                                                                                                                                                                                                                 |
| UX                   | Svært god: ett trykk og fingeravtrykk eller ansikt. Ingen koder å taste.                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

**Risikoer og hvordan de møtes**

- _Eksperimentelt Supabase-API._ Adapteren i `packages/auth` isolerer det. Hvis API-et ikke er stabilt og tilgjengelig for hostede Free-prosjekter når vi bygger, brukes reserveløsningen under. Vi lager ingen egen kryptografi i noen av variantene.
- _Hvem bestemmer relying party og tillatte origins._ Klientbiblioteket lar kalleren oppgi `rpId` og `rpOrigins` ved verifisering. Lånbort setter disse fra serverens egen konfigurasjon, aldri fra forespørselen, og en negativ test må vise at et svar laget for et annet domene avvises.
- _Synkroniserte passkeys_ er bare så sterke som skykontoen de synkroniseres med. Derfor anbefales minst én fysisk sikkerhetsnøkkel blant forvalterens autentikatorer. Attestasjon (bevis for nøkkelmodell) kreves ikke; det gir lite for en håndfull forvaltere og mer kompleksitet.
- _Domenet._ Nøklene er bundet til domenet (RP ID). Produksjonsdomenet må være fast før forvaltere registrerer nøkler. Et senere domenebytte betyr ny registrering, ikke tap av data.

**Reserveløsning (samme mekanisme, annen plassering).** Hvis Supabase-faktoren ikke kan brukes, verifiserer serveren WebAuthn selv med et etablert, mye brukt bibliotek for WebAuthn-verifisering. Offentlige nøkler lagres i appens egne tabeller, og en vellykket verifisering registreres som et sterkere steg bundet til Supabase-sesjonens `session_id` med tidspunkt. `resolveUserActor` regner da sesjonen som `aal2` bare så lenge den bindingen finnes og er fersk. Domenet og policyene er de samme; bare adapteren er forskjellig.

### 2. Vipps-basert sterk re-autentisering

Vipps Login er OpenID Connect. Med `acr_values=urn:vipps:acr:app_auth` må brukeren alltid bekrefte i Vipps-appen, og ID-tokenet bekrefter dette i `acr`-feltet.

| Kriterium            | Vurdering                                                                                                                                                                                                                                                                               |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sikkerhet            | Sterk identitetsforankring (BankID-basert onboarding i Vipps). Men bekreftelse i en app etter en omdirigering er ikke bundet til Lånborts domene på samme måte som WebAuthn, så en avansert phishing-proxy kan i prinsippet videreformidle flyten.                                         |
| Recovery             | God: Vipps og BankID håndterer tapt telefon.                                                                                                                                                                                                                                           |
| Nettleser og enhet   | Krever Vipps-appen og norsk (eller dansk/finsk via MobilePay) bruker.                                                                                                                                                                                                                  |
| Supabase-integrasjon | Svak. Supabase kan legge til Vipps som egendefinert OIDC-leverandør, men det gir en _innlogging_ (første faktor, `aal1`), ikke `aal2` på en eksisterende sesjon. Vi måtte bygge vår egen OIDC-klient og vår egen markering av sterkere sesjon, altså det meste av reserveløsningen over. |
| Leverandørbinding    | Høy: avtale med Vipps MobilePay og organisasjonsnummer.                                                                                                                                                                                                                                |
| Kostnad              | Step-up krever ifølge Vipps' utviklerdokumentasjon den avanserte prisgruppen. Prisen er ikke verifisert her.                                                                                                                                                                           |
| UX                   | God for norske brukere som har Vipps.                                                                                                                                                                                                                                                  |

**Vurdering:** Mer integrasjon, avtale og kostnad enn WebAuthn, og svakere mot phishing. Ikke riktig for en håndfull forvaltere nå. Kan bli aktuell som _tillegg_ hvis OD-0011 senere innfører Vipps Login for alle.

### 3. Andre alternativer

| Alternativ                                                  | Hvorfor ikke                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TOTP/autentiseringsapp                                      | Stabilt i Supabase og gratis, men koden kan fanges av en falsk side og brukes i sanntid, og hemmeligheten lagres hos leverandøren. Svakere enn WebAuthn uten å være enklere for forvalteren. Skal uansett ikke bli et generelt produktkrav.                                                                     |
| SMS/telefon-MFA                                             | Sårbar for SIM-bytte, og i Supabase et betalt tillegg som krever Pro-plan. Uforenlig med beslutningen om å bli på Supabase Free.                                                                                                                                                                                |
| Ny e-postkode som «andre faktor»                            | Samme kanal som første faktor. Gir ingen beskyttelse når e-postkontoen er kompromittert. Brukes allerede til ny innlogging (`requireRecentAuthentication`), men kan aldri gi `aal2`.                                                                                                                             |
| Gjenopprettingskoder (Supabase `mfa/recovery_code`)         | Delte hemmeligheter som kan phishes og lagres dårlig. Erstattes av kravet om to autentikatorer og driftsveien. Skal ikke godtas som sterk metode.                                                                                                                                                                |
| Eget administrasjonsgrensesnitt bak ekstern innloggingsmur | For eksempel en tilgangsproxy eller en bedrifts-SSO med sikkerhetsnøkler. Flytter samme mekanisme (WebAuthn) ut i en ekstra tjeneste med egen leverandør, egen drift og mulig kostnad, uten å gjøre den sterkere. Kan vurderes hvis plattformforvaltningen en dag blir en egen organisasjon med egne verktøy. |

## Anbefalt modell i detalj

Dette beskriver hva som bygges _hvis_ anbefalingen godkjennes. Ingenting av det er aktivert nå.

**Registrering**

- En forvalter kan bare registrere en autentikator i et kort registreringsvindu som åpnes av driftskommandoen (som allerede tildeler rollen), eller fra en sesjon som allerede er `aal2` via WebAuthn. En e-postinnlogget sesjon alene kan aldri legge til en ny nøkkel; ellers ville e-postovertakelse holde.
- Hver registrering, fjerning og hvert åpnet vindu blir en revisjonshendelse _før_ nøkkelen godtas (kravet i [serverkontrakten](../../implementation/server-boundary.md)). Hendelsen inneholder aldri nøkkelmateriale, bare at det skjedde, hvem, og autentikatorens navn.
- Forvalterrollen virker ikke før minst to autentikatorer er registrert.

**Bruk**

- `strongAuthenticationMethods` i `account/identity.ts` får én metode: WebAuthn-faktoren (`mfa/webauthn`, eller reserveløsningens tilsvarende markering). TOTP, telefon og gjenopprettingskoder godtas fortsatt ikke, selv om leverandøren skulle rapportere `aal2`.
- Privilegerte handlinger krever i tillegg at WebAuthn-steget er _ferskt_ (samme 10-minuttersgrense som `requireRecentAuthentication`, men målt på WebAuthn-steget og ikke på e-postkoden). Det hindrer at en glemt, åpen sesjon fra i går kan brukes.
- Serveren godtar bare WebAuthn-faktorer den selv har revisjonslogget. Finnes en verifisert faktor hos leverandøren som ikke er i Lånborts register, avvises sterkere tilgang.
- Vanlige brukere og miljøadministratorer får aldri spørsmål om WebAuthn. Siden `aal2` bare betyr noe i `platformStewardAccess`, endres ingenting for dem.

**Tap og recovery**

- Tap av én autentikator: forvalteren bruker den andre til å fjerne den tapte og registrere en ny. Privilegerte handlinger er stengt til forvalteren igjen har to.
- Tap av alle: en annen forvalter eller driftskommandoen trekker tilbake alle forvalterens faktorer, setter rollen på pause og åpner et nytt registreringsvindu. Det varsles til forvalterens e-post og revisjonslogges. Den som kjører driftskommandoen har allerede tilgang til databasen og står uansett over forvaltermodellen; det er den ærlige tillitsgrensen, og den er ikke ny.
- Det finnes ingen vei der en e-postkode, en supporthenvendelse eller en kode på papir alene gir forvaltertilgang.

**Tester som trengs ved implementering**

- Sesjon med `aal2` fra TOTP, telefon eller gjenopprettingskode gir fortsatt `stronger_authentication_required`.
- WebAuthn-steg eldre enn grensen gir `reauthentication_required`.
- Faktor som ikke er i Lånborts register, gir avslag.
- Svar signert for et annet domene (RP ID/origin) avvises.
- E-postinnlogget sesjon kan ikke åpne registrering eller legge til nøkkel.
- Forvalter med bare én autentikator har ikke tilgang.
- Tilbakekalt rolle virker ikke, uansett sesjonsstyrke.
- Vanlige brukeres innlogging og handlinger er uendret, og ingen revisjonshendelse eller logg inneholder nøkkelmateriale.

## Hva som ikke endres nå

- `strongAuthenticationMethods` er fortsatt tom, `[auth.mfa.totp]` er fortsatt avslått, og ingen WebAuthn-oppsett er slått på lokalt eller hostet.
- Plattforminngrep har fortsatt ingen HTTP-rute og avvises for alle reelle sesjoner.
- OD-0010 hindrer ikke vanlig produktutvikling eller funksjoner som ikke trenger plattformforvaltertilgang.

## Kilder

- Supabase: [Multi-Factor Authentication](https://supabase.com/docs/guides/auth/auth-mfa), [Passkey authentication](https://supabase.com/docs/guides/auth/passkeys), [JWT Claims Reference](https://supabase.com/docs/guides/auth/jwt-fields), [Advanced MFA Phone-prising](https://supabase.com/docs/guides/platform/manage-your-usage/advanced-mfa-phone), typedefinisjonene i `@supabase/auth-js` 2.117.2
- Vipps MobilePay: [Login API – step-up authentication](https://developer.vippsmobilepay.com/docs/APIs/login-api/api-guide/step-up-authentication/)
- W3C: [Web Authentication Level 3](https://www.w3.org/TR/webauthn-3/)
