# Åpne spørsmål

> **Status:** Arbeidsliste for videre visjonsdialog. Dette er ikke en backlog eller implementeringsplan.

Målet med listen er å gjøre usikkerhet synlig. Spørsmål flyttes ut herfra når de er tilstrekkelig avklart i de tematiske visjonsdokumentene.

## A – Fundamentale spørsmål

Disse påvirker store deler av resten av produktmodellen og bør avklares tidlig.

## B – Miljøer og medlemskap

## C – Objekter og låneforløp

## D – Kommunikasjon og varsler

## E – Anmeldelser og tillit

### 29. Hvilke brukerskårer bør faktisk finnes?

Foreløpige ideer er:

- gavmildhet
- pålitelighet
- bidrag gjennom å låne fremfor å kjøpe

Vi bør først definere hvilket brukerproblem hver skår løser.

### 30. Bør pålitelighet styre hvem som får se hvem?

Dette er en kraftig mekanisme.

Vi må særlig avklare:

- hvordan nye brukere behandles
- om skår bør brukes som hard grense eller bare informasjon
- om filtrering kan skape selvforsterkende eksklusjon
- hvordan aktive relasjoner og lån påvirkes

## F – Data, personvern og jus

### 31. Hvilke hendelser må logges, og hvor lenge?

Dette må avgjøres etter formål, ikke med én universell lagringstid.

Vi bør senere lage en datalivssyklus for blant annet:

- sikkerhetslogger
- rolleendringer
- lån
- returhendelser
- chat
- saker
- rapporter
- anmeldelser
- objektversjoner

### 32. Når kan en inaktiv konto faktisk slettes?

Et år uten innlogging er et mulig signal, men sletting kan være blokkert av:

- aktive lån
- åpne saker
- medeierskap
- miljøansvar
- historikk andre brukere trenger
- juridiske krav

### 33. Hvor presis geografisk informasjon skal lagres og vises?

Miljøer kan ha geografisk tilknytning, men vi må skille mellom:

- grov geografisk oppdagelse
- kartområde for et miljø
- eventuell privat adresse
- informasjon som bare gis i forbindelse med et konkret lån

### 34. Hvilket ansvar kan og bør Lånbort ta?

Målet er at brukerne har ansvar for egne utlån, men bruksvilkår alene avgjør ikke plattformens juridiske ansvar.

Før lansering må vi identifisere de viktigste rettslige områdene og få kvalifisert vurdering der det er nødvendig.

## G – Prosjektpremisser som ikke er produktvisjon

Kildedokumentet inneholder også viktige føringer for hvordan repo-eier og KI-agenter skal samarbeide, og hvordan agentinstruksjonsfiler bør vedlikeholdes.

Dette skal bevares, men hører ikke hjemme i produktvisjonen. Det bør senere flyttes til egne prosjekt-/agentdokumenter før implementeringsarbeidet begynner.

## Foreslått rekkefølge for videre dialog

For å unngå at vi finpusser detaljer som senere må skrives om, bør vi først avklare de gjenværende fundamentale spørsmålene, deretter rolle- og miljømodellen, deretter selve låneforløpet og til slutt tillit, varsler og datalivssyklus.
