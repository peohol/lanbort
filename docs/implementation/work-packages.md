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
Plattformforvalterrolle, habilitetsgrunnlag og et mekanismenøytralt grunnlag for re-autentisering og sterkere privilegert autentisering. Den konkrete mekanismen skal ikke låses til TOTP, autentiseringsapp eller noen annen mekanisme før OD-0010 er avklart. Uten godkjent mekanisme skal plattformforvaltertilgang avvises. Pakken kan regnes som ferdig med OD-0010 åpen; OD-0010 må avklares før privilegerte plattformforvalterhandlinger tas i reell bruk.

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

### WP-24 — Objektkjerne
**Krav:** PS-OBJ-001–005  
CRUD, kategori, bilder, tilgjengelighetsintervaller og global faktisk-ledighet-modell.

### WP-25 — Miljøpublisering og godkjenning
**Krav:** PS-OBJ-006, PS-ENV-011, PS-OBJ-017  
Publiseringsstatus, avpublisering og forhåndsgodkjenning.

### WP-26 — Medeierskap
**Krav:** PS-OBJ-007–013  
Invitasjon/aksept, restriksjoner, blokkfrys, uttreden, sporbar redigering og optimistisk konfliktkontroll.

## Fase 3

### WP-30 — Låneforespørsel og opprinnelseskontekst
**Krav:** PS-LOAN-001–005  
Miljø-/venneinngang, ansvarserklæring og vilkårsbekreftelse.

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

### WP-43 — Privat E2EE-chat
**Krav:** PS-COM-004–006, PS-NFR-007; ADR-0003  
Ciphertext-lagring, klientkryptering, ingen lesebekreftelser og kontrollert første kontakt.

### WP-44 — Lånelogistikk ved blokkering
**Krav:** PS-COM-007  
Egen lånebundet samtaletype med servervalidert åpning/stenging.

### WP-45 — Administrative saker og kø
**Krav:** PS-COM-010–015  
Sakstyper, partstilgang, tildeling, habilitet og separate forklaringsrunder.

### WP-46 — Privat melding som saksdokumentasjon
**Krav:** PS-COM-013  
Lokal dekryptering og eksplisitt innsendt kopi uten bakdør til privat chat.

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
Start først når OD-0003 er avklart.

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
Prøv eksplisitt skjulte miljøer, historisk tilgang, medeiergrenser, inhabilitet og representanttilgang.

### WP-71 — Samtidighets- og idempotensstresstest
Parallelle godkjenninger, retry, dobbelttrykk, avtaleendring og gjenåpnet retur.

### WP-72 — Backup/restore-øvelse
Verifiser RPO/RTO-mål, rebuild av indeks og at slettet/begrenset data ikke blir aktivt igjen.

### WP-73 — Misbruks- og rate-limit-hardening
Kontaktspam, scraping, invitasjoner, rapportering og auth-angrep.

### WP-74 — Pilotinnhold og policy
Avklar OD-0006 og en konservativ pilotgrense for OD-0001 før reelle objekter åpnes for deling.

**Status:** Kategoriene (PS-OBJ-018) og pilotgrensen (PS-OBJ-019) er besluttet og bygget. Plattformforvalteres sperre av et objekt overalt er stengt til OD-0010 er avgjort; til da kan bare miljøets administratorer stoppe et objekt, og bare i sitt miljø.

### WP-75 — Pilot release gate
Kjør [kvalitetsportene](quality-gates.md), dokumenter kjente begrensninger og åpne kun for definert pilotgruppe.
