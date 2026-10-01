# Implementeringsplan

> **Status:** Første implementeringsplan basert på validert produktspesifikasjon v0.1, UX-modell v0.1 og systemarkitektur v0.1. Ingen produktkode er skrevet i denne planleggingsgrenen.

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

### Fase 1 — Identitet, autorisasjon og hendelsesgrunnmur
Mål: systemet kan vite hvem brukeren er, hva vedkommende får gjøre, og registrere kritiske endringer korrekt.

Leveranser:
- konto, e-postverifisering, profil og sesjon
- policy-/autorisasjonsrammeverk
- plattformrolle og re-autentisering/MFA-grunnlag
- audit events og transactional outbox
- idempotensmønster for kommandoer

**Gate:** negative autorisasjonstester må være på plass før flere domener bygges.

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
