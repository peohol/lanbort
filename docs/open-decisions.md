# Åpne detaljbeslutninger

> **Status:** Felles arbeidsregister for uavklarte detaljvalg i produktspesifikasjon, UX og systemarkitektur.

## Formål

Dette dokumentet brukes når planarbeidet avdekker et konkret valg som må avklares senere, men som **ikke** er et nytt spørsmål om Lånborts grunnleggende produktmodell.

Typiske eksempler er:

- konkrete terskler, frister og standardverdier
- felt og metadata som må fastsettes
- detaljer i brukerflyt eller interaksjonsmønstre
- tekniske mekanismer og arkitekturvalg som ennå ikke har tilstrekkelig beslutningsgrunnlag
- valg som avhenger av juridisk, sikkerhetsmessig eller teknisk avklaring

Reelle spørsmål om produktets grunnmodell hører fortsatt hjemme i [visjonens åpne spørsmål](vision/open-questions.md).

## Arbeidsregel

- Hvert åpent spørsmål får en permanent ID: `OD-0001`, `OD-0002` osv.
- Angi hvilket lag som eier spørsmålet: **produktspesifikasjon**, **UX**, **arkitektur** eller **tverrgående**.
- Beskriv spørsmålet kort og konkret. Ikke skriv en full utredning her.
- Pek ved behov til relevante krav, UX-regler, visjonskilder eller andre dokumenter.
- Et åpent detaljvalg er **ikke** en normativ beslutning og skal derfor ikke brukes som kilde for implementering.
- Når spørsmålet avgjøres, føres selve beslutningen inn i det kanoniske dokumentet som eier den.
- Den avgjorte posten beholdes kort under «Avklart» med lenke til den kanoniske beslutningen. Registeret skal ikke duplisere beslutningsteksten.

## Mal

```md
### OD-0001 — Kort spørsmål

- **Lag:** Produktspesifikasjon | UX | Arkitektur | Tverrgående
- **Status:** Åpen
- **Berører:** PS-..., UX-..., VP-... eller relevante dokumentlenker
- **Spørsmål:** Hva må avgjøres?
- **Avhenger av:** Eventuell analyse, juridisk avklaring, teknisk undersøkelse eller annet beslutningsgrunnlag.
```

Når spørsmålet er avgjort:

```md
### OD-0001 — Kort spørsmål

- **Lag:** ...
- **Status:** Avklart
- **Beslutning:** Se [kanonisk dokument](...).
```

## Åpne

### OD-0001 — Plattformpolicy for regulerte og risikofylte objekter
- **Lag:** Tverrgående
- **Status:** Åpen
- **Berører:** VP-17, PS-OBJ-017
- **Spørsmål:** Hvilke objektkategorier skal forbys, begrenses eller kreve særvilkår?
- **Avhenger av:** Juridisk og sikkerhetsmessig vurdering før bred lansering.

### OD-0002 — Oppbevaringstider per datatype
- **Lag:** Tverrgående
- **Status:** Åpen
- **Berører:** PS-ADM-011, PS-NFR-009, PS-NFR-013
- **Spørsmål:** Hvor lenge skal låne-, saks-, modererings-, sikkerhets- og øvrige historikkdata bevares?
- **Avhenger av:** Produktbehov, personvern og juridisk vurdering.

### OD-0003 — Dokumentasjonskrav ved dødsfall eller varig utilgjengelighet
- **Lag:** Produktspesifikasjon
- **Status:** Åpen
- **Berører:** PS-ADM-007, PS-ADM-008
- **Spørsmål:** Hvilket bevisnivå kreves for å verifisere forholdet og en legitim representant?
- **Avhenger av:** Misbruksrisiko og juridisk vurdering.

### OD-0004 — Endelige eksterne varslingskanaler og standardvalg
- **Lag:** UX
- **Status:** Åpen
- **Berører:** PS-COM-003
- **Spørsmål:** Hvilke kombinasjoner av web push, e-post og eventuell senere mobilpush skal være standard for hvert varslingsnivå?
- **Avhenger av:** Pilotdata og teknisk støtte.

### OD-0005 — Kryptografisk modell for ende-til-ende-kryptert chat
- **Lag:** Arkitektur
- **Status:** Åpen
- **Berører:** PS-COM-005, PS-NFR-007
- **Spørsmål:** Hvordan skal nøkkelstyring, flere enheter, nøkkelbytte, backup og tap av enhet håndteres uten servertilgang til klartekst?
- **Avhenger av:** Sikkerhetsarkitektur og konkret klientmodell, inkludert multi-device, nøkkelbackup/recovery og hvilket sikkerhetsnivå nettleserklienten realistisk kan love.

### OD-0006 — Endelig kategoritaksonomi for objekter
- **Lag:** Produktspesifikasjon
- **Status:** Åpen
- **Berører:** PS-OBJ-002
- **Spørsmål:** Hvilke kategorier og underkategorier skal pilotversjonen tilby?
- **Avhenger av:** Faktisk innhold i pilotmiljøet og OD-0001.

### OD-0007 — Juridisk lanseringsgjennomgang
- **Lag:** Tverrgående
- **Status:** Åpen
- **Berører:** produktvilkår, personvern, moderering, risikofylte objekter
- **Spørsmål:** Hvilke konkrete norske/EØS-krav må innarbeides i vilkår, personvern, moderering, datalivssyklus og tilgjengelighet før bred lansering?
- **Avhenger av:** Kvalifisert juridisk vurdering av gjeldende rett.

### OD-0008 — Uavhengig behandling av alvorlige saker om plattformforvaltningen
- **Lag:** Tverrgående
- **Status:** Åpen
- **Berører:** PS-ADM-013
- **Spørsmål:** Hvilken organisatorisk ordning skal brukes dersom alle interne plattformforvaltere er inhabile?
- **Avhenger av:** Organisasjonsform og skala før bred lansering.

### OD-0009 — Konkret implementeringsstack og driftsleverandører
- **Lag:** Arkitektur
- **Status:** Åpen
- **Berører:** ADR-0001–ADR-0005, PS-NFR-001–PS-NFR-015
- **Spørsmål:** Hvilket web-rammeverk, database-/hostingoppsett, auth-, e-post-, kart-, push- og lagringsoppsett skal brukes i første implementasjon?
- **Avhenger av:** Oppdatert vurdering av modenhet, sikkerhet, kostnad og leverandørlåsing ved implementeringsstart. PostgreSQL er allerede valgt som referanse for den transaksjonelle kjernen.

## Avklart

Ingen registrerte avklarte detaljbeslutninger ennå.
