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

## Hva som ikke er besluttet her

Hvordan forvaltere registrerer autentikatorer, hvor mange de må ha før rollen virker, og hvordan tilgang gjenopprettes når de går tapt, er ikke besluttet. Det er åpent som [OD-0023](../../open-decisions.md#od-0023--registrering-og-recovery-for-plattformforvalteres-webauthn). Utredningens modell (minst to autentikatorer, engangs registreringskode og en revisjonslogget driftsvei ved tap av alle) er teknisk anbefaling og utgangspunkt, ikke bindende krav.

## Hva som ikke endres før mekanismen er bygget

Beslutningen er tatt, men mekanismen er ikke implementert. Til den er bygget og testet, gjelder dagens fail-closed-modell uendret: ingen sesjon godtas som sterkere, og privilegerte plattformforvalterhandlinger avvises. Implementeringen hører til WP-12 og må være ferdig før slike handlinger tas i reell bruk (Port D).

Produksjonsdomenet må være fast før forvaltere registrerer nøkler, fordi nøklene er bundet til domenet.

## Begrunnelse

WebAuthn er det eneste av de vurderte alternativene som tåler phishing også når angriperen videreformidler alt i sanntid, er noe annet enn e-postkoden som allerede er første faktor, og virker på Supabase Free uten løpende kostnad. Med få forvaltere er en bevisst recovery-modell enkel å håndheve. Vipps-basert re-autentisering vurderes eventuelt på nytt hvis Vipps Login innføres for vanlige brukere (OD-0011).

## Konsekvenser

- WebAuthn holdes bak adapteren i `packages/auth`. Første valg er Supabase Auths egen WebAuthn-faktor; reserveløsningen er standard WebAuthn-verifisering på serveren, bundet til Supabase-sesjonen (se utredningen).
- Domenet og policyene endres ikke: `platformStewardAccess` krever fortsatt `aal2`, og bare den valgte mekanismen legges til som sterkere metode.
- Hver registrering og fjerning av en autentikator revisjonslogges før en sterkere sesjon godtas, uten nøkkelmateriale.
