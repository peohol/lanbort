# Kvalitetsporter

> **Status:** Obligatoriske porter før de angitte milepælene.

## Port A — Før domeneutvidelse etter fase 1

Må være oppfylt:
- migrasjoner kan kjøres fra tom database
- autorisasjon har både positive og negative automatiserte tester
- alle sensitive API-er går gjennom samme policygrense
- secrets/dependencies skannes i CI
- audit/outbox-baseline fungerer
- retry av samme idempotente testkommando gir ikke duplikat

## Port B — Før lånekjernen regnes som ferdig

Må være oppfylt:
- parallelle godkjenninger kan ikke dobbeltbooke samme objekt
- tilgang som forsvinner før godkjenning stopper lånet
- tilgang som forsvinner etter godkjenning fjerner ikke nødvendig lånetilgang
- avtalesnapshot påvirkes ikke av senere objektredigering
- tidlig retur frigjør kun faktisk fri periode
- gjenåpnet returhistorikk sletter ingen gammel hendelse
- alle overgangene i PS-LOAN er dekket av domenetester

## Port C — Før privat chat aktiveres

Må være oppfylt:
- OD-0005 er avgjort og dokumentert
- uavhengig kryptografisk designreview av protokollbruken
- server/database kan ikke lese privat meldingsklartekst under normal drift
- nøkkel-/enhetstap har definert UX
- XSS/CSP/supply-chain-tiltak er testet
- ingen administratorfunksjon har skjult «dekrypter alt»-vei

## Port D — Før lukket pilot med reelle brukere

Må være oppfylt:
- alle fase 1–3-kritiske flyter er ende-til-ende-testet
- autorisasjons-/personverntest WP-70 er grønn
- samtidighets-/idempotensstresstest WP-71 er grønn
- backup/restore WP-72 er gjennomført, også én gjenoppretting mot et hostet miljø
- backupnivået for piloten er besluttet av produkteier (ADR-0009); før dette er betalt backup ingen forutsetning for noen port
- rate limiting og misbruksvern er aktivert
- produksjonshemmeligheter er skilt fra utvikling
- OD-0002 har minst en eksplisitt pilot-retentionpolicy
- OD-0006 er avgjort
- OD-0010 er avgjort og mekanismen implementert før privilegerte plattformforvalterhandlinger aktiveres; til da er de avvist
- en konservativ pilotpolicy begrenser risikofylte objekter
- kjente mangler er dokumentert og vurdert

## Port E — Før bred/offentlig lansering

I tillegg til pilotport:
- OD-0001 er ferdig juridisk/sikkerhetsmessig
- OD-0002 har endelige retentionregler
- OD-0007 juridisk lanseringsgjennomgang er fullført
- OD-0008 er løst dersom organisasjonen har behovet
- uavhengig sikkerhetsgjennomgang/penetrasjonstest
- særskilt E2EE-review dersom chat er aktiv
- tilgjengelighetsgjennomgang mot gjeldende krav
- driftsberedskap, restore og hendelseshåndtering er dokumentert
