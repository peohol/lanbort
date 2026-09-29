# Lånbort – strukturert produktvisjon

> **Status:** Konsolidert visjonsgrunnlag, 29. september 2026. Den sekvensielle gjennomgangen av åpne produktspørsmål er fullført gjennom spørsmål 40, og den scenario-baserte stresstesten er gjennomført og innarbeidet gjennom scenario 17. Dokumentene er fortsatt **ikke** en implementeringsplan eller en låst spesifikasjon; konkrete terskler, feltvalg, tekniske mekanismer og juridiske detaljer fastsettes senere.

## Formålet med denne mappen

Denne mappen gjør den opprinnelige visjonsteksten lettere å lese, diskutere og forbedre. Innholdet er delt etter produktområde, slik at hvert tema kan videreutvikles uten at vi samtidig må ta stilling til teknisk arkitektur eller implementeringsrekkefølge.

Den opprinnelige `/VISION.md` beholdes som kildedokument. Denne mappen er det strukturerte førsteutkastet som vi arbeider videre med i dialog før visjonen anses som moden nok til å danne grunnlag for produktspesifikasjon og implementeringsplaner.

## Hvordan utsagn skal tolkes

Visjonen skiller mellom tre typer innhold:

- **Retning:** sentrale mål eller prinsipper som allerede fremstår tydelige.
- **Foreløpig mekanisme:** en konkret måte produktet kan fungere på, men som fortsatt kan forbedres eller erstattes.
- **Åpent spørsmål:** noe som må avklares før visjonen kan regnes som ferdig.

Denne inndelingen er bevisst. Den skal hindre at detaljer fra et tidlig idéutkast blir behandlet som irreversible beslutninger.

## Visjonens kjerne

Lånbort skal gjøre det enkelt og trygt for mennesker å låne ting av hverandre uten at utlån i utgangspunktet er en kommersiell transaksjon. Produktet skal bidra til:

- mindre behov for at alle eier sjelden brukte ting selv
- mindre overforbruk og bedre utnyttelse av eksisterende ressurser
- økonomisk gevinst for brukerne gjennom redusert behov for kjøp
- sterkere lokale og sosiale fellesskap
- en kultur der tillit, gjensidighet og ansvarlig deling blir lettere i praksis

Lånbort skal ikke bare være en katalog over ting. Produktet skal støtte hele den sosiale livssyklusen rundt utlån: å finne mennesker og miljøer, gjøre objekter tilgjengelige, be om lån, avtale, kommunisere, levere tilbake, håndtere uenighet og bygge tillit over tid.

## Dokumenter

1. [Formål, prinsipper og produktgrenser](01-formal-prinsipper-og-produktgrenser.md)
2. [Brukere, roller og relasjoner](02-brukere-roller-og-relasjoner.md)
3. [Miljøer](03-miljoer.md)
4. [Utlånsobjekter](04-utlansobjekter.md)
5. [Låneforløpet](05-laneforlop.md)
6. [Kommunikasjon, varsler og saker](06-kommunikasjon-varsler-og-saker.md)
7. [Tillit, anmeldelser og moderering](07-tillit-anmeldelser-og-moderering.md)
8. [Sikkerhet, personvern, jus og datalivssyklus](08-sikkerhet-personvern-jus-og-datalivssyklus.md)
9. [Åpne spørsmål](open-questions.md)
10. [Begreper](glossary.md)

## Avgrensning mot senere planlegging

Følgende hører ikke hjemme som bindende valg i produktvisjonen og er derfor ikke videreført som tekniske beslutninger her:

- konkret frontend-, backend- eller databasearkitektur
- konkrete skytjenester eller leverandører
- Google Maps som bestemt kartleverandør
- bestemte API-er som endelig datakilde
- struktur og vedlikehold av `CLAUDE.md`, `AGENTS.md` eller andre agentinstrukser
- implementeringsfaser, milepæler og arbeidsfordeling mellom kodeagenter

Behovene bak enkelte av disse punktene er beholdt. For eksempel står kartbasert oppdagelse av miljøer i visjonen, men valg av kartleverandør tas senere.

## Videre arbeid

Visjonsgrunnlaget er nå konsolidert uten registrerte åpne visjonsspørsmål. Scenario-stresstesten pågår videre sekvensielt; avklaringer gjennom scenario 17 er innarbeidet i de tematiske dokumentene. Det kan fortsatt revideres dersom nye produktmessige motsetninger eller behov oppdages, men detaljer som konkrete tidsfrister, feltskjemaer, tekniske mekanismer og juridiske terskler skal ikke trekkes inn i visjonsfasen bare for å gjøre dokumentene mer detaljerte.
