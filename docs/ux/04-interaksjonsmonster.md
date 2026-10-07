# Interaksjonsmønstre

> **Status:** UX-modell v0.1.

### UX-INT-001 — Primær handling følger neste gyldige steg
**Forankring:** UX-P04, UX-P05, UX-P14; PS-LOAN-010, PS-LOAN-012

På objekt-, lån-, miljø- og saksflater skal én tydelig primærhandling representere det mest relevante neste steget når ett slikt steg finnes. Sekundære og sjeldne handlinger plasseres underordnet.

Kravet om én primærhandling gjelder bare når ett relevant neste steg finnes. Når det ventes på den andre parten, vises ingen primærhandling, og overskriften sier hvem det ventes på (UX-INT-004). I nøytrale avklaringer, der systemet ikke vet hva som skjedde, kan likeverdige faktaalternativer presenteres symmetrisk. Bare faktiske utsagn om hva som skjedde er slike alternativer, for eksempel «Ola fikk drillen» og «Overleveringen skjedde ikke». Ingen av dem fremheves som det forventede svaret (UX-EXC-002). En ny overleveringsdag er ikke et faktaalternativ, men en avtaleendring (PS-LOAN-010). Den presenteres separat som et forslag motparten må godta.

### UX-INT-002 — Reverserbar handling foretrekker angre fremfor modal
**Forankring:** UX-P09

Når handlingen trygt kan reverseres uten å påvirke andre, utføres den direkte med kort synlig angremulighet. Modal bekreftelse brukes når konsekvensen er vesentlig, påvirker andre eller ikke enkelt kan reverseres.

### UX-INT-003 — Samtykke skal navngi konsekvensen
**Forankring:** UX-P03, UX-P07

Bekreftelsesknapp og tekst skal beskrive hva som faktisk skjer, f.eks. «Godkjenn lån 10.–12. oktober» fremfor generisk «OK».

### UX-INT-004 — Ventestatus skal navngi hvem/hva det ventes på
**Forankring:** UX-P04, UX-P14

Foretrekk «Venter på at Kari bekrefter retur» fremfor interne eller generiske statusetiketter.

### UX-INT-005 — Systemet skal vise bekreftet resultat etter viktig handling
**Forankring:** UX-P21

Etter innsending/godkjenning/retur skal UI vise den nye autoritative tilstanden, ikke bare en midlertidig «lagret»-toast.

### UX-INT-006 — Ukjent nettverksutfall skal vises som ukjent
**Forankring:** UX-P22; PS-NFR-012

Hvis klienten ikke kan vite om en viktig handling nådde serveren, skal UI først avklare autoritativ status før brukeren tilbys å gjenta handlingen.

### UX-INT-007 — Destruktive og personvernutvidende handlinger har konsekvensvisning
**Forankring:** UX-P03, UX-P11

Kontosletting, objektsletting, overgang til mindre privat miljøtype og tilsvarende handlinger skal vise hva som forsvinner, hva som består og hvem som påvirkes før endelig bekreftelse.

### UX-INT-008 — Historikk vises som tidslinje ved behov
**Forankring:** UX-P16; VP-15

Tidslinjen skal prioritere menneskelesbare hendelser med aktør og tidspunkt. Tekniske loggdetaljer skal ikke eksponeres med mindre de er nødvendige for administrativt arbeid.

### UX-INT-009 — Skjulte valg må være gjenfinnbare
**Forankring:** UX-P06

Progressiv avdekking skal redusere visuell støy, men viktige sekundærhandlinger skal ligge på forutsigbare steder, typisk en lokal «Mer»-meny eller detaljseksjon.

### UX-INT-010 — Varsel leder til handling eller forståelse
**Forankring:** UX-P08

Et varsel skal kunne åpne den konkrete hendelsen/lånet/saken og forklare hvorfor brukeren ble varslet. Varsler skal ikke bare drive brukeren til en generell startside.

## Standard mønster for statuskort

Et statuskort bør normalt inneholde:
1. kort menneskelig status
2. relevant dato/tid
3. hvem som eventuelt må handle
4. primær neste handling
5. diskret tilgang til historikk/mer informasjon

Ikke alle fem elementene skal vises dersom de ikke er relevante.
