# Transaksjoner, samtidighet og konsistens

> **Status:** Systemarkitektur v0.1.

## Lånegodkjenning

Godkjenning skal gjennomføres i én database-transaksjon som:
1. låser eller på annen måte serialiserer den relevante objekt-/reservasjonsbeslutningen
2. validerer fortsatt adgang og blokkering
3. validerer at ingen godkjent reservasjon overlapper perioden
4. oppretter låneavtale-snapshot
5. oppretter reservasjon og ansvarlig utlåner
6. avslutter kolliderende åpne forespørsler
7. skriver relevante domene-/outbox-hendelser
8. committer

PostgreSQL-referansemodellen bør håndheve at aktive reservasjoner for samme objekt ikke overlapper på datalaget, for eksempel med range/exclusion-mekanisme eller tilsvarende serialiserbar strategi.

## Idempotens

Alle viktige kommandoer fra klient skal tåle retry med idempotency key eller tilsvarende:
- send forespørsel
- godkjenn/avslå
- kanseller
- bekreft overlevering/retur
- avtaleendring
- rolletildeling
- invitasjon
- kontoslettingsforespørsel

Samme logiske kommando skal gi samme resultat, ikke dupliserte hendelser.

## Optimistisk samtidighet

Mutable ressurser som objektmetadata og miljøinnstillinger skal ha versjon/etag. Klient som forsøker å lagre basert på eldre versjon skal få konflikt og må hente/avklare nyere data.

Dette er særlig viktig for medeide objekter.

## Avtaleendring

Forslag og aksept skilles. Ny avtaleversjon blir autoritativ først når nødvendig samtykke er registrert og kollisjoner fortsatt er fraværende i samme transaksjon.

## Tidlig retur

Endelig returbekreftelse oppdaterer lånets sluttid og frigjør reservasjonens rest i samme transaksjon. Outbox varsler og søkeoppdateringer skjer etter commit.

## Gjenåpning etter bestridt retur

Ny problemhendelse kan endre nåtilstand til usikker, men skal ikke slette tidligere slutt-/returhendelse. Dersom senere lån allerede er gyldig godkjent skal de ikke rulles tilbake; systemet sperrer bare ytterligere kolliderende godkjenninger.

## Bakgrunnsjobber

Scheduler-jobber må være idempotente og tilstandssjekkende. En jobb som «marker passert returtid» skal bare gjøre overgang hvis lånet fortsatt er i relevant tilstand og aldri overskrive en nyere brukerhendelse.
