# Åpne spørsmål

> **Status:** Arbeidsliste for videre visjonsdialog. Dette er ikke en backlog eller implementeringsplan.

Målet med listen er å gjøre usikkerhet synlig. Spørsmål flyttes ut herfra når de er tilstrekkelig avklart i de tematiske visjonsdokumentene.

## A – Fundamentale spørsmål

Disse påvirker store deler av resten av produktmodellen og bør avklares tidlig.

## B – Miljøer og medlemskap

### 12. Hvordan velges ny eier når flere administratorer vil overta?

Eierløshet er nå definert som en midlertidig unntakstilstand. Hvis flere gjenværende administratorer samtidig ønsker å overta eierskapet, trenger vi senere en enkel og forutsigbar regel for hvem som får rollen.

Dette er en avgrenset styringsdetalj og trenger ikke avgjøres før den øvrige miljømodellen er ferdig.

## C – Objekter og låneforløp

### 16. Hvordan fungerer tilbakekalling av en retur-bekreftelse?

30-sekunders angrebuffer er tydelig.

Det som skjer etter at bekreftelsen allerede har trådt i kraft, er mindre tydelig.

Vi må særlig avklare:

- tidsgrense for tilbakekalling
- virkning hvis et nytt lån allerede er avtalt
- forskjell på at utlåner og låntaker trekker tilbake hver sin bekreftelse
- hvordan historikk og nåværende status vises

### 17. Hvordan håndteres forsinket tilbakelevering?

I dag finnes «utilgjengelig» og «usikker», men ikke en eksplisitt modell for:

- forsinket
- låntaker svarer ikke
- utlåner svarer ikke
- partene er enige om forlengelse
- objektet er tapt eller skadet

### 18. Hvilke rettigheter har medeiere overfor hverandre?

Alle medeiere kan foreløpig redigere, publisere og bekrefte retur.

Vi må avklare:

- om én medeier kan fjerne en annen
- hvem som kan slette objektet
- hva som skjer ved uenighet
- hvordan gjenoppretting av tidligere versjoner fungerer
- om alle medeiere kan godkjenne ethvert lån

### 19. Hvor skal offentlige spørsmål om et objekt høre hjemme?

Hvis et objekt vises i flere miljøer, må vi velge om spørsmål og svar er:

- globale for objektet
- separate per miljø
- eller en kombinasjon

### 20. Hva er riktig livssyklus for inaktive objekter?

Forslagene er omtrent:

- skjul etter 30 dager
- arkiver etter seks måneder
- slett etter tolv måneder

Vi må avklare hva tidsperiodene måles fra, hvilke varsler som gis, og om automatisk permanent sletting er ønskelig.

## D – Kommunikasjon og varsler

### 21. Hvilken privat kommunikasjon skal være ende-til-ende-kryptert?

Vi må skille mellom:

- privat chat mellom brukere
- strukturert lånechat
- kontakt med administratorgruppe
- innmeldingssaker
- konfliktsaker
- kommunikasjon med plattformforvaltere

Noen av disse forutsetter tredjepartsinnsyn som ikke er forenlig med klassisk E2EE bare mellom to brukere.

### 22. Hva betyr «slett chat»?

Mulige betydninger:

- skjul samtalen for meg
- slett min lokale kopi
- slett meldinger jeg har sendt
- slett hele samtalen for begge
- permanent slett alle underliggende data

Visjonen peker foreløpig på den første typen, men dette må kommuniseres tydelig.

### 23. Skal Lånbort bruke lesebekreftelser?

Kildedokumentet sier uttrykkelig at en første henvendelse til en ikke-venn ikke skal vise om mottakeren har lest den.

Vi må avgjøre om lesebekreftelser ellers skal finnes, være valgfrie eller utelates helt.

### 24. Hvilke varsler kan brukeren slå av?

Varsler om for eksempel et aktivt lån, sikkerhet eller tidskritisk retur kan være annerledes enn informasjonsvarsler om et objekt man følger.

Vi bør definere kategorier før vi definerer kanalinnstillinger.

## E – Anmeldelser og tillit

### 25. Skal 4/5 virkelig kreve en negativ begrunnelse?

Dette kan gjøre en ellers positiv vurdering unødvendig negativ.

Vi bør vurdere andre modeller, for eksempel å kreve forklaring bare ved lave skårer eller gjøre begrunnelse valgfri, men oppmuntret.

### 26. Når blir anmeldelser synlige?

For å redusere gjengjeldelse kan vi vurdere at:

- begge vurderinger skjules til begge har levert
- eller publisering skjer når begge har levert eller en frist utløper

Dette er foreløpig ikke bestemt.

### 27. Hvem kan se fritekstanmeldelser?

Mulige nivåer:

- bare mottakeren
- medlemmer i felles miljø
- alle som kan se brukerens profil
- bare aggregert skår offentlig, med tekst privat

### 28. Bør «strenge anmeldere» automatisk få mindre vekt?

Ideen kan være nyttig, men kan også feiltolke reelt dårlige erfaringer som personlig negativitet.

Før vi beholder mekanismen må vi definere:

- minimum datamengde
- relevant sammenligningsgruppe
- statistisk usikkerhet
- transparens
- klagemulighet
- beskyttelse mot strategisk manipulasjon

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
