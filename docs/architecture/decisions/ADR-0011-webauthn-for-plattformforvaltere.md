# ADR-0011 — Privilegert autentisering: WebAuthn som andre faktor for plattformforvaltere

**Status:** Vedtatt (produkteier, 6. oktober 2026). Avgjør [OD-0010](../../open-decisions.md#od-0010--mekanisme-for-privilegert-autentisering).
**Forankring:** PS-USR-008, PS-USR-009, [autorisasjon og tilgang](../04-autorisasjon-og-tilgang.md), [ADR-0007](ADR-0007-supabase-data-auth-og-storage.md), WP-12
**Beslutningsgrunnlag:** [utredningen av privilegert autentisering](../utredninger/OD-0010-privilegert-autentisering.md)

## Beslutning

Plattformforvaltere bekrefter privilegerte handlinger med **passkey/WebAuthn** som ekstra sterk bekreftelse, i tillegg til vanlig innlogging med e-postkode.

- Gjelder **bare plattformforvaltere**. Vanlige brukere og miljøadministratorer får ingen ny faktor og ingen spørsmål om MFA.
- **Fysisk sikkerhetsnøkkel** (FIDO2) støttes der WebAuthn tillater det, men er **ikke obligatorisk**. En passkey på telefon, PC eller i en passordbehandler er tilstrekkelig.
- WebAuthn-faktoren er den eneste metoden som gir sterkere autentisering (`aal2`) for plattformforvaltere. TOTP/autentiseringsapp, SMS/telefon, gjenopprettingskoder og en ny e-postkode godtas ikke som sterkere, selv om auth-leverandøren skulle rapportere `aal2`.
- Privilegerte handlinger krever at WebAuthn-bekreftelsen er fersk, ikke bare at sesjonen en gang har vært bekreftet.

En e-postinnlogget sesjon alene skal aldri kunne registrere en ny autentikator, og det finnes ingen vei der en e-postkode, en supporthenvendelse eller en kode på papir alene gir forvaltertilgang.

## Registrering og recovery (OD-0023)

Avklart 10. oktober 2026 etter [utredningens modell](../utredninger/OD-0010-privilegert-autentisering.md#anbefalt-modell-i-detalj), uten vesentlige endringer.

- **Antall.** Forvalterrollen gir sterkere tilgang først når forvalteren har minst **to** aktive passkeys (høyst ti). Faller de under to, er privilegerte handlinger stengt til en ny er lagt til.
- **Første passkey** legges til med en **engangs registreringskode** fra driftskommandoen `pnpm ops:steward-passkeys enroll`. Koden gjelder én passkey, for én konto, i 60 minutter, og bare hashen lagres. Den overleveres utenom e-post (ansikt til ansikt eller i en telefonsamtale der operatøren kjenner forvalteren). En ny kode ugyldiggjør en tidligere.
- **Flere passkeys** legges bare til fra en sesjon som er bekreftet med en av forvalterens passkeys de siste 10 minuttene. En e-postinnlogget sesjon alene kan aldri legge til en passkey.
- **Bruk.** En bekreftelse er bundet til innloggingssesjonen og er fersk i 10 minutter. Privilegerte handlinger og lesing som forvalter krever en fersk bekreftelse. En gammel eller manglende bekreftelse gir `stronger_authentication_required`, ikke `reauthentication_required`, fordi det er passkeyen og ikke e-postkoden som må bekreftes på nytt.
- **Tap av én.** Forvalteren bekrefter med en annen passkey, fjerner den tapte og legger til en ny. Den siste kan ikke fjernes.
- **Tap av alle.** `pnpm ops:steward-passkeys reset` fjerner alle forvalterens passkeys på én gang, så åpne sesjoner mister sterkere tilgang straks, og lager en ny registreringskode. Rollen består, men virker ikke før to nye passkeys er lagt til. Utredningen åpnet også for at en annen forvalter gjør dette i appen; det venter, som utnevning i appen, på [OD-0021](../../open-decisions.md#od-0021--hvem-kan-utnevne-plattformforvaltere-i-appen).
- **Revisjon og varsel.** Hver ny passkey, fjerning, bekreftelse og utstedt kode blir en revisjonshendelse i samme transaksjon som endringen, uten nøkkelmateriale, kode eller begrunnelse. Forvalteren får et påkrevd varsel, også på e-post, når en passkey legges til eller fjernes, og når en kode utstedes eller passkeys tilbakestilles. Varselet gir ingen tilgang.
- **Ingen bakdører.** Ingen gjenopprettingskoder, ingen e-postvei og ingen supporthenvendelse gir forvaltertilgang. Den som kjører driftskommandoen, har allerede databasetilgang og står over forvaltermodellen; det er den ærlige tillitsgrensen, og den er ikke ny.

**Mekanisme.** Supabase Auths WebAuthn-faktor er fortsatt ikke dokumentert for hostede prosjekter (MFA-veiledningen beskriver bare TOTP og telefon, 10. oktober 2026). Derfor brukes utredningens reserveløsning: serveren verifiserer WebAuthn selv med `@simplewebauthn/server` bak adapteren i `packages/auth`, lagrer bare offentlige nøkler i appens egne tabeller, og binder bekreftelsen til Supabase-sesjonens `session_id`. Relying party og tillatte origins kommer fra serverens konfigurasjon (`APP_URL`, eventuelt `WEBAUTHN_RP_ID`), aldri fra forespørselen. Brukerverifisering kreves, attestasjon ikke. `aal2` og metoder fra auth-leverandøren godtas aldri.

## Aktivering i produksjon

Mekanismen er bygget og testet automatisk, men står av i produksjon til den er verifisert der: uten `PLATFORM_STEWARDS_ENABLED=true` finnes passkey-rutene ikke, og ingen sesjon regnes som sterkere. Til da gjelder fail-closed-modellen uendret. Den må være verifisert før privilegerte handlinger tas i reell bruk (Port D).

Produksjonsdomenet må være fast før forvaltere registrerer nøkler, fordi nøklene er bundet til domenet.

## Begrunnelse

WebAuthn er det eneste av de vurderte alternativene som tåler phishing også når angriperen videreformidler alt i sanntid, er noe annet enn e-postkoden som allerede er første faktor, og virker på Supabase Free uten løpende kostnad. Med få forvaltere er en bevisst recovery-modell enkel å håndheve. Vipps-basert re-autentisering vurderes eventuelt på nytt hvis Vipps Login innføres for vanlige brukere (OD-0011).

## Konsekvenser

- WebAuthn holdes bak adapteren i `packages/auth`. Første valg var Supabase Auths egen WebAuthn-faktor; siden den ikke er dokumentert for hostede prosjekter, brukes reserveløsningen: standard WebAuthn-verifisering på serveren, bundet til Supabase-sesjonen (se over og utredningen).
- Policyene endres ikke: `platformStewardAccess` krever fortsatt `aal2`, og bare en fersk passkey-bekreftelse gir det.
- Hver registrering og fjerning av en autentikator revisjonslogges før en sterkere sesjon godtas, uten nøkkelmateriale.
