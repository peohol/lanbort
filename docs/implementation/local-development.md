# Lokal utvikling, database og CI

> **Status:** Gjeldende for implementeringsgrunnlaget fra Fase 0. Teknologivalgene er beskrevet i [ADR-0006](../architecture/decisions/ADR-0006-applikasjonsstack-og-runtime.md)–[ADR-0008](../architecture/decisions/ADR-0008-integrasjoner-og-drift.md); dette dokumentet beskriver bare hvordan grunnlaget brukes.

## Forutsetninger

- Node.js 24.x (låst i `.node-version` og `package.json`; `@types/node` følger samme hovedversjon)
- pnpm 12.8.1 (låst i `packageManager`)
- Docker, som Supabase CLI bruker for den lokale databasen

## Første oppsett

```sh
pnpm install --frozen-lockfile
pnpm db:start
pnpm env:local
pnpm db:reset
pnpm dev
```

`pnpm db:start` starter lokal database, Supabase Auth, Supabase Storage (private objektbilder) og Mailpit (lokal e-postboks). `pnpm env:local` skriver `.env` fra `.env.example` med verdiene den kjørende lokale stacken har generert, slik at ingen nøkler ligger i repoet. `.env` er ignorert av git, og både Next.js-appen og verktøyene leser den.

Innlogging bruker engangskode på e-post. Lokalt havner e-postene i Mailpit på <http://127.0.0.1:54324>. Malen ligger i `supabase/templates/`, og lokale Auth-innstillinger står under `[auth]` i `supabase/config.toml`. Hostede Supabase-prosjekter må få samme e-postmal og innstillinger når de etableres.

## Repo-struktur

| Mappe | Ansvar |
| --- | --- |
| `apps/web` | Next.js-app med UI og Route Handlers som HTTP/API-grense |
| `apps/ops` | Revisjonsloggede driftskommandoer: `pnpm ops:platform-role` og `pnpm ops:restore` |
| `packages/contracts` | Delte API-kontrakter (Zod). Inneholder aldri serverens autorisasjonslogikk |
| `packages/database` | Kysely/Postgres-adapter og genererte databasetyper. Kun for serverkode |
| `packages/domain` | Serverens domenekjerne: aktørmodell, policy-/autorisasjons-API, hendelser, transactional outbox, idempotente kommandoer, konto og plattformroller. Kun for serverkode |
| `packages/auth` | Eneste adapter mot Supabase Auth. Gir leverandørnøytral, verifisert identitet. Kun for serverkode |
| `packages/storage` | Eneste adapter mot Supabase Storage, og bildebehandling som fjerner metadata. Kun for serverkode |
| `packages/email` | Eneste adapter mot e-postleverandøren (Resend) for varslings-e-post. Kun for serverkode |
| `packages/places` | Eneste adapter mot stedsnavntjenesten (Kartverket) for søk nær et sted. Kun for serverkode |
| `packages/observability` | Strukturert logging med tillatelsesliste for felt |
| `packages/e2ee` | Ende-til-ende-kryptering for privat chat (MLS, ADR-0010). Kun for klientkode; serveren importerer den aldri |
| `supabase/` | Lokal Supabase-konfigurasjon, SQL-migrasjoner og pgTAP-tester |

## Database og migrasjoner

SQL-filene i `supabase/migrations/` er den autoritative skjemahistorikken. Den lokale databasen kjører PostgreSQL 17 (`[db] major_version` i `supabase/config.toml`), som skal være samme hovedversjon som de hostede Supabase-miljøene. Domenedata legges i det private `app`-skjemaet, som ikke er eksponert gjennom Supabase Data API, og som `anon`, `authenticated` og `service_role` ikke har tilgang til.

### Endre skjemaet

1. `pnpm db:migration:new <kort_navn>` oppretter en ny, tidsstemplet migrasjonsfil.
2. Skriv SQL-en i den nye filen.
3. `pnpm db:reset` bygger databasen på nytt fra tom tilstand med alle migrasjoner.
4. `pnpm db:test` kjører pgTAP-testene i `supabase/tests/`.
5. `pnpm db:types` regenererer `packages/database/src/generated/database.ts` fra den migrerte databasen. Filen skal ikke redigeres for hånd.
6. Commit migrasjonen, testene og de genererte typene sammen.

### Tilbakerulling og reset

- **Lokalt og i CI:** `pnpm db:reset` sletter den lokale databasen og bygger den på nytt fra migrasjonene. Dette er den normale måten å komme tilbake til en kjent tilstand på.
- **Migrasjoner endres ikke etter at de er pushet.** En feil rettes med en ny migrasjon som reverserer eller korrigerer endringen, slik at historikken alltid kan spilles av fra tom database.
- **Hostede miljøer:** De ligger på Supabase Free uten automatisk backup. Gjenoppbygging fra migrasjonene og gjenoppretting fra manuelle dumps følger [backup og gjenoppretting](backup-restore.md).

### Testdatabase

CI starter en isolert lokal Supabase-database, bygger den fra alle migrasjoner, kjører pgTAP-testene, kontrollerer at genererte typer stemmer med skjemaet og kjører alle `*.integration.test.ts` mot databasen (`pnpm test:integration`, som krever `DATABASE_URL`). Ingen delt eller hostet database brukes i testene.

## CI-kontroller

| Jobb | Hva den beviser |
| --- | --- |
| `quality` | Lint, typecheck, enhetstester, Prettier og produksjonsbygg (`pnpm check`) |
| `database` | Migrasjoner fra tom database, pgTAP, typekontroll mot skjema og integrasjonstester mot databasen (`pnpm test:integration`), blant dem backup/restore-øvelsen (WP-72). `stress.integration.test.ts` er samtidighets- og idempotensstresstesten for Port D (WP-71): parallelle godkjenninger, samtidige retries med samme nøkkel, dobbelttrykk med nye nøkler, avtaleendringer fra begge sider og gjenåpnet retur, med krav om at dataene blir som om kommandoene kom etter hverandre og at hvert avslag er et forventet domenesvar. `security/pilot-access.integration.test.ts` er autorisasjons- og personverntesten for Port D (WP-70): en fremmed og et tidligere medlem prøver hver kommando og spørring som tar en ressurs-ID mot alt som finnes i et skjult miljø, og får samme svar som for ID-er som ikke finnes; den viser også hva en låntaker som har gått ut, en senere og en tidligere medeier, en inhabil administrator, en som melder mulig dødsfall og en plattformforvalter uten godkjent sterkere innlogging (OD-0010) faktisk når |
| `e2e` | Playwright mot produksjonsbygget og lokal Supabase: røyktest (CSP, sikkerhetshoder, helse), registrering og innlogging med e-postkode, utlogging, ny innlogging og negative API-tester. `accessibility.spec.ts` går gjennom alle kjernesidene på mobil og desktop (WP-65): WCAG 2.2 A/AA med axe, ingen sidelengs scrolling, berøringsmål på minst 44 px, tastaturrekkefølge med synlig og udekket fokus, dobbel tekststørrelse, redusert bevegelse og tekstlig nettstatus. En ny side trenger bare en linje i `pages` der. `concurrency.spec.ts` (WP-71) sender samme kommando mange ganger samtidig over HTTP og dobbeltklikker på lånets neste steg i nettleseren: én virkning, samme svar og ingen serverfeil. `authorization.spec.ts` (WP-70) spør hver lese-rute i API-et om et skjult miljøs innhold og om ID-er som ikke finnes, og krever likt svar ned til status, hoder og innhold |
| `security` | `pnpm audit` for produksjonsavhengigheter, selvtest av Gitleaks og skanning av hele git-historikken |

CI har bare lesetilgang til repoet (`permissions: contents: read`), og avhengigheter installeres med `--frozen-lockfile`.

### Hemmelighetsskanning

`scripts/security/secret-scan.sh` kjører en pinnet Gitleaks-versjon. Selvtesten lager en kunstig GitHub-lignende testverdi ved kjøretid fra et fast frø, og krever at Gitleaks både rapporterer funn og klassifiserer det som `github-pat` før repoet skannes. Ingen tokenlignende verdi ligger i repoet. Gitleaks er bevisst låst til 8.30.0 inntil en kjent regresjon i 8.30.1 er verifisert løst.

Se [servergrense og autorisasjon](server-boundary.md) for hvordan nye API-er, policyer og kommandoer skal bygges.

## Kjente begrensninger i grunnlaget

- Den automatiske tilgjengelighetsgjennomgangen erstatter ikke manuell testing med skjermleser og forstørrelse på ekte enheter. Den hører til tilgjengelighetsgjennomgangen i Port E, sammen med det endelige WCAG-målet (PS-NFR-010).

- CSP tillater `'unsafe-inline'` for skript fordi Next.js trenger det uten nonce-basert CSP. Innstramming vurderes før Port C (privat chat). `next dev` får i tillegg `'unsafe-eval'`, aldri produksjonsbygget.
- Det finnes ennå ikke hostet staging- eller produksjonsmiljø på Vercel/Supabase. Når det etableres, trenger serveren `SUPABASE_SECRET_KEY` i plattformens hemmelighetslager for objektbilder; uten den svarer bilde-API-ene `unavailable`. E-postvarsler trenger `RESEND_API_KEY` (hemmelig), `NOTIFICATION_EMAIL_FROM` (avsender på et verifisert domene) og `APP_URL` (appens offentlige adresse); uten dem venter e-postkøen. Lokalt og i CI sendes ingen varslings-e-post.
