# Sikkerhet og threat model

> **Status:** Revidert før den lukkede piloten 11. oktober 2026: hver trussel har fått «I piloten» (hva som er bygget, og hvor det er testet) og «Gjenstår». Ingen gjenstående punkt hindrer den lukkede piloten; de som må løses før bred lansering, står samlet [nederst](#gjenstår-før-bred-lansering). Skal revideres igjen før bred lansering.

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

**Tiltak:** korte/revokerbare sesjoner, sikker recovery, rate limiting, re-autentisering ved sensitive handlinger og sterkere autentisering for plattformforvaltere (WebAuthn som andre faktor, ADR-0011; til den er implementert, avvises privilegerte plattformforvalterhandlinger).

**I piloten:** innlogging bare med engangskode på e-post (6 siffer, gyldig i 10 minutter), ingen passord og ingen åpen registrering (`[auth] enable_signup = false` i produksjon). Tilgangstokenet varer en time og fornyes med roterende fornyelsestoken; serveren sjekker brukeren hos Auth på hver forespørsel. Kodene begrenses per adresse og per klient før Auth spørres (WP-73, `withCodeLimits`). Fire sensitive kommandoer krever ny innlogging. Plattformforvaltning er av i produksjon (`PLATFORM_STEWARDS_ENABLED` ikke satt). En sperret eller sovende konto beholder bare minimumstilgangen til det den allerede er bundet av (`keepsMinimumAccess`). Testet i `rate-limits.spec.ts`, `auth`-pakkens tester og WP-70-sikkerhetstesten.

**Gjenstår:** ingen øvre levetid for en innlogging og ingen «logg ut overalt»; utlogging gjelder bare nettleseren. En konto kan ikke gjenopprettes uten e-posten; da må driften kontaktes.

### Autorisasjonsbypass / IDOR
**Risiko:** bruker gjetter ID eller manipulerer API og får annen kontekst.

**Tiltak:** ressursbasert backend-policy på all lesing/mutering; tilfeldig/ikke-sekvensiell offentlig identifikator kan redusere enumerering, men erstatter ikke policy.

**I piloten:** all lesing og endring går gjennom API-rutene og domenets policyer (ADR-0002). Nettleseren snakker aldri med databasen eller Storage, og appens databaserolle `lanbort_app` har bare tilgang til `app`-skjemaet og kan ikke kjøre noe den ikke trenger (pgTAP 0053). ID-er er tilfeldige UUID-er. WP-70 prøver hver operasjon og leserute med fremmede ID-er (`pilot-access.integration.test.ts`, `e2e/authorization.spec.ts`).

**Gjenstår:** ingen.

### Skjult-miljø-enumerering
**Risiko:** søk, feilkoder, responstid, varsler eller cache røper at miljøet finnes.

**Tiltak:** nøytrale svar, ingen uvedkommende søkeindeks, kontrollert metadata/caching, sikkerhetstester som eksplisitt prøver sidekanaler.

**I piloten:** et skjult miljø man ikke er med i, svarer `not_found` som et miljø som ikke finnes (PS-NFR-002), også i søk, varsler og lister. API-svar har `cache-control: no-store`, og sidene har `private, no-store` (sjekket i produksjon 11. oktober 2026). Alle sider unntatt innloggingen krever innlogging, så ingenting kan indekseres. Testet i WP-70 og miljøtestene.

**Gjenstår:** responstid som sidekanal er ikke målt; det hører til den uavhengige testen (Port E).

### Race condition / dobbeltbooking
**Risiko:** parallelle godkjenninger oppretter kolliderende lån.

**Tiltak:** databaseconstraint/serialisering og atomisk godkjenning.

**I piloten:** utelukkelsesregelen `loan_reservations_no_overlap` i databasen og låste godkjenninger. Testet med samtidige godkjenninger og stresstesten (WP-71).

**Gjenstår:** ingen.

### Replay/dobbelttrykk
**Risiko:** samme kommando utføres flere ganger.

**Tiltak:** idempotency keys og unike kommando-/hendelsesidentifikatorer.

**I piloten:** kommandoer som oppretter eller forplikter noe, krever en nøkkel, og et nytt forsøk får det første svaret (`app.idempotency_records`). Kommandoene uten nøkkel er planlagte jobber, kommandoer som setter en tilstand (to ganger gir samme resultat) og passnøkkelseremonier med engangsutfordring.

**Gjenstår:** ingen.

### XSS og klientkompromiss
**Risiko:** særlig alvorlig fordi E2EE-nøkler finnes i klienten.

**Tiltak:** streng CSP, ingen vilkårlig tredjepartsskript på sensitive flater, escaping/sanitization, sikre dependencies, begrenset token-/nøkkeltilgang og separat vurdering av eventuell analytics.

**I piloten:** CSP med nonce og `strict-dynamic` for skript, `frame-ancestors 'none'`, HSTS og `nosniff` (sjekket i produksjon). Ingen tredjepartsskript og ingen analyse. React escaper alt, og koden bruker aldri `dangerouslySetInnerHTML`. Sesjonen ligger i HttpOnly-cookies, så skript når ikke tokenet. Privat chat, der nøklene finnes, er på bare i den lukkede piloten (OD-0056).

**Gjenstår:** stiler tillater `'unsafe-inline'`, og ingen lint-regel forbyr `dangerouslySetInnerHTML`.

### CSRF / session riding
**Tiltak:** SameSite/sikre cookies, CSRF-beskyttelse der nødvendig, origin-kontroll og re-autentisering for sensitive handlinger.

**I piloten:** cookiene er HttpOnly, `SameSite=Lax` og `Secure` over https. Endrende forespørsler må komme fra appens egen origin (med `Sec-Fetch-Site` som reserve), testet i rutegrensens tester.

**Gjenstår:** origin-sjekken stoler på `x-forwarded-host`, som er trygt bare bak Vercel.

### Ondsinnede opplastinger
**Risiko:** malware, HTML/SVG/script, metadata-lekkasje.

**Tiltak:** allowlist filtyper, størrelsesgrenser, sikker content-disposition, bildebehandling/metadatafjerning for vanlige bilder og malware-kontroll der serveren har klartekst. E2EE-vedlegg kan ikke serverskannes; klienten må begrense typer og behandle dem som ubetrodde filer.

**I piloten:** bare bilder. Serveren avgjør typen ut fra innholdet (JPEG, PNG eller WebP), avviser bilder over 50 megapiksler og koder alt om til WebP uten metadata, så det som lagres, er laget av serveren selv; det erstatter malware-kontroll. Størrelsen begrenses mens forespørselen leses (4 MiB for ting, 1 MiB for profilbilder), bøttene er private og tar bare WebP, og bildene leveres av serveren etter tilgangskontroll med `nosniff`. Opplastinger har egen fartsgrense (`uploads`). Testet i `images.test.ts` og `objects.spec.ts` (metadata fjernet, HTML og for store filer avvist).

**Gjenstår:** begrensning av typer for E2EE-vedlegg vurderes i Port C.

### Spam, trakassering og scraping
**Tiltak:** kontekstkrav for første kontakt, rate limits, blokkering, rapportering, anti-automation-signaler og streng søke-/profiltilgang.

**I piloten:** bare inviterte kan logge inn. Første kontakt krever en sammenheng (PS-COM-006), personsider krever profiltilgang, og blokkering gjør en person til ingen. Fartsgrensene i `rateLimits` dekker kontakt, invitasjoner, rapporter, oppslag, opplastinger og innlogging. Testet i `rate-limits.spec.ts` og domenetestene for blokkering, rapportering og første kontakt.

**Gjenstår:** ingen andre automatiseringssignaler enn fartsgrensene (som CAPTCHA); det trengs først når hvem som helst kan registrere seg.

### Administrator-/plattformmisbruk
**Tiltak:** minste privilegium, habilitetskontroll, sterkere autentisering for plattformforvaltere (ADR-0011), revisjonslogg, begrenset sakstilgang og uavhengig behandlingsvei ved alvorlige saker.

**I piloten:** appens databaserolle eier ingenting og har ingen særrettigheter (pgTAP 0053). Den som er part i en sak, kan ikke behandle den. Plattforminngrep er bare tillegg i loggen (pgTAP 0050), og plattformforvaltning er av i produksjon. Alvorlige henvendelser går til kontaktadressen og håndteres av produkteier etter [alvorlige hendelser](../implementation/pilot-operations.md#alvorlige-hendelser).

**Gjenstår:** at revisjonsloggen ikke kan endres, hviler på triggere per tabell, siden appens rolle kan slette i alle tabeller.

### Backup-/restore-lekkasje
**Risiko:** slettede eller tidligere begrensede data kommer tilbake som aktive.

**Tiltak:** krypterte backups og manuelle dumps lagret utenfor repoet (ADR-0009), kontrollert restore, etterkjøring av slettings-/tombstone-logikk og tilgangsvalidering før tjenesten åpnes.

**I piloten:** Supabases daglige backup og en egen backup i et privat repo, begge i 7 dager ([backup og gjenoppretting](../implementation/backup-restore.md)). Den egne backupen krypteres av GitHub, ikke med en egen nøkkel; begrunnelsen står der. En gjenoppretting gjør slettinger siden backupen på nytt og sjekker tilgangen før appen åpnes (`pnpm ops:restore finish`). Den egne backupen øves hver natt og hver måned mot en isolert stakk.

**Gjenstår:** gjenoppretting av Supabases egen backup er ikke øvd.

### Kompromittert webklient / klientleveranse
**Risiko:** E2EE beskytter ikke mot kode som kjører inne i selve endepunktet. En kompromittert distribusjon, XSS eller ondsinnet klientkode kan lese klartekst/nøkler før kryptering eller etter dekryptering.

**I piloten:** låst `pnpm-lock.yaml`, alle GitHub Actions festet til commit, `pnpm audit` og hemmelighetsskanning (Gitleaks, hele historikken) i CI, og CI med bare lesetilgang. Bare produkteier og Claude kan skrive til repoet.

**Gjenstår:** ingen automatiske varsler om sårbare avhengigheter mellom endringene (som Dependabot), ingen kodeanalyse (som CodeQL), og nøkkelhåndteringen i chat er ikke gjennomgått uavhengig (Port C; i piloten med et bevisst unntak, [risikovurderingen](../implementation/chat-pilot-risikovurdering.md)).

**Tiltak:** streng CSP, minimal tredjepartskode, dependency-/supply-chain-kontroll, sikre deploy-prosesser og eksplisitt sikkerhetsreview av nøkkelhåndtering. Produktet skal ikke beskrive nettleser-E2EE som beskyttelse mot en kompromittert klient; hva den beskytter mot og ikke, står i [ADR-0010](decisions/ADR-0010-e2ee-protokoll-enheter-og-recovery.md). Dersom det senere kreves sterkere beskyttelse mot kompromittert webdistribusjon, må signert/native klient eller tilsvarende vurderes særskilt.

### E2EE-misbruk
Serveren kan ikke moderere klartekst i privat chat proaktivt. Produktkontroller må derfor være blokkering, rate limits, lokal rapport-/innsendingsfunksjon og metadata-minimerte sikkerhetssignaler. E2EE skal ikke svekkes for å gi generell administratorinnsyn.

**I piloten:** privat chat slås på for inviterte deltakere (`CHAT_ENABLED=pilot`, OD-0056) med blokkering, fartsgrenser og innsending av kopier av private meldinger i en sak (WP-46). Hver deltaker bekrefter før første gangs bruk at krypteringen ikke er uavhengig gjennomgått (PS-COM-023).

## Hemmeligheter

- ingen secrets i klientbundle eller repo
- miljøspesifikke secrets i secrets manager
- regelmessig rotasjon av kritiske leverandørnøkler
- minst mulig leverandørrettighet
- produksjonsdata skal ikke kopieres til utviklingsmiljø uten eksplisitt sanitization/prosess

**I piloten:** ingen hemmeligheter i klienten (ingen `NEXT_PUBLIC_`-verdier brukes) eller i repoet (Gitleaks i CI). Hemmelighetene ligger i Vercel og GitHub, og miljøvariabler sjekkes ved oppstart uten at verdiene vises. Loggen tar bare med navngitte felt og aldri feilmeldinger, spørrestrenger eller innhold. Databasetilkoblingen bruker egen rolle med verifisert TLS. Produksjonsdata gjenopprettes bare i midlertidige stakker i øvelsene, som ikke lagrer noe; utvikling og CI bruker testdata.

**Gjenstår:** ingen fast rotasjon av nøkler; en lekket nøkkel byttes etter [alvorlige hendelser](../implementation/pilot-operations.md#alvorlige-hendelser).

## Sikker utvikling

Før pilot (alle gjort, se over):
- dependency- og secretskanning i CI
- automatiserte autorisasjonstester (WP-70)
- tester for doble lån/race conditions (WP-71)
- CSP og grunnleggende web-hardening
- backup/restore-test (øvelsene, [backup og gjenoppretting](../implementation/backup-restore.md#øvelsen))
- manuell trusselmodell-review (denne revisjonen, 11. oktober 2026)

Før bred lansering:
- uavhengig sikkerhetsgjennomgang/penetrasjonstest
- særskilt E2EE-review
- juridisk/personvern-gjennomgang

## Gjenstår før bred lansering

Det som står under «Gjenstår» over, vurderes som akseptabelt i den lukkede piloten fordi bare inviterte kan logge inn, chat og plattformforvaltning er av, og alvorlige hendelser har en betjent kanal. Før bred lansering må i tillegg dette være på plass:

- øvre levetid for innlogginger og «logg ut overalt»
- varsler om sårbare avhengigheter og kodeanalyse i CI
- automatiseringssignaler ved åpen registrering
- en øvelse i å gjenopprette Supabases egen backup
- fast rotasjon av de viktigste nøklene
