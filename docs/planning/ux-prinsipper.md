# UX-prinsipper

> **Status:** Arbeidsdokument. Prinsippene vedtas sekvensielt før detaljert produktspesifikasjon og UX-modell utarbeides.

## Vedtatte prinsipper

### 1. Kompleksitet under panseret, enkelhet i normalforløpet

Brukeren skal til enhver tid først og fremst møte det som er relevant for situasjonen akkurat nå.

Sjeldne rettigheter, historikk, konflikthåndtering, administrative mekanismer og avanserte valg skal normalt være skjult og tre frem kontekstuelt når de blir relevante.

Dette skal likevel ikke brukes til å skjule informasjon som er nødvendig for å forstå konsekvensene av en handling.

### 2. Én konsekvent mental modell på tvers av appen

Samme type objekt, handling og tilstand skal oppføre seg likt uansett hvor brukeren møter den.

Et lån skal for eksempel forstås og håndteres på samme måte enten det oppstod via et miljø, et vennskap eller en annen inngang. Miljøer, søk og profiler kan være ulike veier til å oppdage ting og mennesker, men de skal ikke skape parallelle varianter av de samme grunnleggende funksjonene.

Målet er at brukeren lærer **Lånbort én gang**, fremfor å måtte lære forskjellige regler for forskjellige deler av appen.

### 3. Friksjon skal stå i forhold til konsekvensen

Vanlige, ufarlige handlinger skal kunne gjøres raskt og uten unødvendige bekreftelser.

Handlinger som skaper en forpliktelse, påvirker andre mennesker, endrer hvem som får tilgang til informasjon, eller er vanskelige å reversere, skal derimot kreve tydeligere samtykke.

Det skal være lett å bla, søke, lagre eller endre egne uforpliktende innstillinger. Å godkjenne et lån, endre avtalte vilkår, gjøre privat informasjon mer synlig eller utføre en destruktiv handling bør kreve at brukeren forstår hva som faktisk skjer.

Lånbort skal samtidig unngå bekreftelsesutmattelse: hvis alt får en advarsel, mister advarslene verdi.

### 4. Systemtilstand skal være tydelig og handlingsnær

Brukeren skal enkelt kunne forstå hva som er status akkurat nå, hva som eventuelt venter på noen andre, og hva brukeren selv kan eller bør gjøre videre.

Et lån skal for eksempel ikke bare vises som «aktivt», men presenteres slik at det er tydelig om objektet venter på overlevering, er utlånt, nærmer seg retur, venter på returbekreftelse eller befinner seg i et avvik. Den relevante neste handlingen bør være lett tilgjengelig i samme kontekst.

Interne statemaskiner og tekniske begreper skal ikke eksponeres som sådan. UI-et skal oversette dem til forståelige situasjoner og handlinger.

### 5. Handlinger skal finnes der konteksten finnes

Lånbort bør i størst mulig grad unngå store menyhierarkier der brukeren må vite *hvor* en funksjon befinner seg. Handlinger knyttet til et objekt, et lån, et miljø, en samtale eller en person bør være tilgjengelige i den aktuelle konteksten.

Den globale navigasjonen bør derfor hovedsakelig brukes til noen få stabile hovedområder. Mer spesialiserte funksjoner – særlig sjeldne administrative funksjoner, historikk og avvikshåndtering – bør dukke opp der de faktisk er relevante.

Dette innebærer også at vi ikke bør bevare alle tenkelige funksjoner som permanente menyvalg bare fordi systemet støtter dem. Kompleks funksjonalitet kan eksistere uten å dominere navigasjonen.

### 6. Vis lite først, mer ved behov

Lånbort bør bruke progressiv avdekking konsekvent. Oversikter, kort og hovedflater skal vise det brukeren vanligvis trenger for å forstå situasjonen og handle. Mer detaljert informasjon, historikk, sjeldne valg og forklaringer bør kunne åpnes ved behov uten å konkurrere om oppmerksomheten fra start.

Dette gjelder både innhold og funksjoner. En objektside bør for eksempel ikke presentere alle metadata, rettigheter, historiske hendelser og spesialhandlinger samtidig hvis de fleste brukere bare trenger å forstå hva objektet er, om det er tilgjengelig og hvordan de kan låne det.

Prinsippet skal likevel ikke brukes til å gjemme kritiske vilkår eller konsekvenser bak ekstra klikk.

### 7. Gode standardvalg, men ikke skjulte antakelser

Lånbort bør gjøre vanlige handlinger raske ved å foreslå fornuftige standardvalg og huske relevante brukerpreferanser. Samtidig skal systemet være forsiktig med å anta intensjon når valget påvirker andre mennesker, personvern eller forpliktelser.

Enkle preferanser kan gjerne forhåndsutfylles eller huskes. Men Lånbort bør ikke automatisk velge hvem som får tilgang til noe, godkjenne et lån, endre en avtale eller gjøre privat informasjon mer synlig bare fordi systemet antar hva brukeren sannsynligvis ønsker.

Målet er lav friksjon uten at brukeren mister kontroll over meningsfulle valg.

### 8. Oppmerksomhet skal behandles som en knapp ressurs

Lånbort skal bare avbryte brukeren når noe faktisk fortjener oppmerksomhet. Varsler, merker, påminnelser og advarsler bør prioriteres etter betydning fremfor å brukes for å maksimere aktivitet i appen.

Et aktivt lån som krever handling, en forestående retur eller en sikkerhetsrelevant hendelse kan fortjene tydelig oppmerksomhet. Lavprioritetsinformasjon bør heller være tilgjengelig i appen eller samles, fremfor å generere stadig nye varsler.

Brukeren bør dessuten kunne forstå *hvorfor* noe krever oppmerksomhet og hva som forventes videre. Lånbort skal hjelpe brukeren med reelle forpliktelser, ikke forsøke å trekke brukeren tilbake til appen for sin egen del.

### 9. Feil skal være lette å forstå og så langt som mulig lette å rette

Lånbort bør prioritere reverserbare handlinger fremfor advarsler der det er mulig. Hvis en handling trygt kan angres, er «utfør + angre» ofte bedre enn å stoppe brukeren med en bekreftelsesdialog.

Når noe ikke kan reverseres enkelt, eller påvirker andre mennesker eller eksisterende forpliktelser, skal konsekvensen fremgå tydelig før handlingen utføres.

Feilmeldinger skal forklare hva som skjedde, hva brukeren fortsatt kan gjøre, og om systemet faktisk har gjennomført deler av handlingen. Brukeren skal ikke måtte gjette om en forespørsel ble sendt, om et lån ble endret eller om noe må prøves på nytt.

### 10. Tilgjengelighet skal være innebygd fra start

Lånbort bør utformes slik at sentrale funksjoner kan brukes av flest mulig uten særskilte «tilgjengelighetsmoduser». Det innebærer blant annet tydelig hierarki, god lesbarhet, tilstrekkelig kontrast, forutsigbar navigasjon, store nok berøringsflater og støtte for hjelpemidler.

Informasjon skal ikke formidles gjennom farge alene, og handlinger skal ikke være avhengige av presis motorikk, bestemte bevegelser eller kortvarige visuelle signaler.

Målet er ikke bare formell etterlevelse av tilgjengelighetskrav, men at universell utforming påvirker de grunnleggende UX-valgene før detaljdesign begynner.

### 11. Personvern og sikkerhet skal være synlige gjennom forståelige konsekvenser, ikke teknisk språk

Brukeren skal kunne forstå hvem som kan se noe, hvem som kan gjøre noe, og hva som skjer når en relasjon eller tilgang endres. Grensesnittet bør derfor uttrykke personvern og rettigheter konkret i den aktuelle situasjonen.

Det bør for eksempel fremgå tydelig om et objekt er synlig for venner, bestemte miljøer eller andre grupper; om en handling gjør informasjon mer tilgjengelig; og om en endring påvirker eksisterende eller bare fremtidige forhold.

Tekniske begreper som tilgangskontroll, autorisasjon eller krypteringsmodell bør normalt ikke være nødvendige for å bruke appen trygt. Systemet skal gjøre de faktiske grensene forståelige.

