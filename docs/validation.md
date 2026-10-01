# Tverrgående validering før implementering

> **Status:** Gjennomført 1. oktober 2026. Produktspesifikasjon v0.1, UX-modell v0.1 og systemarkitektur v0.1 er vurdert samlet.

## Resultat

Det er ikke funnet noen motsetning som krever revisjon av produktvisjon v1.0.

De tre lagene er konsistente på de viktigste grensene:
- én global objektsannhet, men kontekstuelle publiseringer og sosial metadata
- ett felles lånesystem med stabil opprinnelseskontekst
- kontinuitet for etablerte forpliktelser uten å gjenåpne generell sosial tilgang
- nøytrale uavklart-tilstander fremfor automatisk skyld
- backend-håndhevet autorisasjon og transaksjonell konsistens
- privat E2EE-chat adskilt fra strukturerte avtalehendelser og serverlesbare saker
- historikk som korrigeres med nye hendelser fremfor stille omskriving
- personvern som en datagrense, ikke bare et UI-valg

## Skjulte antakelser som ble kontrollert

### Global navigasjon vs. kommunikasjonsmodell
Produktkravet om at varsler, privat chat og saker ikke er én universell innboks er forenlig med UX-valget «Samtaler»: dette området inneholder privat chat og lånelogistikk, mens varsler har eget oppmerksomhetslag og saker ligger i sin produkt-/administrasjonskontekst.

### Søk vs. skjulte miljøer
UX forventer målrettet søk, mens arkitekturen behandler søk som en avledet indeks. Skjulte miljøer skal ikke inn i uvedkommende søkegrunnlag, og autoritativ adgang kontrolleres alltid ved oppslag/handling.

### Medeierskap vs. personvern
Objektet er globalt, men medeierrollen gir ikke automatisk adgang til låntakeridentitet eller skjult opprinnelseskontekst. Arkitekturens policykontroll må derfor kombinere objektrettighet med kontekstrettighet.

### Historikk vs. sletting
Append-only hendelser betyr ikke at alle personopplysninger lagres permanent. Hendelser skal inneholde minst mulig identitet; sletting/pseudonymisering kan redusere persondata uten å omskrive nødvendig faktahistorikk.

### E2EE i nettleser
E2EE hindrer ordinær server-/administratorlesing av lagret privat meldingsinnhold, men beskytter ikke mot kompromittert kode som faktisk kjører i endepunktet. Webklientintegritet er derfor del av trusselmodellen, og den konkrete nøkkel-/klientmodellen er fortsatt OD-0005.

## Scenarioer gjennom alle tre lag

| Scenario | Produktregel | UX | Arkitektur | Resultat |
|---|---|---|---|---|
| 8 – medeiere blokkerer hverandre | objekt fryses for nye lån | eier ser konkret sperre; andre nøytral utilgjengelighet | auth/policy + global objektsperre | Konsistent |
| 15 – farlig/ulovlig objekt | lokal/global sikkerhetsmoderering kan stanse fasilitering | tydelig plattformbegrensning uten skylddom | modereringstiltak + audit + publiserings-/lånesperre | Konsistent |
| 26 – forlengelse kolliderer med neste lån | eksisterende avtale kan ikke fortrenges | forlengelse tilbys ikke som overstyring | atomisk kollisjonskontroll i DB | Konsistent |
| 35 – miljø uten administrator | behandling settes på vent | viser manglende behandlingsevne | sak krever autorisert aktiv rolle | Konsistent |
| 49 – privat melding brukes som dokumentasjon | bare uttrykkelig innsendt kopi blir saksdata | bruker velger konkret innhold | lokal dekryptering → ny serverlesbar saksdata | Konsistent |
| 58 – retur bestrides etter nytt lån | nytt gyldig lån består, ytterligere lån sperres | gammel sak gjenåpnes; ny part varsles | append-only hendelse + ny global sperre, ingen rollback | Konsistent |
| 62/75 – død eller varig utilgjengelighet | verifikasjon + snever representant | egen representantflate, ikke konto-overtakelse | ressursbundet representative grant + audit | Konsistent |
| 65 – miljø blir mindre privat | samtykke/avstemning + passiv status | konsekvens og personlig valg vises | medlems-/typeendringsprosess, historisk tilgang bevares | Konsistent |
| 73 – plattformforvalter inhabil | kan ikke behandle egen sak | behandlingshandling utilgjengelig | policy avviser inhabil aktør + audit | Konsistent |
| 81 – blokkering under lån | fysisk forpliktelse kan avsluttes | ordinær chat stenges, smal logistikk består | egen samtaletype bundet til kvalifisert lån | Konsistent |

## Detaljer som kan utsettes

### Kan avgjøres ved implementeringsstart
- OD-0004: konkrete eksterne varslingskanaler og standarder
- OD-0006: pilotens kategoritaksonomi
- OD-0009: konkret rammeverk og leverandører

### Må avgjøres før den berørte funksjonen anses ferdig
- OD-0005: konkret E2EE-nøkkel-, multi-device- og recoverymodell
- OD-0003: verifikasjonskrav for død/varig utilgjengelighet dersom denne særprosessen skal aktiveres

### Må avgjøres før reell/bred drift i relevant omfang
- OD-0001: policy for regulerte/risikofylte objekter
- OD-0002: konkrete retention-regler
- OD-0007: juridisk lanseringsgjennomgang
- OD-0008: uavhengig behandlingsvei når plattformforvaltere er inhabile

Disse spørsmålene krever ikke at domenemodellen eller hovedarkitekturen holdes åpen.

## Implementeringsklarhet

Planen er klar for nedbrytning i implementeringsfaser. Det som ikke er modent nok til å bygge ennå er eksplisitt isolert i `open-decisions.md`; kodeagenter skal ikke fylle slike valg på egen hånd.
