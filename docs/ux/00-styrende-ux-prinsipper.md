# UX-prinsipper

> **Status:** Vedtatte UX-prinsipper for videre produktspesifikasjon, UX-modell og systemarkitektur. Prinsippfasen ble fullført 1. oktober 2026.

## Vedtatte prinsipper

### UX-P01 — Kompleksitet under panseret, enkelhet i normalforløpet

Brukeren skal til enhver tid først og fremst møte det som er relevant for situasjonen akkurat nå.

Sjeldne rettigheter, historikk, konflikthåndtering, administrative mekanismer og avanserte valg skal normalt være skjult og tre frem kontekstuelt når de blir relevante.

Dette skal likevel ikke brukes til å skjule informasjon som er nødvendig for å forstå konsekvensene av en handling.

### UX-P02 — Én konsekvent mental modell på tvers av appen

Samme type objekt, handling og tilstand skal oppføre seg likt uansett hvor brukeren møter den.

Et lån skal for eksempel forstås og håndteres på samme måte enten det oppstod via et miljø, et vennskap eller en annen inngang. Miljøer, søk og profiler kan være ulike veier til å oppdage ting og mennesker, men de skal ikke skape parallelle varianter av de samme grunnleggende funksjonene.

Målet er at brukeren lærer **Lånbort én gang**, fremfor å måtte lære forskjellige regler for forskjellige deler av appen.

### UX-P03 — Friksjon skal stå i forhold til konsekvensen

Vanlige, ufarlige handlinger skal kunne gjøres raskt og uten unødvendige bekreftelser.

Handlinger som skaper en forpliktelse, påvirker andre mennesker, endrer hvem som får tilgang til informasjon, eller er vanskelige å reversere, skal derimot kreve tydeligere samtykke.

Det skal være lett å bla, søke, lagre eller endre egne uforpliktende innstillinger. Å godkjenne et lån, endre avtalte vilkår, gjøre privat informasjon mer synlig eller utføre en destruktiv handling bør kreve at brukeren forstår hva som faktisk skjer.

Lånbort skal samtidig unngå bekreftelsesutmattelse: hvis alt får en advarsel, mister advarslene verdi.

### UX-P04 — Systemtilstand skal være tydelig og handlingsnær

Brukeren skal enkelt kunne forstå hva som er status akkurat nå, hva som eventuelt venter på noen andre, og hva brukeren selv kan eller bør gjøre videre.

Et lån skal for eksempel ikke bare vises som «aktivt», men presenteres slik at det er tydelig om objektet venter på overlevering, er utlånt, nærmer seg retur, venter på returbekreftelse eller befinner seg i et avvik. Den relevante neste handlingen bør være lett tilgjengelig i samme kontekst.

Interne statemaskiner og tekniske begreper skal ikke eksponeres som sådan. UI-et skal oversette dem til forståelige situasjoner og handlinger.

### UX-P05 — Handlinger skal finnes der konteksten finnes

Lånbort bør i størst mulig grad unngå store menyhierarkier der brukeren må vite *hvor* en funksjon befinner seg. Handlinger knyttet til et objekt, et lån, et miljø, en samtale eller en person bør være tilgjengelige i den aktuelle konteksten.

Den globale navigasjonen bør derfor hovedsakelig brukes til noen få stabile hovedområder. Mer spesialiserte funksjoner – særlig sjeldne administrative funksjoner, historikk og avvikshåndtering – bør dukke opp der de faktisk er relevante.

Dette innebærer også at vi ikke bør bevare alle tenkelige funksjoner som permanente menyvalg bare fordi systemet støtter dem. Kompleks funksjonalitet kan eksistere uten å dominere navigasjonen.

### UX-P06 — Vis lite først, mer ved behov

Lånbort bør bruke progressiv avdekking konsekvent. Oversikter, kort og hovedflater skal vise det brukeren vanligvis trenger for å forstå situasjonen og handle. Mer detaljert informasjon, historikk, sjeldne valg og forklaringer bør kunne åpnes ved behov uten å konkurrere om oppmerksomheten fra start.

Dette gjelder både innhold og funksjoner. En objektside bør for eksempel ikke presentere alle metadata, rettigheter, historiske hendelser og spesialhandlinger samtidig hvis de fleste brukere bare trenger å forstå hva objektet er, om det er tilgjengelig og hvordan de kan låne det.

Prinsippet skal likevel ikke brukes til å gjemme kritiske vilkår eller konsekvenser bak ekstra klikk.

### UX-P07 — Gode standardvalg, men ikke skjulte antakelser

Lånbort bør gjøre vanlige handlinger raske ved å foreslå fornuftige standardvalg og huske relevante brukerpreferanser. Samtidig skal systemet være forsiktig med å anta intensjon når valget påvirker andre mennesker, personvern eller forpliktelser.

Enkle preferanser kan gjerne forhåndsutfylles eller huskes. Men Lånbort bør ikke automatisk velge hvem som får tilgang til noe, godkjenne et lån, endre en avtale eller gjøre privat informasjon mer synlig bare fordi systemet antar hva brukeren sannsynligvis ønsker.

Målet er lav friksjon uten at brukeren mister kontroll over meningsfulle valg.

### UX-P08 — Oppmerksomhet skal behandles som en knapp ressurs

Lånbort skal bare avbryte brukeren når noe faktisk fortjener oppmerksomhet. Varsler, merker, påminnelser og advarsler bør prioriteres etter betydning fremfor å brukes for å maksimere aktivitet i appen.

Et aktivt lån som krever handling, en forestående retur eller en sikkerhetsrelevant hendelse kan fortjene tydelig oppmerksomhet. Lavprioritetsinformasjon bør heller være tilgjengelig i appen eller samles, fremfor å generere stadig nye varsler.

Brukeren bør dessuten kunne forstå *hvorfor* noe krever oppmerksomhet og hva som forventes videre. Lånbort skal hjelpe brukeren med reelle forpliktelser, ikke forsøke å trekke brukeren tilbake til appen for sin egen del.

### UX-P09 — Feil skal være lette å forstå og så langt som mulig lette å rette

Lånbort bør prioritere reverserbare handlinger fremfor advarsler der det er mulig. Hvis en handling trygt kan angres, er «utfør + angre» ofte bedre enn å stoppe brukeren med en bekreftelsesdialog.

Når noe ikke kan reverseres enkelt, eller påvirker andre mennesker eller eksisterende forpliktelser, skal konsekvensen fremgå tydelig før handlingen utføres.

Feilmeldinger skal forklare hva som skjedde, hva brukeren fortsatt kan gjøre, og om systemet faktisk har gjennomført deler av handlingen. Brukeren skal ikke måtte gjette om en forespørsel ble sendt, om et lån ble endret eller om noe må prøves på nytt.

### UX-P10 — Tilgjengelighet skal være innebygd fra start

Lånbort bør utformes slik at sentrale funksjoner kan brukes av flest mulig uten særskilte «tilgjengelighetsmoduser». Det innebærer blant annet tydelig hierarki, god lesbarhet, tilstrekkelig kontrast, forutsigbar navigasjon, store nok berøringsflater og støtte for hjelpemidler.

Informasjon skal ikke formidles gjennom farge alene, og handlinger skal ikke være avhengige av presis motorikk, bestemte bevegelser eller kortvarige visuelle signaler.

Målet er ikke bare formell etterlevelse av tilgjengelighetskrav, men at universell utforming påvirker de grunnleggende UX-valgene før detaljdesign begynner.

### UX-P11 — Personvern og sikkerhet skal være synlige gjennom forståelige konsekvenser, ikke teknisk språk

Brukeren skal kunne forstå hvem som kan se noe, hvem som kan gjøre noe, og hva som skjer når en relasjon eller tilgang endres. Grensesnittet bør derfor uttrykke personvern og rettigheter konkret i den aktuelle situasjonen.

Det bør for eksempel fremgå tydelig om et objekt er synlig for venner, bestemte miljøer eller andre grupper; om en handling gjør informasjon mer tilgjengelig; og om en endring påvirker eksisterende eller bare fremtidige forhold.

Tekniske begreper som tilgangskontroll, autorisasjon eller krypteringsmodell bør normalt ikke være nødvendige for å bruke appen trygt. Systemet skal gjøre de faktiske grensene forståelige.

### UX-P12 — Mobil først, men ikke mobil begrenset

Lånbort bør primært utformes for mobilbruk, fordi mange sentrale handlinger naturlig skjer i bevegelse eller tett på den fysiske utlånssituasjonen: finne et objekt, sende en forespørsel, avtale overlevering, bekrefte retur eller svare på en melding.

Samtidig skal den samme mentale modellen og de samme kjernefunksjonene fungere på større skjermer. Desktop kan utnytte mer plass til oversikt, flere samtidige paneler og mer effektiv administrasjon, men skal ikke utvikle egne regler eller parallelle arbeidsmåter.

Responsivitet skal derfor handle om å tilpasse presentasjon og informasjonsmengde til skjermen, ikke om å lage to forskjellige produkter.

### UX-P13 — Gjenkjennelige mønstre skal brukes konsekvent

Samme type informasjon og handling bør presenteres med samme struktur, språk og interaksjonsmønster på tvers av appen. Kort, statuser, knapper, menyer, bekreftelser og detaljvisninger bør derfor bygges fra et begrenset sett med tydelige mønstre.

Brukeren skal kunne overføre læring fra én del av Lånbort til en annen. Hvis en bestemt visuell struktur betyr «venter på deg» ett sted, bør den ikke bety noe annet et annet sted.

Konsistens bør veie tyngre enn lokal kreativitet, med mindre en reell forskjell i brukerbehov tilsier et annet mønster.

### UX-P14 — Språket skal være menneskelig, presist og handlingsrettet

Lånbort bør bruke ord som beskriver brukerens situasjon og handling, ikke systemets interne modell. «Venter på at Kari bekrefter retur» er bedre enn en intern statusetikett som «pending_return_confirmation».

Språket bør være kort der situasjonen er enkel, men mer forklarende når konsekvensene er viktige eller potensielt uklare. Juridisk, teknisk og administrativ sjargong skal normalt oversettes til vanlig språk.

Samtidig må enkelhet ikke gå på bekostning av presisjon. Hvis to tilstander faktisk har ulike konsekvenser, bør de også beskrives forskjellig i UI-et.

### UX-P15 — Tillit skal vises kontekstuelt, ikke som sosial rangering

Når Lånbort viser anmeldelser, historikk eller annen tillitsinformasjon, skal presentasjonen hjelpe brukeren å vurdere en konkret situasjon – ikke gi inntrykk av at mennesker kan reduseres til én generell verdi.

Informasjonen bør derfor knyttes til relevante roller og hendelser, vise datagrunnlaget tydelig og gjøre usikkerhet synlig. Et lite antall anmeldelser skal for eksempel ikke visuelt fremstå like sikkert som et stort erfaringsgrunnlag.

Globale poengsummer, rangeringer, «topplister» og annen design som inviterer til sosial konkurranse bør unngås.

### UX-P16 — Nåtilstanden først, historikken ved behov

Lånbort skal først og fremst vise hva som gjelder **nå**. Historikk skal være tilgjengelig når den er relevant for forståelse, dokumentasjon eller konfliktavklaring, men skal normalt ikke dominere hovedflatene.

Et aktivt lån bør for eksempel først vise gjeldende avtale, status og neste handling. Tidligere datoendringer, rolleendringer, moderering eller andre historiske hendelser kan ligge i en diskret tidslinje eller detaljvisning.

Systemet kan dermed bevare rik og sporbar historikk uten at brukeren må forholde seg til den i normal bruk.

### UX-P17 — Sosialt press skal reduseres, ikke bygges inn i produktet

Lånbort skal gjøre det legitimt og enkelt å avslå, trekke tilbake tilgjengelighet eller si «ikke nå» uten at brukeren presses til å begrunne seg mer enn nødvendig.

Forespørsler, påminnelser og statusvisning bør derfor utformes slik at de støtter tydelig kommunikasjon uten å skape skyld, mas eller konkurranse om å være «snillest» eller mest tilgjengelig.

Produktet skal hjelpe mennesker å dele frivillig. Det bør ikke bruke designgrep som gjør det sosialt vanskelig å sette grenser.

### UX-P18 — Automatisering skal foreslå og forenkle, men ikke overta meningsfulle valg

Lånbort kan gjerne automatisere trivielle ting: sortering, forslag, utfylling, påminnelser, beregning av relevante standardverdier og andre handlinger der risikoen ved feil er liten.

Når en handling derimot påvirker andre mennesker, personvern, forpliktelser eller rettigheter, bør systemet normalt presentere et forslag eller et tydelig neste steg fremfor å handle på brukerens vegne.

Automatisering skal redusere arbeid, ikke redusere kontroll.

### UX-P19 — Læring skal skje i kontekst, ikke gjennom tung onboarding

Lånbort bør ikke forutsette at nye brukere først må gjennom lange introduksjoner, veivisere eller opplæring før de kan bruke produktet.

Grunnleggende bruk skal være forståelig gjennom selve grensesnittet. Forklaringer og hjelp bør dukke opp der et nytt eller uvanlig konsept faktisk blir relevant.

Et kort førstegangsoppsett kan brukes når det trengs for nødvendige valg, men opplæring skal i hovedsak skje gradvis gjennom bruk. Dette reduserer både oppstartsfriksjon og behovet for å huske informasjon før den får praktisk betydning.

### UX-P20 — Oppdagelse skal være målrettet, ikke feed-drevet

Lånbort skal først og fremst hjelpe brukeren å finne det de faktisk trenger: et bestemt objekt, noe i nærheten, noe i et relevant miljø eller noe tilgjengelig innenfor en gitt periode.

Søk, filtre, kategorier og kontekstuelle forslag bør derfor være viktigere enn en endeløs strøm av innhold. Appen bør ikke optimaliseres for scrolling eller oppmerksomhet i seg selv.

Forslag kan gjerne brukes når de er relevante, men de bør være forklarlige og knyttet til brukerens aktuelle behov eller kontekst.

### UX-P21 — Systemet skal gi umiddelbar og entydig respons på handlinger

Når brukeren gjør noe, skal det være tydelig om handlingen er registrert, fortsatt pågår, venter på en annen part eller har mislyktes.

Grensesnittet bør så langt mulig unngå situasjoner der brukeren blir usikker på om et trykk faktisk virket, om en forespørsel ble sendt, eller om en endring ble lagret.

Tilbakemeldingen bør være proporsjonal med handlingen: diskret ved trivielle handlinger, tydeligere når konsekvensen er viktig.

### UX-P22 — Nettverksproblemer skal ikke skape tvetydighet eller tap av arbeid

Lånbort bør tåle treg eller ustabil forbindelse på en måte som er forståelig for brukeren. Midlertidige nettverksproblemer skal så langt mulig ikke føre til at utfylte data forsvinner eller at samme handling utilsiktet utføres flere ganger.

Hvis systemet ikke vet om en viktig handling faktisk ble gjennomført, skal det ikke late som om utfallet er sikkert. UI-et bør vise at status må avklares og forsøke å gjenopprette en entydig tilstand.

For enkelte ufarlige handlinger kan lokal mellomlagring eller senere synkronisering være hensiktsmessig. Handlinger som etablerer eller endrer forpliktelser mellom mennesker skal derimot først presenteres som fullført når systemet faktisk har bekreftet dem.

### UX-P23 — Det skal finnes en forståelig vei videre når virkeligheten avviker fra normalforløpet

Lånbort skal ikke anta at alle hendelser følger den forventede flyten. Et objekt kan være skadet, noen kan være utilgjengelige, partene kan være uenige om hva som har skjedd, eller den faktiske situasjonen kan avvike fra det systemet forventer.

Når dette skjer, skal brukeren kunne finne en tydelig vei videre fra den aktuelle situasjonen – for eksempel rapportere et problem, be om avklaring eller gå inn i et relevant avviksforløp – fremfor å bli sittende fast fordi den «riktige» knappen ikke lenger passer.

Dette betyr ikke at brukeren skal kunne omgå sikkerhetsregler eller eksisterende forpliktelser. Poenget er at produktet skal kunne representere at virkeligheten er uavklart eller avvikende, i stedet for å tvinge den inn i en uriktig normaltilstand.
