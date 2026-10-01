# Avvik, konflikter og unntaksforløp

> **Status:** UX-modell v0.1.

### UX-EXC-001 — Avvik skal overta samme kontekst
**Forankring:** UX-P23

Når et normalt lån går over i avvik, skal brukeren fortsatt være på samme lånedetalj. Status, forklaring og neste mulige handling endres; brukeren skal ikke måtte forstå intern statemaskin eller finne en separat «problemseksjon».

### UX-EXC-002 — Nøytrale tilstander skal brukes før skyld kan fastslås
**Forankring:** UX-P14; PS-LOAN-012, PS-LOAN-014, PS-LOAN-018

«Avventer overleveringsavklaring», «Avventer returavklaring» og «Uavklart» skal beskrives nøytralt. «Forsinket» brukes bare når systemet faktisk har grunnlag for at objektet fortsatt er hos låntaker.

### UX-EXC-003 — Motstridende forklaringer skal ikke tvinges til falsk enighet
**Forankring:** VP-12; PS-COM-012

Når partene oppgir ulike faktiske hendelser, viser systemet at situasjonen er uavklart og tilbyr relevant saks-/meklingsvei der den finnes. UI skal ikke late som én versjon er sann fordi den ble sendt først.

### UX-EXC-004 — Blokkering under lån skal gjøre restkontakten smal
**Forankring:** UX-P11, UX-P17; PS-COM-007

Vanlig chat forsvinner fra lånekonteksten. Strukturerte handlinger og eventuell logistikk-kanal blir tydelig merket som kun for praktisk avslutning.

### UX-EXC-005 — Bortfall av miljø/vennskap skal forklares uten å gjenåpne tilgang
**Forankring:** PS-DOM-002, PS-LOAN-002

På eksisterende lån kan brukeren fortsatt se nødvendig låneinformasjon. UI skal forklare at lånet består selv om den tidligere sosiale/adgangsgivende relasjonen ikke lenger finnes, uten lenker som gjenåpner profil eller miljø.

### UX-EXC-006 — Konflikt mellom medeiere skal vises som sperre på nye forpliktelser
**Forankring:** PS-OBJ-008, PS-OBJ-009

Eierne skal kunne forstå at objektet ikke kan gjøres mer tilgjengelig før en konkret begrensning eller medeierkonflikt er løst. Andre brukere får en nøytral utilgjengelighet, ikke konfliktinformasjon.

### UX-EXC-007 — Administrativ stans skal skilles fra brukerens mislighold
**Forankring:** PS-ADM-003, PS-LOAN-011

Motparten får vite at et lån ikke kan gjennomføres på grunn av en plattformbegrensning, men UI skal ikke presentere dette som ordinær kansellering/no-show eller røpe mer om modereringsgrunnen enn nødvendig.

### UX-EXC-008 — Død/utilgjengelighet håndteres uten konto-overtakelse
**Forankring:** PS-ADM-007, PS-ADM-008

En melder får bare bekreftelse på at saken behandles. En verifisert representant får en egen, snever flate for de konkrete forpliktelsene vedkommende skal avslutte; ikke den opprinnelige brukerens konto.

### UX-EXC-009 — Manglende administrator skal vises som manglende behandlingsevne
**Forankring:** PS-ENV-014

Ventende administrativ prosess skal tydelig vise at ingen autorisert saksbehandler er tilgjengelig nå. Produktet skal ikke tilby en falsk «eskaler til plattformen»-knapp hvis denne retten ikke finnes.

### UX-EXC-010 — Feil etter endelig bekreftelse rapporteres som ny hendelse
**Forankring:** UX-P09; PS-LOAN-017

Etter at angrebufferen er utløpt tilbys «Rapporter problem» fremfor å endre eller slette den historiske bekreftelsen.
