# ADR-0007 — Supabase for PostgreSQL, autentisering og fillagring

**Status:** Vedtatt  
**Forankring:** ADR-0001, ADR-0002, PS-NFR-001–PS-NFR-005, PS-NFR-007–PS-NFR-009, PS-NFR-013

## Beslutning

**Supabase** brukes som første driftsplattform for:

- administrert PostgreSQL
- Supabase Auth
- Supabase Storage

### Database

SQL-migrasjoner i `supabase/migrations/` er den autoritative skjemahistorikken. Supabase CLI brukes til lokal stack, reset/replay, migrasjoner og database-tester.

Kjernedata legges i ikke-eksponerte applikasjonsskjemaer der det er praktisk. Browseren skal ikke ha direkte CRUD-adgang til Lånborts domenetabeller. Autoritative domeneoperasjoner går gjennom backend-policyen i ADR-0002.

Serverkode bruker **Kysely + node-postgres** for type-sikre SQL-spørringer og eksplisitte transaksjoner. Databasetyper genereres fra den migrerte lokale databasen og kontrolleres i CI slik at applikasjonstyper ikke driver fra faktisk skjema.

Produksjons-/previewtrafikk fra Vercel bruker Supabase sin transaction-pooler. Migrations-/administrasjonskommandoer bruker direkte databaseforbindelse. Serverless connection pool holdes bevisst liten.

### Autentisering

Supabase Auth brukes som første autentiseringsplattform for konto, e-postverifisering og sesjoner, og skal kunne støtte sterkere autentisering for privilegerte roller.

- Websesjoner bruker cookie-basert PKCE-flyt via Supabase sin SSR-integrasjon.
- Auth-integrasjonen kapsles bak et internt adapter fordi SSR-pakken fortsatt kan ha API-endringer og fordi domenet ikke skal bindes unødvendig til én identitetsleverandør.
- Backend normaliserer autentisert identitet til en intern aktørmodell før domenepolicy vurderes.
- Plattformforvaltere skal kunne pålegges et sterkere autentiseringsnivå enn vanlige brukere, men denne ADR-en velger ikke TOTP, passkeys/WebAuthn, Vipps eller noen annen konkret mekanisme. Valget av mekanisme avklares i OD-0010. Til en mekanisme er godkjent og implementert, godtar backend ingen sesjon som sterkere, slik at privilegerte plattformforvalterhandlinger avvises (fail closed).
- Vanlige brukere skal ikke pålegges MFA bare fordi infrastrukturen støtter det.
- Framtidig federert eller ekstern innlogging, herunder mulig Vipps Login for norske brukere, kan vurderes uten at det endrer dagens pilotbeslutning om verifisert e-post. Se OD-0011.
- Brukerredigerbar metadata skal aldri brukes som autorisasjonsgrunnlag.

### Row-level security

RLS brukes som **forsvar i dybden**, ikke som erstatning for backend-policyen. Alle tabeller som eventuelt eksponeres gjennom Supabase Data API skal ha eksplisitt RLS og minste nødvendige grants.

### Storage

Buckets er private som standard. Tilgang gis via servervalidert nedlasting/opplasting eller kortlivede signerte URL-er.

Ordinære objektbilder, administrative saksvedlegg og E2EE-chatvedlegg skal behandles som separate tilgangsdomener. E2EE-vedlegg lagres kun som ciphertext.

### Miljøer

Baseline er:

1. lokal Supabase-stack for utvikling
2. isolert lokal/CI-testdatabase som bygges fra alle migrasjoner
3. separat hostet stagingmiljø
4. separat produksjonsmiljø før reell pilot

Supabase Preview Branching kan tas i bruk senere, men er ikke nødvendig for grunnlaget og skal ikke være en forutsetning for CI.

## Begrunnelse

Lånbort trenger full PostgreSQL-semantikk, sterke transaksjoner, avanserte constraints og en reproduserbar lokal database. Supabase gir dette uten å skjule PostgreSQL, samtidig som Auth og privat fillagring kan samles på samme plattform.

SQL-first migrasjoner beholder PostgreSQL som reell sannhetskilde og gjør spesielle constraints, funksjoner og sikkerhetsmekanismer eksplisitte. Kysely gir typesikker serverkode uten at ORM-en overtar eller begrenser databaseskjemaet.

## Konsekvenser

- Ingen klientkode får service-role/secret key.
- Kritiske domeneoperasjoner skal ikke implementeres som direkte klientkall mot Data API.
- Supabase- og auth-avhengigheter isoleres bak små adaptere slik at leverandørbytte forblir mulig.
- Database-reset fra tom tilstand skal være en obligatorisk CI-test.
