# Låneforløpet

> **Status:** Konsolidert visjonsutkast. Hovedforløpet, avvikstilstandene, ansvarlig utlåner og skillet mellom tilgjengelighet og lånestatus er avklart.

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

Brukere som ikke er venner, kan ikke gjennomføre direkte lån utenfor et miljø.

For en direkte låneforespørsel mellom venner må vennskapet fortsatt bestå når forespørselen godkjennes. Hvis vennskapet opphører før godkjenning, skal forespørselen avsluttes og kan ikke senere bli til et lån.

Når et direkte lån først er godkjent og reservert, fortsetter lånet etter de vanlige reglene selv om vennskapet senere opphører. Selve lånet blir da den nødvendige relasjonen mellom partene. Dersom én part i tillegg blokkerer den andre, gjelder de strengere blokkeringsreglene, men allerede eksisterende forpliktelser skal fortsatt kunne fullføres.

Forskjellen mellom de to inngangene gjelder først og fremst **hvordan lånet kan oppstå**, ikke hvordan det vanlige låneforløpet ser ut etterpå.

Når en låneforespørsel er sendt, skal lånet ha samme grunnleggende brukerflate, tilstander, kommunikasjon og returforløp uansett om det ble initiert gjennom et miljø eller direkte mellom venner.

For en miljøbasert forespørsel må låntakeren fortsatt ha nødvendig adgang til opprinnelsesmiljøet når forespørselen godkjennes. Hvis medlemskapet eller annen nødvendig adgang opphører før godkjenning, skal forespørselen avsluttes og kan ikke senere bli til et lån.

Når lånet først er godkjent og reservert, er det derimot selvstendig nok til å fortsette selv om medlemskapet senere opphører.

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

En opplysning om at et objekt ikke er tilbakelevert skal i seg selv behandles som et strukturert låneavvik, ikke automatisk som en modereringsrapport. Ved direkte vennelån kan dette sette eller holde lånet i status **usikker / uenighet** og inngå i lånehistorikken og senere anmeldelse. En separat plattformrapport krever at det også foreligger et mulig plattformproblem utover den konkrete private tvisten.

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

### Endring av vilkår mens forespørselen venter

Utlåner kan endre objektets vilkår mens en låneforespørsel fortsatt venter.

Hvis endringen er vesentlig for det aktuelle lånet, skal forespørselen settes på vent. Låntakeren skal varsles om at vilkårene er endret og må uttrykkelig bekrefte at hen fortsatt ønsker lånet på de nye vilkårene. Først etter denne bekreftelsen kan utlåner godkjenne forespørselen.

Uvesentlige eller rent redaksjonelle endringer trenger ikke stoppe forespørselen.

Prinsippet er at et lån ikke skal kunne godkjennes på vesentlige vilkår som låntakeren ikke har fått anledning til å ta stilling til.

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

1. **Frivillig overføring:** Den ansvarlige utlåneren overfører eksplisitt rollen til en annen registrert medeier som allerede var medeier da lånet ble godkjent.
2. **Kontrollert overtakelse ved utilgjengelighet:** Dersom den ansvarlige utlåneren reelt blir utilgjengelig, kan en annen registrert medeier som allerede var medeier da lånet ble godkjent overta gjennom en særskilt unntaksprosess.

En medeier som først kom til etter at lånet ble godkjent, inngår ikke automatisk i kretsen som kan overta ansvar. Dersom det faktisk er nødvendig å overføre ansvaret til en slik senere medeier, krever dette låntakerens uttrykkelige samtykke.

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

Kjernevisjonen inkluderer **ikke**:

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

Dette hindrer godkjenning av nye kolliderende lån. Et senere lån som allerede var gyldig godkjent og reservert før usikkerheten oppstod, skal derimot ikke oppheves administrativt bare fordi den tidligere overleveringen blir bestridt. Partene i det senere lånet skal varsles om at gjennomføringen kan være truet. Hvis objektet faktisk ikke kan gjøres tilgjengelig til avtalt tid, håndteres det senere lånet etter de vanlige reglene for kansellering eller **ikke gjennomført**.

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

En annen medeier skal ikke tvinges til å overta hele utlånerrollen. Dersom den ansvarlige utlåneren er reelt utilgjengelig, kan en registrert medeier i stedet bekrefte at objektet fysisk er mottatt ved retur uten å bli ansvarlig utlåner for resten av låneforløpet. Denne handlingen skal være snever og sporbar og skal ikke gi medeieren generell tilgang til lånets private kontekst utover det som er nødvendig for å bekrefte mottaket.

Hvis ingen medeier kan eller vil overta eller bekrefte mottak, følger lånet vanlig returavklaring og kan til slutt avsluttes administrativt som uavklart. Objektet forblir sperret for nye lån mens besittelsen er uavklart. Etter en administrativt uavklart avslutning må en gjenværende medeier bekrefte at objektet faktisk er i vedkommendes kontroll før objektet igjen kan gjøres tilgjengelig.

Hvis den ansvarlige utlåneren er eneste eier og dør eller blir varig utilgjengelig, skal ingen annen bruker automatisk overta utlånerrollen eller kontoen. Etter tilstrekkelig verifisering kan en legitim representant få en begrenset, formålsbundet rolle for akkurat det konkrete lånet, blant annet for å avtale praktisk retur og bekrefte mottak. Representanten skal ikke få generell tilgang til den tidligere brukerens konto eller private historikk. Hvis ingen legitim representant kan etableres, skal lånet kunne avsluttes administrativt som uavklart etter de vanlige reglene når videre avklaring ikke er mulig.

### Låntaker dør eller blir varig utilgjengelig mens objektet er hos vedkommende

Hvis låntakeren dør eller blir varig utilgjengelig mens objektet fortsatt kan være i vedkommendes besittelse, skal ingen annen person automatisk overta låntakerrollen eller kontoen.

En melding om forholdet oppretter først en konfidensiell verifikasjonssak. Etter tilstrekkelig verifisering kan en legitim representant, for eksempel for et dødsbo, få en snever og formålsbundet rolle for det konkrete lånet. Rollen kan bare gi den informasjonen og de handlingene som er nødvendige for å identifisere og tilbakeføre objektet og avtale praktisk retur med utlåneren.

Representanten skal ikke få generell tilgang til låntakerens private chatter, miljøer, anmeldelser eller øvrige lånehistorikk.

Når utlåneren faktisk mottar objektet, kan returen bekreftes etter de vanlige reglene. Hvis ingen legitim representant kan etableres eller objektet ikke kan lokaliseres, kan lånet etter tilstrekkelig avklaringsprosess avsluttes administrativt som uavklart. Dette avgjør ikke eiendomsrett, krav mot dødsbo eller erstatningsansvar.

Dødsfall eller dokumentert varig utilgjengelighet skal ikke klassifiseres som no-show, forsinkelse eller annen negativ låntakeratferd. Hvis lånet avsluttes uavklart på dette grunnlaget, skal objektet heller ikke automatisk regnes som fysisk tilgjengelig igjen. Eieren må først bekrefte at objektet faktisk er tilbake i vedkommendes kontroll før nye lån kan gjennomføres.

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

Et nytt lån som allerede ble gyldig godkjent mens systemet viste objektet som returnert, skal ikke oppheves eller omskrives administrativt fordi den tidligere returbekreftelsen senere blir bestridt. Den nye låneavtalen består. Partene i det nye lånet skal varsles om at objektets faktiske besittelsesstatus er blitt usikker. Så lenge usikkerheten består, skal ingen ytterligere kolliderende lån kunne inngås. Hvis det nye lånet senere ikke lar seg gjennomføre, håndteres det etter de vanlige reglene for kansellering eller **ikke gjennomført**, fremfor at Lånbort ensidig bryter avtalen.

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

### Administrativ avslutning som uavklart

Et lån skal ikke kunne bli permanent uavsluttbart bare fordi den parten som normalt må avklare returen ikke lenger svarer eller er varig utilgjengelig.

Etter en tilstrekkelig avklaringsprosess skal et slikt lån kunne **avsluttes administrativt som uavklart**. Dette betyr ikke at Lånbort fastslår om objektet faktisk ble returnert eller hvem som hadde rett.

En slik avslutning skal:

- bevare historikken om partenes opplysninger og at returen aldri ble endelig bekreftet
- tydelig vise at lånet ble avsluttet som uavklart
- frigjøre objektet fra en permanent systemblokkering
- oppheve lånets funksjon som binding som ellers ville blokkert kontolivssyklus eller andre systemprosesser
- ikke brukes som grunnlag for å fastsette juridisk skyld, eiendomsrett eller erstatningsansvar

En administrativt uavklart avslutning kan fortsatt gi begge parter en begrenset anmeldelsesrett for deler av forløpet som faktisk kan vurderes uten å avgjøre den uavklarte tvisten. Anmeldelsen skal ikke brukes til å presentere omstridte fakta som om Lånbort hadde fastslått dem.

Den konkrete prosessen og terskelen for slik administrativ avslutning fastsettes senere.

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

En administrator som selv er part i lånet eller har en tilsvarende direkte interessekonflikt, skal ikke behandle saken som administrator og skal ikke få administratorinnsyn i den andre partens beskyttede saksinformasjon. Hvis det ikke finnes noen habil administrator, er miljømekling ikke tilgjengelig; saken eskaleres ikke automatisk til plattformforvalter av den grunn.

Retten til å bruke miljøets meklingsprosess følger et allerede godkjent miljøbasert lån selv om en part senere ikke lenger er medlem av miljøet. Dette gir ikke tilbake generell medlemsadgang. Administratoren kan avslutte meklingen når det ikke lenger er rimelig eller nyttig å fortsette.

Alvorlige forhold som trusler, trakassering, svindelforsøk, ulovlig bruk eller annet misbruk av Lånbort kan fortsatt rapporteres separat som en modereringssak. Plattformforvaltere behandler i så fall plattformmisbruket, ikke den privatrettslige lånetvisten.

### Direkte lån mellom venner

Ved et direkte vennelån skal det **ikke** finnes noen tilsvarende tvistesak til administrator eller plattformforvalter. Partene har på forhånd godtatt at de selv må håndtere uenigheten.

Lånbort kan fortsatt vise og bevare ordinær historikk om lånet i den utstrekning produktet og datalivssyklusen ellers tilsier, men plattformen skal ikke ta stilling til hvem som har rett i den private tvisten.

## Endringer i et godkjent lån

**Hovedregel:** Endringer som påvirker selve avtalen mellom utlåner og låntaker krever samtykke fra begge parter.

Dette gjelder blant annet:

- endring av avtalt hentetid når tidspunktet er en del av avtalen
- endring av returdato
- forlengelse av lånet
- andre endringer i vilkår som påvirker hva en av partene har sagt ja til

Forslag til slike endringer kan initieres av én part, men får ikke virkning før den andre har godtatt.

### Endringer kan ikke fortrenge andre godkjente lån

En endring eller forlengelse av et eksisterende lån kan ikke gis virkning dersom den kolliderer med et annet lån som allerede er godkjent og reservert på samme objekt.

Utlåner og den nåværende låntakeren kan derfor ikke alene forlenge et lån inn i en periode som allerede er lovet til en annen låntaker.

Hvis den senere låntakeren frivillig godtar å endre sitt eget lån, kan partene først endre dette lånet etter de vanlige reglene for gjensidig samtykke. Når den kolliderende perioden dermed faktisk er frigjort, kan en forlengelse av det første lånet vurderes på vanlig måte.

Lånbort skal ikke tilby en funksjon som lar en bruker ensidig tilsidesette eller bryte et allerede godkjent lån for å gjøre plass til et annet. Partene kan kommunisere privat om mulige endringer, men hver eksisterende avtale må endres gjennom den ordinære samtykkebaserte prosessen før systemet behandler perioden som ledig.

Hvis en låntaker i praksis beholder objektet utover avtalt tid uten at kolliderende reservasjoner først er flyttet eller kansellert på gyldig måte, er dette ikke en gyldig forlengelse i systemet. Det skal håndteres som forsinkelse eller annet relevant avvik.

### Ensidig kansellering før overlevering

Før objektet faktisk er overlevert, kan begge parter ensidig kansellere et allerede godkjent og reservert lån.

Kanselleringen:

- får virkning uten motpartens samtykke
- frigjør reservasjonen umiddelbart
- registreres tydelig i historikken med hvem som kansellerte og når
- varsles til motparten
- trenger ikke en begrunnelse for å være gyldig
- kan gi grunnlag for en begrenset etterfølgende vurdering av selve forløpet

Retten til ensidig kansellering betyr ikke at én part ensidig kan endre tidspunkt, varighet eller andre vilkår og samtidig holde lånet i kraft. Slike endringer krever fortsatt samtykke fra begge.

Etter fysisk overlevering brukes ikke kansellering som mekanisme for å avslutte lånet. Da må objektet tilbakeleveres eller lånet håndteres gjennom de ordinære retur- og avviksprosessene.

Rent praktiske opplysninger kan endres ensidig dersom de ikke endrer selve låneavtalen, for eksempel en presisering om hvor partene skal møtes dersom dette ikke endrer avtalens vesentlige innhold.

### Tidlig retur

Låntaker kan ønske å levere objektet tilbake før avtalt returdato. Dette krever praktisk medvirkning fra utlåner, men bør ikke behandles som en komplisert reforhandling av hele lånet.

Lånet regnes likevel ikke som avsluttet før objektet faktisk er levert tilbake og returprosessen er bekreftet etter de vanlige reglene.

Når ansvarlig utlåner har bekreftet den tidlige returen, avsluttes lånet på det faktiske returtidspunktet. Den gjenværende delen av den opprinnelig reserverte perioden frigjøres og kan brukes til nye lån dersom objektets generelle tilgjengelighet fortsatt dekker perioden og ingen andre godkjente reservasjoner kolliderer. Den opprinnelig avtalte returdatoen beholdes i historikken ved siden av det faktiske returtidspunktet.

### Senere endringer i objektet

Eier eller medeier kan fortsatt redigere selve objektet, men endringer i:

- objektbeskrivelse
- bilder
- utlånsvilkår
- generell tilgjengelighet

skal ikke retroaktivt endre et allerede godkjent lån.

Lånet må derfor beholde nødvendig historisk kontekst om hva partene faktisk godtok da avtalen ble inngått.

Forsinket tilbakelevering, skade og tap behandles etter prinsippene over som avvik i låneforløpet.

## Sikkerhets- og lovlighetsinngrep i godkjente lån

Avtalestabilitet skal ikke hindre Lånbort i å gripe inn når et objekt viser seg å være ulovlig, forbudt etter plattformpolicy eller forbundet med en alvorlig sikkerhetsrisiko.

Hvis et slikt forhold oppdages **før overlevering**, skal et reservert lån kunne stanses administrativt. Dette skal registreres som en særskilt administrativ avslutning, ikke som vanlig kansellering fra en av partene.

Hvis objektet **allerede er overlevert**, skal historikken og det faktiske låneforløpet bevares. Plattformen kan samtidig hindre forlengelse og nye lån, varsle partene og begrense videre fasilitering når sikkerhet eller lovlighet krever det.

Et slikt inngrep gjelder hva Lånbort kan fasilitere. Det skal ikke brukes til å avgjøre private krav mellom partene.
## Blokkering, rapportering og moderering før overlevering

Blokkering mellom partene etter at et lån er godkjent, men før fysisk overlevering, skal ikke i seg selv kansellere lånet. Det eksisterende lånet fortsetter med nødvendige strukturerte handlinger, mens vanlig fri chat stenges etter blokkeringsreglene.

Hvis lånet fortsatt krever praktisk koordinering som ikke rimelig kan dekkes av strukturerte handlinger alene, kan partene få en snever lånelogistikk-kanal for korte meldinger om overlevering, retur, tidspunkt, sted og objektet. Kanalen er ikke ordinær sosial chat og stenges når lånet er avsluttet. Ved trakassering eller særskilt sikkerhetsrisiko kan også denne kanalen stenges, slik at bare strukturerte handlinger og eventuelle administrative prosesser består.

Begge parter beholder samtidig retten til å kansellere ensidig før overlevering. Hvis én av dem ikke lenger ønsker å gjennomføre lånet etter blokkeringen, skal denne ordinære kanselleringsmekanismen brukes.

En rapport eller modereringssak mellom partene er en separat prosess og skal heller ikke automatisk endre lånestatusen med mindre et konkret sikkerhets- eller modereringstiltak faktisk krever dette.

Hvis plattformen administrativt stanser et reservert lån av sikkerhets- eller modereringsgrunner og dette tiltaket senere oppheves, skal den gamle reservasjonen ikke gjenoppstå automatisk. Partene må inngå en ny avtale dersom de fortsatt ønsker å gjennomføre lånet. Dette beskytter mot at en tidligere avsluttet avtale plutselig blir bindende igjen.

Ved plattformsuspensjon av en av partene skal ikke-godkjente forespørsler avsluttes nøytralt og reserverte lån som ennå ikke er fysisk overlevert avsluttes administrativt. Dette skal ikke registreres som ordinær kansellering eller no-show fra den suspenderte brukerens side.

Hvis objektet allerede er overlevert, fortsetter lånet bare med de rettighetene og handlingene som er nødvendige for trygg og kontrollert avslutning. Den suspenderte kan derfor få begrenset tilgang til strukturerte retur- eller mottakshandlinger selv om annen ordinær aktivitet er stanset. Fri kontakt kan begrenses ytterligere når sikkerhetshensyn tilsier det.

## Opprinnelseskontekst skal være stabil

Om et lån er miljøbasert eller et direkte vennelån avgjøres av hvordan den konkrete låneforespørselen ble opprettet.

En forespørsel som oppstår gjennom et objekts publisering i et miljø beholder dette miljøet som opprinnelseskontekst selv om partene allerede er venner eller blir venner senere. Vennskap som oppstår etter at forespørselen er sendt skal ikke gjøre lånet om til et direkte vennelån og skal ikke kunne brukes til å omgå eller endre de rettighetene og personverngrensene som følger av opprinnelseskonteksten.

Et nytt direkte vennelån må initieres som et eget lån gjennom vennskapsrelasjonen, ikke ved å omskrive opprinnelsen til en eksisterende miljøbasert forespørsel.

## Medlemskap og utestengelse etter godkjenning

Hvis en part mister eller blir utestengt fra miljøet etter at et miljøbasert lån allerede er godkjent, fortsetter lånet og de nødvendige lånerettighetene etter de etablerte kontinuitetsreglene. Utestengelsen kan begrense all annen miljøtilgang, men kan ikke brukes til å slette lånehistorikk, opptjente anmeldelsesrettigheter eller nødvendig tilgang til selve låneforløpet.
