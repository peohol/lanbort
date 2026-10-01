# Planleggingsløp: fra produktvisjon til byggbar spesifikasjon

> **Status:** Arbeids-TODO for planleggingsfasen. Dette dokumentet beskriver **hvordan planarbeidet skal gjennomføres**, ikke selve produktspesifikasjonen, UX-løsningen eller systemarkitekturen.

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
- [ ] Fastsett dokumentstrukturen for produktspesifikasjon, UX-modell og systemarkitektur.
- [ ] Fastsett en enkel sporbarhetsmåte fra visjonsprinsipp → krav/UX-regel → arkitekturbeslutning, uten å gjøre dokumentasjonen tung.
- [ ] Opprett et sted for åpne detaljbeslutninger som tilhører spesifikasjon, UX eller arkitektur og derfor ikke er nye visjonsspørsmål.

### B. Produktspesifikasjon

- [ ] Etabler den formelle begreps- og domenemodellen som spesifikasjonen skal bruke.
- [ ] Oversett visjonen til eksplisitte produktkrav per produktområde.
- [ ] Beskriv sentrale tilstander, overganger og invariants for blant annet lån, objekter, relasjoner, miljøer, kontoer og saker.
- [ ] Skill tydelig mellom normalforløp, unntaksforløp og administrative forløp.
- [ ] Konkretiser utsatte detaljvalg som må bestemmes for at produktet skal kunne bygges, uten å låse unødvendige implementasjonsdetaljer.
- [ ] Definer ikke-funksjonelle produktkrav som følger av visjonen, inkludert sikkerhet, personvern, tilgjengelighet, robusthet og sporbarhet.
- [ ] Gjennomfør konsistenssjekk mot hele `docs/vision/`.

### C. UX-modell

- [ ] Definer informasjonsarkitektur og overordnet navigasjonsmodell.
- [ ] Definer hvilke konsepter og tilstander brukeren skal se, og hvilke som normalt skal ligge skjult i bakgrunnen.
- [ ] Modellér de viktigste ende-til-ende-reisene for ordinære brukere.
- [ ] Modellér relevante avvik, konflikter og avslutningsforløp uten å gjøre normal-UI tungt.
- [ ] Definer mønstre for samtykke, bekreftelser, reverserbare handlinger, feilhåndtering og konsekvenskommunikasjon.
- [ ] Definer hvordan kontekst, roller, personvern og historisk tilgang uttrykkes i UI.
- [ ] Definer mobil- og tilgjengelighetskrav på modellnivå før konkret visuell design.
- [ ] Test UX-modellen mot representative scenarioer fra visjonens stresstest.

### D. Systemarkitektur

- [ ] Utled arkitekturkrav fra produktspesifikasjonen og UX-modellen før valg av konkrete teknologier.
- [ ] Definer systemgrenser, hovedkomponenter og ansvar mellom dem.
- [ ] Definer datamodell og eierskap til sannhet for sentrale domeneobjekter.
- [ ] Definer autorisasjons- og tilgangsmodellen, inkludert kontekstbundne roller og minste nødvendige tilgang.
- [ ] Definer transaksjons-, samtidighets- og konsistensregler for handlinger som kan konkurrere eller komme i feil rekkefølge.
- [ ] Definer hendelses-, historikk- og revisjonsmodell.
- [ ] Definer arkitektur for chat, varsler og saker med nødvendige personvern- og sikkerhetsgrenser.
- [ ] Definer sikkerhetsarkitektur og threat model, inkludert identitet, sesjoner, hemmeligheter, kryptering, misbruksvern og administrative inngrep.
- [ ] Definer datalivssyklus, sletting, oppbevaring, backup og gjenoppretting.
- [ ] Definer nødvendige eksterne integrasjoner og hvilke deler av systemet som skal være leverandøruavhengige.
- [ ] Dokumenter viktige teknologivalg som egne arkitekturbeslutninger når beslutningsgrunnlaget er modent.

### E. Samlet validering og overgang til implementering

- [ ] Kryssjekk produktspesifikasjon, UX-modell og systemarkitektur for motsetninger og skjulte antakelser.
- [ ] Kjør et nytt utvalg av krevende scenarioer gjennom alle tre lag samtidig.
- [ ] Registrer eventuelle reelle visjonskonflikter i visjonslaget og løs dem der.
- [ ] Marker hvilke detaljspørsmål som kan utsettes til implementering uten å true helheten.
- [ ] Først deretter: bryt arbeidet ned i implementeringsfaser, milepæler og kodeagent-arbeidspakker.

## Neste punkt

Neste arbeidsøkt skal **ikke** begynne på produktspesifikasjonen. Den skal brukes til å diskutere og vedta de sentrale UX-prinsippene som skal styre senere produkt- og arkitekturvalg.
