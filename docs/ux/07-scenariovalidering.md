# Scenariovalidering av UX-modellen

> **Status:** Representative scenariofamilier fra visjonens stresstest er kjørt gjennom UX-modellen.

## Formål

Målet er å kontrollere at robuste unntak kan håndteres uten å legge permanent kompleksitet inn i normalgrensesnittet.

| Scenario | Forventet UX | Resultat |
|---|---|---|
| 6 – vilkår endres mens forespørsel venter | Samme lånedetalj viser at forespørselen er satt på vent, hva som endret seg og én handling for å bekrefte nye vilkår | Dekket |
| 8 – medeiere blokkerer hverandre | Mine ting viser objektet som sperret for nye utlån og hvorfor eieren må avklare medeierskap; andre ser bare nøytral utilgjengelighet | Dekket |
| 15 – farlig/ulovlig objekt | Objekt-/lånekontekst viser at plattformen har stanset videre fasilitering uten å gi vanlig bruker en juridisk «dom» | Dekket |
| 22 – anmeldelse fra skjult miljø | Den anmeldte kan se anmeldelsen i riktig kontekst; utenforstående får ikke fritekst, forfatter eller miljølekkasje | Dekket |
| 26 – forlengelse kolliderer med neste lån | Forlengelse kan ikke godkjennes; UI forklarer at perioden allerede er avtalt og tilbyr ikke å «overstyre» neste lån | Dekket |
| 35 – miljø uten administratorer | Ventende prosess viser at behandling midlertidig ikke er tilgjengelig; ingen falsk plattformeskalering | Dekket |
| 43/44 – profiltilgang endres eller ny relasjon oppstår | Fritekstanmeldelser følger nåværende/historisk legitim kontekst; nye relasjoner åpner ikke automatisk gammel privat kontekst | Dekket |
| 49 – privat chat som dokumentasjon | Brukeren velger eksplisitt hva som sendes inn; saken viser den innsendte kopien uten å åpne resten av chatten | Dekket |
| 58 – tidligere retur bestrides etter nytt lån | Første lånedetalj gjenåpnes som uavklart; neste gyldige lån består og varsles; ytterligere lån sperres | Dekket |
| 62 – eneutlåner dør/utilgjengelig | Melder ser kun verifikasjonssak; eventuell representant får egen snever låneflate, ikke konto-overtakelse | Dekket |
| 65 – miljø blir mindre privat | Endringsflyt viser konsekvenser og personlig valg; passive medlemmer eksponeres ikke | Dekket |
| 73 – plattformforvalter er inhabil | Behandle-handlinger skjules/blokkeres; saken viser behov for annen habil behandlingsvei | Dekket |
| 81 – blokkering under aktivt lån | Vanlig chat stenges; samme låneflate beholder strukturerte handlinger og eventuell smal logistikk-kanal | Dekket |

## Konklusjon

Ingen av de validerte scenarioene krever et nytt permanent hovedområde eller en særskilt parallell brukerreise. Modellen med kontekstuelle unntak holder.

## Gjenstående UX-usikkerhet

Den viktigste gjenværende usikkerheten er ikke domenemodellen, men hvor mye informasjon som faktisk bør vises i enkelte sjeldne historikk- og administrasjonsflater. Dette kan prøves i prototype/pilot uten å endre informasjonsarkitekturen.
