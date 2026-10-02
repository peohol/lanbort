# Implementeringsplan

> **Status:** Første implementeringsplan basert på validert produktspesifikasjon v0.1, UX-modell v0.1 og systemarkitektur v0.1. Fase 0 (implementeringsgrunnlag) og Fase 1 (identitet, autorisasjon og hendelsesgrunnmur) er levert.

## Prinsipp

Implementeringen skal bygges **vertikalt og testbart**, men uten at kodeagentene tar nye produkt- eller arkitekturbeslutninger på egen hånd.

Før en arbeidspakke startes skal agenten lese:
1. relevante `PS-*`-krav
2. relevante `UX-*`-regler
3. relevante arkitekturdokumenter/ADR-er
4. `open-decisions.md` for å kontrollere at pakken ikke avhenger av et uløst valg

Et uløst `OD-*` skal ikke «løses» implisitt i kode.

## Faser

### Fase 0 — Implementeringsgrunnlag
Mål: velg konkret stack, opprett prosjektstruktur og kvalitetssystem uten domenefunksjonalitet.

**Gate:** OD-0009 avgjøres og dokumenteres som ADR-er.

Leveranser:
- konkret web-/backend-/database-/auth-/storage-/mail-oppsett
- lokal utvikling og miljøkonfigurasjon
- migreringssystem
- CI med test, lint/typecheck, dependency- og secretskanning
- testdatabase og grunnleggende observability uten sensitive data

**Status (1. oktober 2026):** Levert. Se [lokal utvikling, database og CI](local-development.md) for hvordan grunnlaget brukes.

| Pakke | Leveranse | Status |
| --- | --- | --- |
| WP-00 | OD-0009 avklart gjennom ADR-0006–ADR-0008 | Ferdig |
| WP-01 | pnpm-workspace, Next.js-app, delt kontraktspakke, `/api/health`, miljøvariabler, standardkommandoer og CI | Ferdig |
| WP-02 | Supabase-migrasjoner, privat `app`-skjema, pgTAP-tester, isolert CI-database, reset-rutine og genererte databasetyper kontrollert mot skjema | Ferdig |
| WP-03 | Lint/typecheck/test, Playwright-røyktest, dependency-audit, Gitleaks med selvtest, CSP/sikkerhetshoder og logging med felt-tillatelsesliste | Ferdig |

Kjente begrensninger som bevisst er utsatt: CSP med `'unsafe-inline'` for skript (vurderes før Port C), og hostet staging/produksjon (etableres når det trengs, senest før pilot).

### Fase 1 — Identitet, autorisasjon og hendelsesgrunnmur
Mål: systemet kan vite hvem brukeren er, hva vedkommende får gjøre, og registrere kritiske endringer korrekt.

Leveranser:
- konto, e-postverifisering, profil og sesjon
- policy-/autorisasjonsrammeverk
- plattformrolle, re-autentisering og mekanismenøytralt grunnlag for sterkere autentisering (mekanismen avklares i OD-0010)
- audit events og transactional outbox
- idempotensmønster for kommandoer

**Gate:** negative autorisasjonstester må være på plass før flere domener bygges.

**Status (1. oktober 2026):** Levert. Reglene for ny serverkode står i [servergrense og autorisasjon](server-boundary.md).

| Pakke | Leveranse | Status |
| --- | --- | --- |
| WP-10 | Supabase Auth bak serveradapter, innlogging/registrering med engangskode på e-post, HttpOnly-sesjon, intern bruker/profil atskilt fra leverandøridentiteten, registrering med ekte navn og 18+ | Ferdig |
| WP-11 | Policy-API (aktør + handling + ressurs + kontekst + tilstand), standardiserte avslag, felles Route Handler-grense med meta-test og lint, testmatrise med tillatte og avviste tilfeller for hver policy | Ferdig |
| WP-12 | Plattformforvalterrolle fra egne tildelinger, revisjonslogget og idempotent driftskommando, mekanismenøytrale regler for sterkere autentisering (`aal2`), nylig innlogging og habilitet, og ny innlogging med e-postkode | Ferdig, mekanisme for sterkere autentisering venter på OD-0010 |
| WP-13 | Append-only audit-hendelser, transactional outbox i samme transaksjon, idempotent worker med lease, retry og dead-letter | Ferdig |
| WP-14 | Idempotente kommandoer: ingen dobbel utførelse, konsistent replay, trygt ved samtidige kall og ingen lekkasje mellom aktører | Ferdig |

**Port A er oppfylt:**
- migrasjoner kjøres fra tom database i CI (`pnpm db:reset`), med pgTAP-tester for alle tabeller
- autorisasjon har positive og negative tester: `policies.test.ts` krever begge utfall for hver policy, og integrasjons- og nettlesertester prøver avslag mot ekte database og API
- alle sensitive API-er går gjennom `route.user`/`route.public`/`route.scheduler` og domenepolicyer, kontrollert av meta-test og lint
- avhengigheter og hemmeligheter skannes i CI (`pnpm audit`, Gitleaks)
- audit/outbox er testet mot ekte database, også retry, dead-letter og samtidige workere
- gjentatt idempotent kommando gir ikke duplikat, også ved samtidige kall

Bevisst utsatt:
- ekte outbox-consumers (e-post/push) kommer i Fase 4, og Vercel Cron settes opp med hostede miljøer
- hvem som kan utnevne plattformforvaltere i appen er ikke bestemt, så det skjer foreløpig bare via driftskommandoen
- mekanisme for sterkere autentisering for plattformforvaltere venter på OD-0010; til da er handlinger som plattformforvalter stengt
- endring av e-postadresse og synlighet per profilfelt (Fase 2)
- egen databaserolle med minste privilegium for appen, og verifisering av Supabase Auths rate limits når innlogging går via serveren, før pilot (Port D)
- oppbevaringstid for audit-hendelser venter på OD-0002

### Fase 2 — Sosial modell, miljøer og objekter
Mål: brukere kan etablere de kontekstene og objektene som senere lån bygger på.

Leveranser:
- vennskap og blokkering
- miljøer, medlemskap, invitasjoner og roller
- miljøtype/personvern og kontrollerte typeendringer
- objekt CRUD, tilgjengelighet og bilder
- miljøpublisering og forhåndsgodkjenning
- medeierskap, restriksjoner og endringskonflikter
- enkel målrettet Finn-flate

### Fase 3 — Lånekjernen
Mål: første komplette, transaksjonelt sikre ende-til-ende-lån.

Leveranser:
- forespørsel med stabil opprinnelseskontekst
- atomisk godkjenning/reservasjon
- kollisjonsbeskyttelse på datalaget
- ansvarlig utlåner og avtalesnapshot
- overlevering, aktivt lån og retur
- kansellering, avtaleendring og tidlig retur
- nøytrale avklarings-/uenighetstilstander
- medeieroverføring av ansvar

**Milepæl:** et lån skal kunne gjennomføres uten chat eller anmeldelse, men med korrekt historikk og alle kritiske invariants.

### Fase 4 — Varsler, privat kommunikasjon og saker
Mål: brukerne får nødvendig kommunikasjon uten å blande privat chat med system-/saksdata.

Leveranser:
- varslingssenter og leveringsworker
- e-post for pilotkritiske hendelser
- E2EE privat chat etter avklaring av OD-0005
- smal lånelogistikk ved blokkering
- administrative samtaler og saksmodell
- eksplisitt innsending av privat meldingsinnhold som saksdokumentasjon

### Fase 5 — Tillit, moderering og livssyklus
Mål: et gjennomført eller avvikende lån kan etterbehandles uten å gjøre plattformen til domstol.

Leveranser:
- anmeldelsesrett og dobbelblind 14-dagers flyt
- kontekstuell synlighet og ett tilsvar
- aggregater som tåler moderering/gjenåpning
- rapporter og lokale/globale modereringstiltak
- suspensjon/deaktivering/kontrollert sletting
- representantmodell og særskilt kontoavslutning når OD-0003 er avklart

### Fase 6 — Oppdagelse, finpuss og full UX-integrasjon
Mål: alle kjernefunksjoner presenteres gjennom den vedtatte informasjonsarkitekturen.

Leveranser:
- full Hjem/Finn/Lån/Mine ting/Samtaler-navigasjon
- søk og geografi via avledet indeks
- objektabonnement og miljøspesifikke spørsmål
- historikktidslinjer
- responsive desktop-varianter uten ny mental modell
- tilgjengelighetsgjennomgang av alle kjerneflyter

### Fase 7 — Pilot-hardening
Mål: lukket pilot med reelle brukere kan kjøres kontrollert.

Leveranser:
- threat-model-review og autorisasjons-/race-condition-testpakke
- backup/restore-test
- sikker håndtering av produksjonshemmeligheter og miljøer
- abuse/rate limiting
- pilotens kategoritaksonomi og risikobegrensning
- observability og driftsprosedyrer
- dokumentert liste over kjente begrensninger

## Ikke mål for første pilot

- betaling, depositum eller forsikring
- BankID
- automatisk statistisk tillitsvekting
- sosial feed
- native mobilapp
- avansert «magisk» kontosammenslåing

## Etter pilot

Pilotdata skal brukes til å revurdere konkrete tidsfrister, varslingsstandarder, oppdagelsesbehov og andre detaljer som er eksplisitt definert som justerbare standarder. Endringer som påvirker grunnmodellen skal fortsatt løftes til visjonslaget.
