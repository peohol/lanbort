# Planleggingsløp: fra produktvisjon til byggbar spesifikasjon

> **Status:** Planleggingsløpet er fullført 1. oktober 2026. Alle planlagte fundament-, spesifikasjons-, UX-, arkitektur- og valideringssteg er gjennomført; arbeidet er brutt ned i implementeringsfaser og kodeagent-pakker.

## Arbeidsregel

- Den kanoniske produktvisjonen i `docs/vision/` er utgangspunktet.
- Hver økt skal ha et avgrenset tema og et tydelig dokumentasjonsresultat.
- Beslutninger skal føres inn i repoet fortløpende slik at planarbeidet ikke avhenger av samtalehistorikk.
- Krav, UX-valg og tekniske løsninger skal holdes adskilt når de representerer ulike beslutningsnivåer.
- Hvis senere arbeid avdekker en reell motsetning i selve produktmodellen, løftes den tilbake til `docs/vision/open-questions.md` i stedet for å skjules i spesifikasjonen.
- Implementeringsrekkefølge og kodearbeid fastsettes først når produktspesifikasjon, UX-modell og arkitektur er konsistente nok til å danne et stabilt grunnlag.

## TODO

### A. Fundament for videre planlegging

- [x] Opprett et eget arbeidsområde for planleggingsfasen.
- [x] **Avklar og vedta sentrale UX-prinsipper sammen før detaljert planskriving begynner.**
- [x] Fastsett dokumentstrukturen for produktspesifikasjon, UX-modell og systemarkitektur.
- [x] Fastsett en enkel sporbarhetsmåte fra visjonsprinsipp → krav/UX-regel → arkitekturbeslutning, uten å gjøre dokumentasjonen tung.
- [x] Opprett et sted for åpne detaljbeslutninger som tilhører spesifikasjon, UX eller arkitektur og derfor ikke er nye visjonsspørsmål.

### B. Produktspesifikasjon

- [x] Etabler den formelle begreps- og domenemodellen som spesifikasjonen skal bruke.
- [x] Oversett visjonen til eksplisitte produktkrav per produktområde.
- [x] Beskriv sentrale tilstander, overganger og invariants for blant annet lån, objekter, relasjoner, miljøer, kontoer og saker.
- [x] Skill tydelig mellom normalforløp, unntaksforløp og administrative forløp.
- [x] Konkretiser utsatte detaljvalg som må bestemmes for at produktet skal kunne bygges, uten å låse unødvendige implementasjonsdetaljer.
- [x] Definer ikke-funksjonelle produktkrav som følger av visjonen, inkludert sikkerhet, personvern, tilgjengelighet, robusthet og sporbarhet.
- [x] Gjennomfør konsistenssjekk mot hele `docs/vision/`.

### C. UX-modell

- [x] Definer informasjonsarkitektur og overordnet navigasjonsmodell.
- [x] Definer hvilke konsepter og tilstander brukeren skal se, og hvilke som normalt skal ligge skjult i bakgrunnen.
- [x] Modellér de viktigste ende-til-ende-reisene for ordinære brukere.
- [x] Modellér relevante avvik, konflikter og avslutningsforløp uten å gjøre normal-UI tungt.
- [x] Definer mønstre for samtykke, bekreftelser, reverserbare handlinger, feilhåndtering og konsekvenskommunikasjon.
- [x] Definer hvordan kontekst, roller, personvern og historisk tilgang uttrykkes i UI.
- [x] Definer mobil- og tilgjengelighetskrav på modellnivå før konkret visuell design.
- [x] Test UX-modellen mot representative scenarioer fra visjonens stresstest.

### D. Systemarkitektur

- [x] Utled arkitekturkrav fra produktspesifikasjonen og UX-modellen før valg av konkrete teknologier.
- [x] Definer systemgrenser, hovedkomponenter og ansvar mellom dem.
- [x] Definer datamodell og eierskap til sannhet for sentrale domeneobjekter.
- [x] Definer autorisasjons- og tilgangsmodellen, inkludert kontekstbundne roller og minste nødvendige tilgang.
- [x] Definer transaksjons-, samtidighets- og konsistensregler for handlinger som kan konkurrere eller komme i feil rekkefølge.
- [x] Definer hendelses-, historikk- og revisjonsmodell.
- [x] Definer arkitektur for chat, varsler og saker med nødvendige personvern- og sikkerhetsgrenser.
- [x] Definer sikkerhetsarkitektur og threat model, inkludert identitet, sesjoner, hemmeligheter, kryptering, misbruksvern og administrative inngrep.
- [x] Definer datalivssyklus, sletting, oppbevaring, backup og gjenoppretting.
- [x] Definer nødvendige eksterne integrasjoner og hvilke deler av systemet som skal være leverandøruavhengige.
- [x] Dokumenter viktige teknologivalg som egne arkitekturbeslutninger når beslutningsgrunnlaget er modent.

### E. Samlet validering og overgang til implementering

- [x] Kryssjekk produktspesifikasjon, UX-modell og systemarkitektur for motsetninger og skjulte antakelser.
- [x] Kjør et nytt utvalg av krevende scenarioer gjennom alle tre lag samtidig.
- [x] Registrer eventuelle reelle visjonskonflikter i visjonslaget og løs dem der. *(Ingen nye visjonskonflikter ble funnet.)*
- [x] Marker hvilke detaljspørsmål som kan utsettes til implementering uten å true helheten.
- [x] Først deretter: bryt arbeidet ned i implementeringsfaser, milepæler og kodeagent-arbeidspakker.

## Neste punkt

Planleggingsfasen er fullført. Neste separate fase er **implementering**, med [Fase 0](../implementation/README.md) som start: konkret stackvalg (OD-0009), prosjektskjelett og kvalitetsgrunnlag før domenefunksjonalitet bygges.

## Videre plan for UI

Når implementeringsgrunnlaget er klart for konkret grensesnittarbeid, følges [planen for UI-designfasen](ui-design-plan.md). Den beskriver arbeidsdelingen mellom kanonisk dokumentasjon, Claude Design og Claude Code, og løpet fra skjerm-/flytinventar til visuell retning, kjerneflyt og designsystem. Vertikal implementering og validering starter med første stabile designbolk i fase 4 og løper parallelt med fase 4–7.
