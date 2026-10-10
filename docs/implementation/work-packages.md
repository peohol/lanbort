# Kodeagent-arbeidspakker

> **Status:** Planlagte, avgrensede arbeidspakker. Nummereringen uttrykker avhengigheter, ikke nødvendigvis én PR per punkt.

## Fase 0

### WP-00 — Stackbeslutning
**Avhenger av:** OD-0009  
Velg konkret stack og dokumenter beslutningene som ADR-er. Ingen produktkode før dette er eksplisitt avgjort.

### WP-01 — Prosjektskjelett og utviklingsmiljø
**Avhenger av:** WP-00  
Opprett appstruktur, lokal konfigurasjon, miljøvariabler, CI og standardkommandoer.

### WP-02 — Database, migrasjoner og testdatabase
**Avhenger av:** WP-00  
Etabler PostgreSQL-skjema/migreringsflyt, isolert testdatabase og rollback-/reset-rutiner.

### WP-03 — Kvalitets- og sikkerhetsbaseline
**Avhenger av:** WP-01  
Lint/typecheck/test, dependency-/secretskanning, CSP-grunnlag og trygg logging.

## Fase 1

### WP-10 — Konto og verifisert e-post
**Krav:** PS-USR-001, PS-USR-002  
Registrering, verifisering, profil og basis sesjonshåndtering.

### WP-11 — Autorisasjonsrammeverk
**Krav:** PS-NFR-001–003; ADR-0002  
Etabler én konsistent policyvei for ressurs-/kontekstbasert tilgang og en testmatrise med eksplisitte avslag.

### WP-12 — Plattformrolle og privilegert autentisering
**Krav:** PS-USR-008, PS-USR-009  
Plattformforvalterrolle, habilitetsgrunnlag og et mekanismenøytralt grunnlag for re-autentisering og sterkere privilegert autentisering. Mekanismen er besluttet i [ADR-0011](../architecture/decisions/ADR-0011-webauthn-for-plattformforvaltere.md): passkey/WebAuthn som andre faktor, bare for plattformforvaltere, der fysisk sikkerhetsnøkkel støttes, men ikke kreves. Til den er bygget, skal plattformforvaltertilgang avvises.

**Status:** Ferdig bygget, med WebAuthn etter ADR-0011 og OD-0023 (passkeys, registreringskode og tilbakestilling i `pnpm ops:steward-passkeys`). Står av i produksjon (`PLATFORM_STEWARDS_ENABLED`) til den er verifisert der, før privilegerte plattformforvalterhandlinger tas i reell bruk (Port D).

### WP-13 — Audit events og transactional outbox
**Krav:** PS-DOM-006, PS-NFR-009; ADR-0004  
Append-only relevante hendelser, outbox og idempotent worker-grunnlag.

### WP-14 — Idempotente kommandoer
**Krav:** PS-NFR-005  
Felles mekanisme for retry-sikre viktige mutasjoner.

## Fase 2

### WP-20 — Vennskap og blokkering
**Krav:** PS-USR-003–007  
Forespørsel/aksept/fjerning/blokkering og tilgangstester.

### WP-21 — Miljøkjerne
**Krav:** PS-ENV-001–006  
Opprettelse, typer, medlemskap, krav og søknadsflyt.

### WP-22 — Miljøroller og kontinuitet
**Krav:** PS-ENV-003, PS-ENV-012–014  
Administrator/eier, rolleinvitasjon, eieroverføring, eierløshet og avvikling.

### WP-23 — Miljøtypeendringer og historisk personvern
**Krav:** PS-ENV-007–010  
Strengere/svakere personvern, passiv status og konto-bundne skjulte invitasjoner.

**Status:** Ferdig. Resten etter OD-0012 (skjult→lukket med 7 dagers frist, og fjerning i stedet for passiv status for medlemmer uten ja, PS-ENV-008) ble bygget som serverdelen av WP-85.

### WP-24 — Objektkjerne
**Krav:** PS-OBJ-001–005  
CRUD, kategori, bilder, tilgjengelighetsintervaller og global faktisk-ledighet-modell.

### WP-25 — Miljøpublisering og godkjenning
**Krav:** PS-OBJ-006, PS-ENV-011, PS-OBJ-017  
Publiseringsstatus, avpublisering og forhåndsgodkjenning.

### WP-26 — Medeierskap
**Krav:** PS-OBJ-007–013  
Invitasjon/aksept, restriksjoner, blokkfrys, uttreden, sporbar redigering og optimistisk konfliktkontroll.

### WP-27 — Synlighet for venner
**Krav:** PS-OBJ-020, PS-USR-004  
Publiseringsvalget «Venner» per objekt (av som standard), vennens visning av eierens synlige objekter, filteret «Venner» i Finn og at direkte forespørsler krever valget.

**Status:** Serverdelen er ferdig (OD-0013 avklart 6. oktober 2026). Gjenstår: UI-delen, som venter på WP-81, WP-83 og WP-86.

## Fase 3

### WP-30 — Låneforespørsel og opprinnelseskontekst
**Krav:** PS-LOAN-001–005  
Miljø-/venneinngang, ansvarserklæring og vilkårsbekreftelse.

**Status:** Ferdig. Direkte forespørsler krever at objektet er synlig for venner (WP-27), og meldingen er valgfri etter OD-0015 (PS-LOAN-004, bygget i WP-83).

### WP-31 — Atomisk godkjenning og reservasjon
**Krav:** PS-LOAN-006–008; PS-NFR-004  
Databaselås/constraint, avtalesnapshot, ansvarlig utlåner og automatisk avslutning av kolliderende forespørsler.

### WP-32 — Kansellering og avtaleendring
**Krav:** PS-LOAN-010–011  
Samtykkebaserte endringer, ensidig kansellering før overlevering og kollisjonskontroll.

### WP-33 — Overlevering og aktivt lån
**Krav:** PS-LOAN-012–013  
Normal overgang, 72-timers avklaring og usikker/uenighet.

### WP-34 — Retur og tidlig retur
**Krav:** PS-LOAN-014–020  
Returavklaring, utlånerbekreftelse, 30-sekunders angrebuffer, gjenåpning og frigjøring av restperiode.

### WP-35 — Ansvarsoverføring og minimumstilgang
**Krav:** PS-LOAN-009, PS-LOAN-021  
Medeierovertakelse, snever mottaksbekreftelse og tilgang ved blokkering/deaktivering.

## Fase 4

### WP-40 — Varslingssenter og preferanser
**Krav:** PS-COM-001–003  
In-app varsler, nivåer og preferanser uten påvirkning på domenestatus.

### WP-41 — Ekstern pilotvarsling
**Krav:** PS-COM-003  
E-postlevering via adapter og minimal sensitiv payload. OD-0004 kan ferdigstilles iterativt.

### WP-42 — E2EE-protokollbeslutning
**Avhenger av:** OD-0005  
Dokumenter nøkkel-, multi-device- og recovery-modell før meldingsimplementasjon.

**Status:** Ferdig. OD-0005 er avgjort i [ADR-0010](../architecture/decisions/ADR-0010-e2ee-protokoll-enheter-og-recovery.md), med kryptogrunnlaget og testene i `packages/e2ee`. ADR-en beskriver hva WP-43, WP-44 og WP-46 bygger videre på.

### WP-43 — Privat E2EE-chat
**Krav:** PS-COM-004–006, PS-NFR-007; ADR-0003, ADR-0010  
Ciphertext-lagring, klientkryptering, ingen lesebekreftelser og kontrollert første kontakt.

**Status:** Ferdig bygget, men av for ekte brukere til Port C er oppfylt (se [servergrensen](server-boundary.md#privat-chat-wp-43)). Del 1 er serverens leveringstjeneste. Del 2 er krypteringen i nettleseren, lagringen på enheten, chatsidene, «Mine enheter», kobling med QR-kode eller kode, tilbakestilling og sikkerhetskoden. Gjenopprettingsnøkkelen med sikkerhetskopi (ADR-0010 punkt 8, PS-COM-019) er bygget 10. oktober 2026. Kjent og bevisst utsatt: kryptering i en egen Web Worker (ADR-0010 sier «bør»), og reparasjon av en enhet som har kommet i utakt med en gruppe uten å tilbakestille. En ny enhet som venter på godkjenning, må holde siden åpen; lastes den på nytt, må koblingen startes igjen.

### WP-44 — Lånelogistikk ved blokkering
**Krav:** PS-COM-007  
Egen lånebundet samtaletype med servervalidert åpning/stenging.

**Status:** Ferdig: databasen åpner kanalen ved blokkering mellom partene i et pågående lån og stenger den når lånet avsluttes eller partene byttes, og meldingene går i en egen kryptert samtaletype på privat chats leveringstjeneste, med korte meldinger og ingen levering etter stenging (se [servergrensen](server-boundary.md#lånelogistikk-ved-blokkering-wp-44)). OD-0020 er besluttet (6. oktober 2026): samtalen kan ikke stenges av én part mens lånet pågår, og avsluttes først når lånet avsluttes. Gjenstår: personlig demping og arkivering for hver part, og å fjerne den ubrukte veien for tidlig stenging som sikkerhetstiltak. I nettleseren tilbyr lånets side samtalen når kanalen er åpen, samtalen er merket som kun for praktisk avslutning av lånet med lenke til det, og skrivefeltet sier fra før en melding blir for lang.

### WP-45 — Administrative saker og kø
**Krav:** PS-COM-010–015  
Sakstyper, partstilgang, tildeling, habilitet og separate forklaringsrunder.

### WP-46 — Privat melding som saksdokumentasjon
**Krav:** PS-COM-013  
Lokal dekryptering og eksplisitt innsendt kopi uten bakdør til privat chat.

**Status:** Serversiden er ferdig: en deltaker kan sende inn en lesbar kopi av valgte private meldinger sammen med det hen skriver i en sak, og kopien blir saksdata (se [servergrensen](server-boundary.md)). Selve valget i samtalen, der meldingene dekrypteres på enheten, bygges når saker får en egen side; chatvisningen fra WP-43 har historikken det trenger. Vedlegg kan ikke sendes inn ennå, fordi verken privat chat eller saker har vedlegg.

## Fase 5

### WP-50 — Anmeldelsesrett og dobbelblind publisering
**Krav:** PS-TRUST-001–005  
Dynamiske dimensjoner, 14-dagers frist, skjult periode og ett tilsvar.

### WP-51 — Kontekstuell tillit og aggregater
**Krav:** PS-TRUST-006–012  
Rolle-/kontekstgrenser, skjult-miljø-personvern og robuste aggregater.

### WP-52 — Moderering
**Krav:** PS-TRUST-013–016  
Rapporter, lokale/globale tiltak, moderering av anmeldelse og audit.

### WP-53 — Deaktivering, suspensjon og sletting
**Krav:** PS-ADM-001–006, PS-ADM-014  
Kontotilstander, bindingkontroll, pseudonymisering og avledet datasletting.

### WP-54 — Død/varig utilgjengelighet og representant
**Krav:** PS-ADM-007–008  
Utsatt til OD-0003 er avklart; ikke en del av piloten. Det som finnes nå er fail-closed: en melding (PS-ADM-007) blir en fortrolig verifikasjonssak for plattformforvaltere (WP-45) som ikke endrer konto, lån eller tilganger, og det finnes ingen representantrolle, -tilgang eller særskilt kontoavslutning. Tester i domenet og databasen viser at ingen (melder, medeier eller plattformforvalter) får tilgang til eller handler for brukeren, og at en ny rolle, policy eller databaseregel for representanter ikke kan legges til uten at testene endres bevisst.

### WP-55 — Duplikat/falsk identitet
**Krav:** PS-ADM-009–010  
Kontrollert avvikling/kobling uten sosial historikk-sammenslåing.

## Fase 6

### WP-60 — Hjem og global navigasjon
**UX:** UX-IA-001–003, UX-IA-005  
Fem hovedområder, varslingslag og handling-først-Hjem.

### WP-61 — Finn og avledet søkeindeks
**Krav:** ADR-0005, UX-P20  
Objekt-/miljøsøk, tilgangsverifisering og ingen skjult miljølekkasje.

### WP-62 — Geografisk oppdagelse
**Krav:** PS-NFR-008  
Kart/område via provider-adapter med lavest nødvendig presisjon.

### WP-63 — Objektabonnement og spørsmål
**Krav:** PS-OBJ-014–015  
Tilgangsbundet abonnement og miljøisolerte spørsmålstråder.

### WP-64 — Historikk og statuspresentasjon
**UX:** UX-IA-008, UX-INT-004, UX-INT-008  
Menneskelig status/neste handling og sekundær tidslinje.

### WP-65 — Responsivitet og tilgjengelighet
**UX:** UX-A11Y-001–009  
Systematisk gjennomgang av alle kjerneflyter på mobil, desktop, tastatur og hjelpemidler.

## Fase 7

### WP-70 — Autorisasjons- og personvernsikkerhetstest
Prøv eksplisitt skjulte miljøer, historisk tilgang, medeiergrenser, inhabilitet og representanttilgang. Så lenge OD-0003 er åpen, er det pilotmodellen som testes: representanttilgang skal ikke kunne oppnås. Privilegerte plattformforvalterhandlinger skal være avvist uansett hva innloggingstjenesten rapporterer, så lenge WebAuthn-mekanismen fra ADR-0011 ikke er bygget. Privat chat (WP-43) er med: samtaler og ventende enhetskoblinger finnes i den skjulte verdenen, og bare samtalens deltakere når dem. Responstid som sidekanal testes ikke automatisk, fordi slike målinger blir ustabile i delt CI; den hører til den uavhengige sikkerhetsgjennomgangen i Port E.

### WP-71 — Samtidighets- og idempotensstresstest
Parallelle godkjenninger, retry, dobbelttrykk, avtaleendring og gjenåpnet retur.

### WP-72 — Backup/restore-øvelse
Verifiser RPO/RTO-mål, rebuild av indeks og at slettet/begrenset data ikke blir aktivt igjen. I utviklingsfasen er strategien gjenoppbygging fra migrasjonene og manuelle dumps på Supabase Free ([ADR-0009](../architecture/decisions/ADR-0009-backup-i-utviklingsfasen.md)).

**Status:** Øvelsen kjører i CI, og «Restore drill» gjenoppretter en ekte backup av produksjon med filene til et isolert miljø hver måned ([backup og gjenoppretting](backup-restore.md)). Backupnivået for piloten står i OD-0022: Supabases daglige backup (organisasjonen er på Pro) og en egen daglig backup av database og filer i et privat repo.

### WP-73 — Misbruks- og rate-limit-hardening
Kontaktspam, scraping, invitasjoner, rapportering og auth-angrep.

### WP-74 — Pilotinnhold og policy
Avklar OD-0006 og en konservativ pilotgrense for OD-0001 før reelle objekter åpnes for deling.

**Status:** Kategoriene (PS-OBJ-018) og pilotgrensen (PS-OBJ-019) er besluttet og bygget. Plattformforvalteres sperre av et objekt overalt er stengt til WebAuthn-mekanismen fra ADR-0011 er bygget; til da kan bare miljøets administratorer stoppe et objekt, og bare i sitt miljø.

### WP-75 — Pilot release gate
Kjør [kvalitetsportene](quality-gates.md), dokumenter kjente begrensninger og åpne kun for definert pilotgruppe.

## Fase 8

### WP-80–WP-89 — Brukerflaten
**UX:** UX-IA, UX-JRN, UX-INT, UX-EXC, UX-PRIV, UX-A11Y  
Den helhetlige, mobil-først brukerflaten oppå det bygde domenet: felles grunnlag først (WP-80), deretter parallelle pakker for objekter, forespørsler, miljøer, personer, lån og saker. Leveranser, skjermer, avhengigheter og rekkefølge står i [UI-arbeidspakkene](ui-work-packages.md).
