# Sikkerhet og threat model

> **Status:** Første trusselmodell for planleggingsfasen. Skal revideres før pilot og før bred lansering.

## Beskyttelsesverdige verdier

- kontoinnlogging og verifiserte kontaktkanaler
- skjulte miljøers eksistens, medlemskap og aktivitet
- privat E2EE-chat og vedlegg
- saks-/modereringdata
- låneavtaler, returer og historikk
- eier-/administratorrettigheter
- presis eller medlemsrelatert geografi
- sikkerhetskoblinger for falske/duplikate kontoer

## Viktige trusler og krav

### Konto-overtakelse
**Risiko:** angriper får tilgang til lån, skjulte miljøer eller administrasjon.

**Tiltak:** korte/revokerbare sesjoner, sikker recovery, rate limiting, re-autentisering ved sensitive handlinger og sterkere autentisering for plattformforvaltere (mekanisme i OD-0010; til den er godkjent og implementert, avvises privilegerte plattformforvalterhandlinger).

### Autorisasjonsbypass / IDOR
**Risiko:** bruker gjetter ID eller manipulerer API og får annen kontekst.

**Tiltak:** ressursbasert backend-policy på all lesing/mutering; tilfeldig/ikke-sekvensiell offentlig identifikator kan redusere enumerering, men erstatter ikke policy.

### Skjult-miljø-enumerering
**Risiko:** søk, feilkoder, responstid, varsler eller cache røper at miljøet finnes.

**Tiltak:** nøytrale svar, ingen uvedkommende søkeindeks, kontrollert metadata/caching, sikkerhetstester som eksplisitt prøver sidekanaler.

### Race condition / dobbeltbooking
**Risiko:** parallelle godkjenninger oppretter kolliderende lån.

**Tiltak:** databaseconstraint/serialisering og atomisk godkjenning.

### Replay/dobbelttrykk
**Risiko:** samme kommando utføres flere ganger.

**Tiltak:** idempotency keys og unike kommando-/hendelsesidentifikatorer.

### XSS og klientkompromiss
**Risiko:** særlig alvorlig fordi E2EE-nøkler finnes i klienten.

**Tiltak:** streng CSP, ingen vilkårlig tredjepartsskript på sensitive flater, escaping/sanitization, sikre dependencies, begrenset token-/nøkkeltilgang og separat vurdering av eventuell analytics.

### CSRF / session riding
**Tiltak:** SameSite/sikre cookies, CSRF-beskyttelse der nødvendig, origin-kontroll og re-autentisering for sensitive handlinger.

### Ondsinnede opplastinger
**Risiko:** malware, HTML/SVG/script, metadata-lekkasje.

**Tiltak:** allowlist filtyper, størrelsesgrenser, sikker content-disposition, bildebehandling/metadatafjerning for vanlige bilder og malware-kontroll der serveren har klartekst. E2EE-vedlegg kan ikke serverskannes; klienten må begrense typer og behandle dem som ubetrodde filer.

### Spam, trakassering og scraping
**Tiltak:** kontekstkrav for første kontakt, rate limits, blokkering, rapportering, anti-automation-signaler og streng søke-/profiltilgang.

### Administrator-/plattformmisbruk
**Tiltak:** minste privilegium, habilitetskontroll, sterkere autentisering for privilegerte roller (OD-0010), revisjonslogg, begrenset sakstilgang og uavhengig behandlingsvei ved alvorlige saker.

### Backup-/restore-lekkasje
**Risiko:** slettede eller tidligere begrensede data kommer tilbake som aktive.

**Tiltak:** krypterte backups og manuelle dumps lagret utenfor repoet (ADR-0009), kontrollert restore, etterkjøring av slettings-/tombstone-logikk og tilgangsvalidering før tjenesten åpnes.

### Kompromittert webklient / klientleveranse
**Risiko:** E2EE beskytter ikke mot kode som kjører inne i selve endepunktet. En kompromittert distribusjon, XSS eller ondsinnet klientkode kan lese klartekst/nøkler før kryptering eller etter dekryptering.

**Tiltak:** streng CSP, minimal tredjepartskode, dependency-/supply-chain-kontroll, sikre deploy-prosesser og eksplisitt sikkerhetsreview av nøkkelhåndtering. Produktet skal ikke beskrive nettleser-E2EE som beskyttelse mot en kompromittert klient. Dersom det senere kreves sterkere beskyttelse mot kompromittert webdistribusjon, må signert/native klient eller tilsvarende vurderes særskilt.

### E2EE-misbruk
Serveren kan ikke moderere klartekst i privat chat proaktivt. Produktkontroller må derfor være blokkering, rate limits, lokal rapport-/innsendingsfunksjon og metadata-minimerte sikkerhetssignaler. E2EE skal ikke svekkes for å gi generell administratorinnsyn.

## Hemmeligheter

- ingen secrets i klientbundle eller repo
- miljøspesifikke secrets i secrets manager
- regelmessig rotasjon av kritiske leverandørnøkler
- minst mulig leverandørrettighet
- produksjonsdata skal ikke kopieres til utviklingsmiljø uten eksplisitt sanitization/prosess

## Sikker utvikling

Før pilot:
- dependency- og secretskanning i CI
- automatiserte autorisasjonstester
- tester for doble lån/race conditions
- CSP og grunnleggende web-hardening
- backup/restore-test
- manuell trusselmodell-review

Før bred lansering:
- uavhengig sikkerhetsgjennomgang/penetrasjonstest
- særskilt E2EE-review
- juridisk/personvern-gjennomgang
