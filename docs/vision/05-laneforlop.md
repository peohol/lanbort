# Låneforløpet

> **Status:** Førsteutkast. Hovedforløpet og skillet mellom tilgjengelighet og lånestatus er avklart, men flere regler for endringer og avvik må presiseres.

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

Blokkering mellom partene opphever ikke et allerede reservert eller aktivt lån. Nødvendige strukturerte handlinger og statusinformasjon skal fortsatt være tilgjengelige til lånet er avsluttet, selv om vanlig sosial kontakt mellom partene begrenses.

## Hvem kan be om å få låne?

Lån kan oppstå på to måter:

1. **Gjennom et miljø:** En bruker kan sende låneforespørsel på et objekt som er publisert i et miljø der brukeren har nødvendig adgang.
2. **Direkte mellom venner:** To brukere som er venner i Lånbort, kan låne direkte av hverandre uten at lånet er knyttet til et miljø.

Brukere som ikke er venner, kan foreløpig ikke gjennomføre direkte lån utenfor et miljø.

Forskjellen mellom de to inngangene gjelder først og fremst **hvordan lånet kan oppstå**, ikke hvordan det vanlige låneforløpet ser ut etterpå.

Når en låneforespørsel er sendt, skal lånet ha samme grunnleggende brukerflate, tilstander, kommunikasjon og returforløp uansett om det ble initiert gjennom et miljø eller direkte mellom venner.

Et lån som oppstod gjennom et miljø skal likevel beholde miljøet som opprinnelseskontekst. Det kan være relevant for historikk, moderering og muligheten for miljøbasert mekling ved konflikt. Denne konteksten skal ikke gjøre det ordinære låne-UI-et til et eget «miljølån»-system.

### Ansvarserklæring ved direkte vennelån

Før et direkte vennelån kan godkjennes som et lån i Lånbort, skal både utlåner og låntaker uttrykkelig godta en ansvarserklæring.

Erklæringen skal gjøre det tydelig at:

- Lånbort fasiliterer kontakt, avtale og registrering av lånet
- partene selv har ansvar for gjenstanden og låneforholdet
- partene selv må håndtere uenighet om tilbakelevering, skade, tap, erstatning eller andre privatrettslige forhold
- en slik tvist ikke kan sendes til plattformforvaltere for mekling eller avgjørelse

Aksepten skal være knyttet til det konkrete direkte lånet, slik at begge parter aktivt har tatt stilling til premisset før lånet etableres.

Dette begrenser ikke brukerens adgang til å rapportere **plattformmisbruk** som trusler, trakassering, svindelforsøk, ulovlig innhold eller annen adferd som kan kreve tiltak for å beskytte Lånbort og brukerne. En slik rapport er en modereringssak, ikke en tvisteløsning for det private lånet.

## Ett felles lånesystem

Lånbort skal ha **ett felles lånesystem**.

Et lån skal derfor vises og håndteres på samme måte i brukerflatene uansett om:

- partene fant hverandre gjennom et miljø
- partene allerede var venner og opprettet lånet direkte

Miljøet fungerer som inngangsport og tillitsramme når brukere som ikke er venner skal kunne etablere et lån. Etter at låneforespørselen er sendt, er utlåner og låntaker de sentrale partene i selve låneforløpet.

Forskjeller som følger av opprinnelsen, for eksempel tilgang til miljøbasert mekling, kan finnes som kontekstuelle handlinger uten å skape to separate låneopplevelser.

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

Når utlåner godkjenner en forespørsel, går lånet over til **reservert**.

Dersom objektet har flere medeiere, blir den medeiaren som godkjenner forespørselen registrert som **ansvarlig utlåner** for dette konkrete lånet.

Den avtalte perioden knyttes til objektet og blokkerer kolliderende utlån. Dette gjelder objektet globalt, også dersom objektet er synlig i flere miljøer eller har flere eiere. Andre medeiere kan dermed ikke inngå et kolliderende lån i den reserverte perioden.

Reservasjon er en status i det konkrete låneforløpet. Den skal ikke blandes sammen med objektets generelle tilgjengelighetsperioder.

## Overføring av ansvarlig utlåner

Et reservert eller aktivt lån skal alltid ha én ansvarlig utlåner om gangen.

Ansvar kan overføres på to måter:

1. **Frivillig overføring:** Den ansvarlige utlåneren overfører eksplisitt rollen til en annen registrert medeier.
2. **Kontrollert overtakelse ved utilgjengelighet:** Dersom den ansvarlige utlåneren reelt blir utilgjengelig, kan en annen registrert medeier overta gjennom en særskilt unntaksprosess.

Manglende svar alene skal ikke umiddelbart være tilstrekkelig for overtakelse. Produktet må senere definere en rimelig terskel for når en utlåner kan behandles som utilgjengelig.

Låntakeren skal varsles tydelig om at ansvarlig utlåner er endret, men skal ikke måtte godkjenne selve overføringen. Den nye ansvarlige utlåneren trer inn i den eksisterende utlånerrollen; låneavtalen, tidligere hendelser og avtalte vilkår står ellers uendret.

Overføringen gir derfor ikke adgang til å endre returdato, kansellere lånet eller gjøre andre avtalemessige endringer uten det samtykket som ellers kreves.

Hvis den tidligere ansvarlige utlåneren senere blir tilgjengelig igjen, får vedkommende ikke automatisk rollen tilbake. En ny overføring må i så fall skje eksplisitt.

## Flere samtidige forespørsler

Flere låneforespørsler på samme objekt kan være åpne samtidig, også dersom de overlapper tidsmessig.

Når én forespørsel godkjennes:

- reserveres den avtalte perioden for dette lånet
- alle andre åpne forespørsler som kolliderer med den reserverte perioden blir automatisk avslått eller avsluttet som ikke lenger mulige
- forespørsler som ikke kolliderer, kan fortsatt stå åpne

Systemet skal dermed forhindre at to kolliderende lån godkjennes, uten at utlåner trenger å rydde manuelt i alle forespørsler.

Lånbort skal foreløpig **ikke** ha:

- venteliste for kolliderende forespørsler
- en egen «hold av»-funksjon mens utlåner vurderer en forespørsel

Slike mekanismer kan vurderes senere dersom reell bruk viser et behov.

## Når et godkjent lån ikke blir hentet

Hvis avtalt overleveringstid passerer uten at objektet er registrert som overlevert, skal lånet gå til den nøytrale statusen **avventer overleveringsavklaring**.

Partene skal kunne angi hva som faktisk skjedde.

Mulige hovedutfall er:

- Hvis objektet faktisk ble overlevert, går lånet til **utlånt**.
- Hvis partene blir enige om et nytt overleveringstidspunkt, oppdateres avtalen etter de vanlige reglene for avtaleendring, og reservasjonen fortsetter.
- Hvis overleveringen ikke skjedde, avsluttes lånet som **ikke gjennomført**.

Hvis partene gir motstridende opplysninger om hvorvidt objektet faktisk ble overlevert, går lånet til **usikker / uenighet**. Så lenge det er reell usikkerhet om hvem som har objektet, skal objektet fortsatt behandles som utilgjengelig for kolliderende utlån.

Hvis én part oppgir at overleveringen ikke skjedde og den andre ikke svarer, skal reservasjonen ikke kunne blokkere objektet på ubestemt tid. Etter en rimelig svarfrist kan lånet avsluttes som **ikke gjennomført**. Taushet skal ikke i seg selv tolkes som bevis for hvem som hadde ansvar for at overleveringen uteble.

**Ikke gjennomført** skal skilles fra **kansellert**:

- **Kansellert** betyr at et godkjent lån avsluttes før planlagt gjennomføring.
- **Ikke gjennomført** betyr at tidspunktet for overlevering kom, men objektet ble aldri overlevert.

Et ikke gjennomført lån kan fortsatt gi grunnlag for en begrenset vurdering av selve overleveringsforløpet, for eksempel oppmøte, tilgjengelighet og kommunikasjon. Vurderingsspørsmål som forutsetter at utlånet faktisk fant sted, for eksempel objektets tilstand ved retur, skal ikke brukes.

Den konkrete svarfristen ved manglende overleveringsavklaring bestemmes senere.

## Tilbakelevering

### Utlåners bekreftelse er avgjørende

Når objektet leveres tilbake, kan både låntaker og utlåner bekrefte dette.

I den beskrevne modellen er det den **ansvarlige utlånerens** bekreftelse som gjør tilbakeleveringen endelig:

- ansvarlig utlåner kan bekrefte uten at låntaker har gjort det
- når ansvarlig utlåner har bekreftet, regnes objektet som tilbakelevert
- låntakers bekreftelse alene gjør ikke tilbakeleveringen endelig
- andre medeiere kan ikke bekrefte retur på ansvarlig utlåners vegne bare fordi de medeier objektet

Hvis ansvarlig utlåner blir reelt utilgjengelig, kan en annen registrert medeier overta rollen gjennom den særskilte overtakelsesprosessen beskrevet for medeide objekter. Overtakelsen skal være eksplisitt og sporbar, og låntakeren skal varsles tydelig. Den endrer ikke låneavtalen og gir ikke den nye ansvarlige utlåneren større myndighet enn den forrige hadde.

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

## Feil etter gjennomført returbekreftelse

30-sekundersbufferen er den eneste perioden der en returbekreftelse kan **angres som om den ikke var sendt**.

Når bufferen er utløpt, skal bekreftelsen ikke kunne slettes eller trekkes tilbake fra historikken. Den er da en faktisk hendelse som har funnet sted i låneforløpet.

Hvis en part senere oppdager at bekreftelsen var feil, skal dette håndteres som en **ny hendelse**, for eksempel gjennom en funksjon som «Rapporter problem med tilbakeleveringen».

Historikken skal dermed kunne vise begge deler, for eksempel:

- utlåner bekreftet tilbakelevering
- utlåner meldte senere at tilbakeleveringen var feilregistrert

Hvis den nye meldingen innebærer at returstatusen igjen er reelt uavklart, kan lånet gå fra **avsluttet** til **usikker / uenighet**.

Dette prinsippet skal gjelde uansett om feilen meldes av utlåner eller låntaker. Den opprinnelige bekreftelsen beholdes som historikk, mens den nye hendelsen endrer den aktuelle statusen dersom det er nødvendig.

Hvis objektet allerede er reservert til et nytt lån, skal den nye hendelsen ikke skjules eller avvises av den grunn. Eventuell konflikt mellom gammel returstatus og nye reservasjoner må håndteres eksplisitt som et avvik, ikke ved å omskrive historikken.

## Når returtidspunktet passeres

Når avtalt returtidspunkt passeres uten at tilbakeleveringen er endelig bekreftet, skal lånet først gå til den nøytrale statusen **avventer returavklaring**.

Begge parter skal varsles og få anledning til å oppgi hva som faktisk har skjedd.

Systemet skal deretter skille mellom ulike situasjoner:

- Hvis låntaker oppgir at hen fortsatt har objektet og det ikke finnes en gyldig avtalt forlengelse, markeres lånet som **forsinket**.
- Hvis partene blir enige om en forlengelse, oppdateres returdatoen etter de vanlige reglene for avtaleendring, og lånet går tilbake til **utlånt**.
- Hvis låntaker oppgir at objektet er levert tilbake, men utlåner ennå ikke har bekreftet dette, forblir lånet **avventer returavklaring**.
- Hvis utlåner oppgir at objektet ikke er mottatt samtidig som låntaker oppgir at det er levert, går lånet til **usikker / uenighet**.
- Hvis én eller begge parter ikke svarer, kan systemet sende påminnelser, men taushet skal ikke tolkes som bevis for at objektet er forsinket, returnert eller ikke returnert.

Så lenge returstatusen ikke er endelig avklart, skal objektet fortsatt behandles som utilgjengelig for kolliderende utlån.

### Forsinket tilbakelevering

**Forsinket** skal bare brukes når det faktisk er kjent at objektet fortsatt er hos låntaker etter avtalt returtid uten gyldig forlengelse.

At returtidspunktet er passert er derfor ikke alene nok til å klassifisere lånet som forsinket.

### Skade og tap

Skade og tap skal registreres som hendelser eller avvik knyttet til lånet, ikke som egne normale lånestatuser.

Hvis partene er uenige om hva som har skjedd, ansvar eller omfang, kan lånet samtidig få status **usikker / uenighet**.

## Lånestatus

Lånestatus beskriver hva som skjer med et **konkret lån**, og skal holdes adskilt fra objektets tilgjengelighet.

Det normale hovedforløpet er:

1. **Forespurt** – låntaker har sendt en låneforespørsel som ennå ikke er godkjent eller avslått.
2. **Reservert** – forespørselen er godkjent for en fremtidig eller kommende periode.
3. **Avventer overleveringsavklaring** – avtalt overleveringstid er passert uten at det er avklart om objektet faktisk ble overlevert.
4. **Utlånt** – objektet er overlevert og lånet pågår.
5. **Avventer returavklaring** – avtalt låneperiode er over eller en part har meldt tilbakelevering, men returstatusen er ennå ikke endelig avklart.
6. **Avsluttet** – tilbakeleveringen er endelig bekreftet og lånet er ferdig.

I tillegg finnes avvikstilstander eller markeringer som kan bryte det normale forløpet:

- **Kansellert** – lånet avsluttes før ordinær gjennomføring.
- **Ikke gjennomført** – avtalt overleveringstid kom, men objektet ble aldri overlevert.
- **Forsinket** – det er kjent at objektet fortsatt er hos låntaker etter avtalt returtid uten gyldig forlengelse.
- **Usikker / uenighet** – partene har motstridende eller uavklarte opplysninger om retur, skade, tap eller annen sentral del av lånet.

Disse statusene skal beskrive lånet. Om objektet faktisk kan lånes av en annen bruker på et bestemt tidspunkt, avgjøres separat av objektets tilgjengelighet sammen med reservasjoner og aktive lån.

## Konflikt om tilbakelevering

### Miljøbasert lån

Hvis partene er uenige om objektet er levert tilbake etter et miljøbasert lån, skal det kunne opprettes en sak knyttet til lånet.

Begge parter skal kunne gi sin forklaring uten først å bli påvirket av den andres fremstilling.

En administrator i miljøet der lånet oppstod, skal kunne se begge forklaringene og kommunisere separat med partene.

Administratorens rolle er å **fasilitere dialog og mekle**, ikke å avsi en bindende avgjørelse om hvem som har rett.

Administrator kan:

- innhente partenes forklaringer
- stille oppfølgingsspørsmål
- formidle mellom partene
- bidra til å tydeliggjøre hva som er omstridt
- avslutte saken når det ikke er mer som med rimelighet kan gjøres

Administrator skal ikke kunne:

- fastsette juridisk skyld
- pålegge en part å betale erstatning
- avgjøre eiendomsrett eller andre privatrettslige krav
- fatte en bindende avgjørelse som erstatter partenes eget ansvar

At en part er misfornøyd med administratorens mekling eller avslutning av saken, gir **ikke** i seg selv rett til å eskalere lånetvisten til en plattformforvalter.

Alvorlige forhold som trusler, trakassering, svindelforsøk, ulovlig bruk eller annet misbruk av Lånbort kan fortsatt rapporteres separat som en modereringssak. Plattformforvaltere behandler i så fall plattformmisbruket, ikke den privatrettslige lånetvisten.

### Direkte lån mellom venner

Ved et direkte vennelån skal det **ikke** finnes noen tilsvarende tvistesak til administrator eller plattformforvalter. Partene har på forhånd godtatt at de selv må håndtere uenigheten.

Lånbort kan fortsatt vise og bevare ordinær historikk om lånet i den utstrekning produktet og datalivssyklusen ellers tilsier, men plattformen skal ikke ta stilling til hvem som har rett i den private tvisten.

## Endringer i et godkjent lån

**Hovedregel:** Endringer som påvirker selve avtalen mellom utlåner og låntaker krever samtykke fra begge parter.

Dette gjelder blant annet:

- kansellering av et godkjent lån
- endring av avtalt hentetid når tidspunktet er en del av avtalen
- endring av returdato
- forlengelse av lånet
- andre endringer i vilkår som påvirker hva en av partene har sagt ja til

Forslag til slike endringer kan initieres av én part, men får ikke virkning før den andre har godtatt.

Rent praktiske opplysninger kan endres ensidig dersom de ikke endrer selve låneavtalen, for eksempel en presisering om hvor partene skal møtes dersom dette ikke endrer avtalens vesentlige innhold.

### Tidlig retur

Låntaker kan ønske å levere objektet tilbake før avtalt returdato. Dette krever praktisk medvirkning fra utlåner, men bør ikke behandles som en komplisert reforhandling av hele lånet.

Lånet regnes likevel ikke som avsluttet før objektet faktisk er levert tilbake og returprosessen er bekreftet etter de vanlige reglene.

### Senere endringer i objektet

Eier eller medeier kan fortsatt redigere selve objektet, men endringer i:

- objektbeskrivelse
- bilder
- utlånsvilkår
- generell tilgjengelighet

skal ikke retroaktivt endre et allerede godkjent lån.

Lånet må derfor beholde nødvendig historisk kontekst om hva partene faktisk godtok da avtalen ble inngått.

Forsinket tilbakelevering, skade og tap behandles etter prinsippene over som avvik i låneforløpet.