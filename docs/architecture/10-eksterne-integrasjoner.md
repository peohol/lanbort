# Eksterne integrasjoner

> **Status:** Systemarkitektur v0.1. Første leverandør- og standardvalg er vedtatt i [ADR-0008](decisions/ADR-0008-integrasjoner-og-drift.md).

## E-post

Behov:
- verifisering av kontaktkanal
- konto-/sikkerhetsvarsler
- tidskritiske lånevarsler etter preferanse/policy

Integrasjonen skal gå gjennom ett internt adapter slik at leverandør kan byttes. E-postmaler skal ikke røpe skjult miljøkontekst unødvendig.

Første implementasjon bruker **Resend**. Supabase Auth bruker Resend som custom SMTP, mens applikasjonsgenererte meldinger går gjennom Lånborts e-postadapter.

## Kart og geokoding

Behov:
- søk etter åpne/lukkede miljøer geografisk
- representasjon av omtrentlig område
- eventuelt adresse→område/geokoding der brukeren eksplisitt trenger det

Kartleverandør skal ikke automatisk motta privat medlemsverifikasjonsadresse eller andre data utover søke-/kartformålet.

Første implementasjon bruker **MapLibre GL JS** som kartklient og **Kartverket** for norsk adressesøk/geokoding og kartgrunnlag. Integrasjonen skal fortsatt gå gjennom interne adaptere.

## Push

Web push og senere native push skal bruke intern varslingsmodell som kilde. Provider payload bør være minimal; appen henter autorisert detalj etter åpning.

Første webimplementasjon bruker standard **Web Push/VAPID** uten ekstra push-leverandør.

## Objekt-/filstorage

Lagring må støtte private objekter og tidsbegrenset autorisert tilgang. E2EE-vedlegg lagres som ciphertext og skal ikke bruke samme «server kan lese»-antakelse som ordinære objektbilder.

Første implementasjon bruker **Supabase Storage** med private buckets og servervalidert eller kortlivet signert tilgang.

## Bakgrunnsarbeid

Transactional outbox er sannhetskilde for asynkrone oppgaver. Første scheduler er **Vercel Cron**, som utløser idempotente worker-endepunkter. Et separat køprodukt innføres først hvis faktisk last eller leveringskrav tilsier det.

## Overvåking/feilrapportering

Baseline:
- strukturerte JSON-logger
- sentral redaksjon av secrets og persondata
- Vercel Runtime Logs/Observability
- ikke-sensitive helse-/readiness-signaler
- ingen privat chatklartekst, auth-secrets eller skjult sosial kontekst i logger

Ekstern feilrapportering/OpenTelemetry kan legges til senere dersom behovet oppstår og dataminimeringskravene kan oppfylles.

## Ikke i første fase

- BankID
- betaling
- forsikring/depositum
- sosial feed-/annonseringsintegrasjoner

## Leverandørvalg

Den konkrete baseline-stacken er dokumentert i ADR-0006–ADR-0008. Alle ytre integrasjoner skal fortsatt ligge bak interne grenser slik at domenekoden ikke blir unødvendig leverandørbundet.
