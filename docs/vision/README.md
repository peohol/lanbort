# Lånbort – produktvisjon v1.0

> **Status:** Produktvisjon v1.0, ferdigstilt 1. oktober 2026. Den sekvensielle gjennomgangen av produktspørsmål 1–40 og scenario-stresstesten 2–81 er fullført og innarbeidet. Dokumentene beskriver den kanoniske produktretningen, men er **ikke** en implementeringsplan eller en låst detaljspesifikasjon; konkrete terskler, feltvalg, tekniske mekanismer og juridiske detaljer fastsettes senere.

## Autoritet og formål

Denne mappen er den **kanoniske produktvisjonen for Lånbort**. Ved motstrid med det opprinnelige [`/VISION.md`](../../VISION.md) eller eldre planer gjelder dokumentene her.

Visjonen er delt etter produktområde slik at produktprinsipper kan videreutvikles uten å blande inn teknisk arkitektur eller implementeringsrekkefølge. `/VISION.md` beholdes som historisk kildemateriale.

## Hvordan utsagn skal tolkes

Visjonen skiller mellom tre typer innhold:

- **Retning:** sentrale mål eller prinsipper som inngår i produktvisjonen.
- **Foreløpig mekanisme:** en konkret måte produktet kan fungere på, men som fortsatt kan forbedres eller erstattes uten å endre den grunnleggende produktmodellen.
- **Senere detaljvalg:** terskler, felt, ordlyd, tekniske mekanismer og andre valg som skal tas i spesifikasjon, design, arkitektur eller juridisk arbeid.

Et nytt **åpent visjonsspørsmål** skal bare opprettes dersom senere arbeid avdekker en reell motsetning eller et produktvalg som påvirker Lånborts grunnleggende modell.

## Visjonens kjerne

Lånbort skal gjøre det enkelt og trygt for mennesker å låne ting av hverandre uten at utlån i utgangspunktet er en kommersiell transaksjon. Produktet skal bidra til:

- mindre behov for at alle eier sjelden brukte ting selv
- mindre overforbruk og bedre utnyttelse av eksisterende ressurser
- økonomisk gevinst for brukerne gjennom redusert behov for kjøp
- sterkere lokale og sosiale fellesskap
- en kultur der tillit, gjensidighet og ansvarlig deling blir lettere i praksis

Lånbort skal ikke bare være en katalog over ting. Produktet skal støtte hele den sosiale livssyklusen rundt utlån: å finne mennesker og miljøer, gjøre objekter tilgjengelige, be om lån, avtale, kommunisere, levere tilbake, håndtere uenighet og bygge tillit over tid.

## Enkelhet i normalforløpet

Robusthet i sjeldne grensesituasjoner skal ikke gjøre den vanlige brukeropplevelsen komplisert.

For en ordinær bruker skal hovedforløpet kunne oppleves omtrent slik:

1. finn eller publiser et objekt
2. send eller motta en låneforespørsel
3. avklar og godkjenn
4. overlever objektet
5. lever tilbake og bekreft retur
6. gi eventuell anmeldelse

Regler for blokkering, kontosletting, medeierkonflikter, inhabilitet, dødsfall, uavklarte returer og andre unntak skal i størst mulig grad tre frem **bare når de faktisk er relevante**. Visjonen krever robuste regler under panseret, ikke et tungt normal-UI.

## Dokumenter

1. [Styrende produktprinsipper](00-styrende-produktprinsipper.md)
2. [Formål, prinsipper og produktgrenser](01-formal-prinsipper-og-produktgrenser.md)
3. [Brukere, roller og relasjoner](02-brukere-roller-og-relasjoner.md)
4. [Miljøer](03-miljoer.md)
5. [Utlånsobjekter](04-utlansobjekter.md)
6. [Låneforløpet](05-laneforlop.md)
7. [Kommunikasjon, varsler og saker](06-kommunikasjon-varsler-og-saker.md)
8. [Tillit, anmeldelser og moderering](07-tillit-anmeldelser-og-moderering.md)
9. [Sikkerhet, personvern, jus og datalivssyklus](08-sikkerhet-personvern-jus-og-datalivssyklus.md)
10. [Scenario-basert stresstest](scenario-stresstest.md)
11. [Åpne spørsmål](open-questions.md)
12. [Begreper](glossary.md)

## Avgrensning mot senere planlegging

Følgende hører ikke hjemme som bindende valg i produktvisjonen:

- konkret frontend-, backend- eller databasearkitektur
- konkrete skytjenester eller leverandører
- bestemte API-er eller kartleverandører
- struktur og vedlikehold av `CLAUDE.md`, `AGENTS.md` eller andre agentinstrukser
- implementeringsfaser, milepæler og arbeidsfordeling mellom kodeagenter
- eksakte tidsfrister, terskler og oppbevaringstider
- detaljert ordlyd, feltskjemaer og visuell utforming
- teknisk krypterings-, samtidighets- og autorisasjonsarkitektur
- juridiske konklusjoner som krever kvalifisert vurdering av gjeldende rett

Behovene bak slike valg kan være beskrevet i visjonen, men den konkrete løsningen tas senere.

## Status og videre arbeid

Produktvisjon v1.0 anses som **ferdigstilt**. Scenario-stresstesten er fullført gjennom scenario 81, og det er ingen registrerte åpne visjonsspørsmål.

Visjonen er ikke uforanderlig. Reell bruk, juridisk arbeid, sikkerhetsarbeid, produktspesifikasjon eller arkitektur kan senere avdekke en prinsipiell motsetning som krever revisjon. Slike spørsmål skal da registreres i [`open-questions.md`](open-questions.md) og løses eksplisitt.

Neste normale arbeidslag er produktspesifikasjon, UX og systemarkitektur. Disse skal konkretisere visjonen uten å behandle foreløpige detaljer som om de var ufravikelige produktprinsipper.
