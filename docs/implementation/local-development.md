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

`pnpm db:start` starter lokal database, Supabase Auth og Mailpit (lokal e-postboks). `pnpm env:local` skriver `.env` fra `.env.example` med verdiene den kjørende lokale stacken har generert, slik at ingen nøkler ligger i repoet. `.env` er ignorert av git, og både Next.js-appen og verktøyene leser den.

Innlogging bruker engangskode på e-post. Lokalt havner e-postene i Mailpit på <http://127.0.0.1:54324>. Malen ligger i `supabase/templates/`, og lokale Auth-innstillinger står under `[auth]` i `supabase/config.toml`. Hostede Supabase-prosjekter må få samme e-postmal og innstillinger når de etableres.

## Repo-struktur

| Mappe | Ansvar |
| --- | --- |
| `apps/web` | Next.js-app med UI og Route Handlers som HTTP/API-grense |
| `apps/ops` | Revisjonsloggede driftskommandoer, foreløpig `pnpm ops:platform-role` |
| `packages/contracts` | Delte API-kontrakter (Zod). Inneholder aldri serverens autorisasjonslogikk |
| `packages/database` | Kysely/Postgres-adapter og genererte databasetyper. Kun for serverkode |
| `packages/domain` | Serverens domenekjerne: aktørmodell, policy-/autorisasjons-API, hendelser, transactional outbox, idempotente kommandoer, konto og plattformroller. Kun for serverkode |
| `packages/auth` | Eneste adapter mot Supabase Auth. Gir leverandørnøytral, verifisert identitet. Kun for serverkode |
| `packages/observability` | Strukturert logging med tillatelsesliste for felt |
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
- **Hostede miljøer:** Gjenoppretting av staging/produksjon fra backup er ikke etablert ennå. Det hører til backup/restore-øvelsen i WP-72 før pilot.

### Testdatabase

CI starter en isolert lokal Supabase-database, bygger den fra alle migrasjoner, kjører pgTAP-testene, kontrollerer at genererte typer stemmer med skjemaet og kjører alle `*.integration.test.ts` mot databasen (`pnpm test:integration`, som krever `DATABASE_URL`). Ingen delt eller hostet database brukes i testene.

## CI-kontroller

| Jobb | Hva den beviser |
| --- | --- |
| `quality` | Lint, typecheck, enhetstester, Prettier og produksjonsbygg (`pnpm check`) |
| `database` | Migrasjoner fra tom database, pgTAP, typekontroll mot skjema og integrasjonstester mot databasen (`pnpm test:integration`) |
| `e2e` | Playwright mot produksjonsbygget og lokal Supabase: røyktest (CSP, sikkerhetshoder, helse), registrering og innlogging med e-postkode, utlogging, ny innlogging og negative API-tester |
| `security` | `pnpm audit` for produksjonsavhengigheter, selvtest av Gitleaks og skanning av hele git-historikken |

CI har bare lesetilgang til repoet (`permissions: contents: read`), og avhengigheter installeres med `--frozen-lockfile`.

### Hemmelighetsskanning

`scripts/security/secret-scan.sh` kjører en pinnet Gitleaks-versjon. Selvtesten lager en kunstig GitHub-lignende testverdi ved kjøretid fra et fast frø, og krever at Gitleaks både rapporterer funn og klassifiserer det som `github-pat` før repoet skannes. Ingen tokenlignende verdi ligger i repoet. Gitleaks er bevisst låst til 8.30.0 inntil en kjent regresjon i 8.30.1 er verifisert løst.

Se [servergrense og autorisasjon](server-boundary.md) for hvordan nye API-er, policyer og kommandoer skal bygges.

## Kjente begrensninger i grunnlaget

- CSP tillater `'unsafe-inline'` for skript fordi Next.js trenger det uten nonce-basert CSP. Innstramming vurderes før Port C (privat chat). `next dev` får i tillegg `'unsafe-eval'`, aldri produksjonsbygget.
- Det finnes ennå ikke hostet staging- eller produksjonsmiljø på Vercel/Supabase.
