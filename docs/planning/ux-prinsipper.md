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

