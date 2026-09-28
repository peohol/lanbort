# Låneforløpet

> **Status:** Førsteutkast. Hovedforløpet er tydelig, men flere tilstander mellom forespørsel, reservasjon, aktivt lån og avslutning må presiseres.

## Grunnforløp

Et lån skal i grove trekk bevege seg gjennom følgende hendelser:

1. en bruker finner et tilgjengelig objekt
2. brukeren sender en låneforespørsel
3. eier eller medeier vurderer forespørselen
4. partene kan kommunisere og avklare detaljer
5. forespørselen godkjennes eller avslås
6. en godkjent periode reserveres for lånet
7. objektet overleveres
8. lånet pågår
9. objektet leveres tilbake
10. tilbakeleveringen bekreftes
11. partene kan anmelde opplevelsen

Ved miljøbaserte lån kan enkelte uenigheter håndteres gjennom miljøets saksprosess. Ved direkte lån mellom venner er partene selv ansvarlige for å håndtere tvister om selve lånet; slike tvister skal ikke kunne eskaleres til plattformnivå for avgjørelse.

## Hvem kan be om å få låne?

Lån kan oppstå på to måter:

1. **Gjennom et miljø:** En bruker kan sende låneforespørsel på et objekt som er publisert i et miljø der brukeren har nødvendig adgang.
2. **Direkte mellom venner:** To brukere som er venner i Lånbort, kan låne direkte av hverandre uten at lånet er knyttet til et miljø.

Brukere som ikke er venner, kan foreløpig ikke gjennomføre direkte lån utenfor et miljø.

Denne forskjellen har særlig betydning for konfliktbehandling: ved et miljøbasert lån finnes et administrativt nivå i miljøet, mens et direkte vennelån er en privat avtale mellom partene.

### Ansvarserklæring ved direkte vennelån

Før et direkte vennelån kan godkjennes som et lån i Lånbort, skal både utlåner og låntaker uttrykkelig godta en ansvarserklæring.

Erklæringen skal gjøre det tydelig at:

- Lånbort fasiliterer kontakt, avtale og registrering av lånet
- partene selv har ansvar for gjenstanden og låneforholdet
- partene selv må håndtere uenighet om tilbakelevering, skade, tap, erstatning eller andre privatrettslige forhold
- en slik tvist ikke kan sendes til plattformansvarlige for mekling eller avgjørelse

Aksepten skal være knyttet til det konkrete direkte lånet, slik at begge parter aktivt har tatt stilling til premisset før lånet etableres.

Dette begrenser ikke brukerens adgang til å rapportere **plattformmisbruk** som trusler, trakassering, svindelforsøk, ulovlig innhold eller annen adferd som kan kreve tiltak for å beskytte Lånbort og brukerne. En slik rapport er en modereringssak, ikke en tvisteløsning for det private lånet.

## Låneforespørsel

En forespørsel skal minst uttrykke:

- hvilket objekt det gjelder
- når brukeren ønsker å få objektet
- hvor lenge brukeren ønsker å beholde det, eller når det skal leveres tilbake
- en melding til utlåner

«Så snart som mulig» skal kunne brukes som ønsket start.

Hvis brukeren angir et fullstendig fra–til-intervall, er varigheten allerede definert. Den endelige brukerflyten bør derfor unngå å be om samme informasjon to ganger.

## Kommunikasjon rundt forespørselen

En låneforespørsel skal åpne en legitim kontaktkanal mellom partene.

Forespørselen kan representeres som en strukturert melding i chatten, slik at partene tydelig ser hvilket objekt og hvilken periode samtalen gjelder.

Reglene for kontakt med brukere som ikke allerede er venner, må fortsatt ivareta mottakerens kontroll. Se [Kommunikasjon, varsler og saker](06-kommunikasjon-varsler-og-saker.md).

## Godkjenning og reservasjon

Når utlåner godkjenner en forespørsel, skal den avtalte perioden knyttes til objektet og blokkere kolliderende utlån.

Dette gjelder objektet globalt, også dersom objektet er synlig i flere miljøer eller har flere eiere.

Visjonen mangler foreløpig en eksplisitt status for et **fremtidig godkjent lån**. Det bør skilles mellom:

- tilgjengelig nå
- reservert til et fremtidig lån
- aktivt utlånt
- utilgjengelig av andre grunner

Den endelige statusmodellen må avklares.

## Flere samtidige forespørsler

Det opprinnelige notatet sier ikke hva som skjer dersom flere personer ber om samme eller overlappende periode før utlåner har svart.

Dette må defineres. Systemet må blant annet unngå at to forespørsler godkjennes for perioder som ikke kan sameksistere.

## Tilbakelevering

### Utlåners bekreftelse er avgjørende

Når objektet leveres tilbake, kan både låntaker og utlåner bekrefte dette.

I den beskrevne modellen er det utlåners bekreftelse som gjør tilbakeleveringen endelig:

- utlåner kan bekrefte uten at låntaker har gjort det
- når utlåner har bekreftet, regnes objektet som tilbakelevert
- låntakers bekreftelse alene gjør ikke tilbakeleveringen endelig

### Låntakers bekreftelse alene

Hvis låntaker bekrefter tilbakelevering før utlåner, skal objektet få en **usikker** status inntil utlåner svarer.

Dette signaliserer at partene ennå ikke har en felles, avsluttet status.

## Angrebuffer

Når en part trykker på bekreftelse av tilbakelevering, skal handlingen etter den opprinnelige visjonen ha en kort buffer før den blir synlig og virksom.

Forslaget er 30 sekunder, med:

- synlig nedtelling for personen som bekreftet
- mulighet til å angre
- mulighet til å velge «bekreft umiddelbart»

Formålet er å beskytte mot feiltrykk og bekreftelse av feil objekt.

Dette er en konkret brukeropplevelsesidé som kan beholdes dersom den fungerer godt i testing.

## Tilbakekalling etter at bekreftelsen er gjennomført

Visjonen åpner også for at en part senere kan trekke tilbake sin bekreftelse.

Dersom utlåner trekker tilbake en tidligere endelig bekreftelse, skal låntaker varsles og bli bedt om å angi om hen fortsatt har objektet eller mener det er levert tilbake.

Hvis partene da er uenige, kan det opprettes en sak.

Den nøyaktige tilstandsmodellen må presiseres. Særlig må det avklares:

- hvor lenge en gjennomført bekreftelse kan trekkes tilbake
- hva som skjer dersom objektet allerede er lovet til en ny låntaker
- hvilken virkning det har at låntaker trekker tilbake sin egen bekreftelse etter at utlåner har bekreftet
- hvordan historikken vises uten at status blir forvirrende

## Manglende bekreftelse etter låneperioden

Når avtalt låneperiode er utløpt, skal begge parter varsles og bes om å oppdatere status.

Hvis ingen bekrefter tilbakelevering, skal objektet fortsatt behandles som utilgjengelig.

Det må avklares hvordan systemet skiller mellom:

- et lån som bare mangler administrativ bekreftelse
- et faktisk forsinket eller manglende objekt
- en eksplisitt konflikt

## Foreløpige objektstatuser

Den opprinnelige visjonen beskriver:

- **Tilgjengelig** – objektet kan lånes
- **Lånt bort** – et aktivt lån pågår
- **Utilgjengelig** – objektet er ikke tilgjengelig for utlån
- **Usikker** – låntaker har meldt tilbakelevering, men utlåner har ikke bekreftet

Denne listen er nyttig, men ikke komplett for hele livssyklusen. «Reservert», «avventer bekreftelse» og eventuelt «forsinket» er eksempler på tilstander som må vurderes.

## Konflikt om tilbakelevering

### Miljøbasert lån

Hvis partene er uenige om objektet er levert tilbake etter et miljøbasert lån, skal det kunne opprettes en sak knyttet til lånet.

Begge parter skal kunne gi sin forklaring uten først å bli påvirket av den andres fremstilling.

En administrator i miljøet der lånet oppstod, skal kunne se begge forklaringene og kommunisere separat med partene.

Plattformansvarlige skal ikke være ordinær klage- eller tvisteløsningsinstans for slike private utlån. Det må fortsatt avklares hvor grensene går for eventuell plattforminvolvering ved alvorlig misbruk eller forhold som gjelder plattformens sikkerhet.

Administrator skal kunne avslutte saken når det ikke er mer som med rimelighet kan gjøres, selv om appen ikke kan fastslå den faktiske sannheten.

### Direkte lån mellom venner

Ved et direkte vennelån skal det **ikke** finnes noen tilsvarende tvistesak til administrator eller plattformansvarlig. Partene har på forhånd godtatt at de selv må håndtere uenigheten.

Lånbort kan fortsatt vise og bevare ordinær historikk om lånet i den utstrekning produktet og datalivssyklusen ellers tilsier, men plattformen skal ikke ta stilling til hvem som har rett i den private tvisten.

## Endringer i et godkjent lån

Visjonen må senere utvides med eksplisitte regler for blant annet:

- avbestilling før oppstart
- endring av hentetid
- forlengelse av lånet
- tidlig tilbakelevering
- manglende henting
- forsinket tilbakelevering
- skade eller tap
- hva som skjer dersom en medeier endrer objektet eller tilgjengeligheten mens et lån er avtalt

Disse spørsmålene er samlet i [Åpne spørsmål](open-questions.md).