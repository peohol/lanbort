> **Historisk dokument:** Dette er det opprinnelige visjonsnotatet og er ikke lenger den autoritative produktvisjonen. Den kanoniske **Produktvisjon v1.0** finnes i [`docs/vision/README.md`](docs/vision/README.md). Ved motstrid gjelder den strukturerte visjonen.

# Introduksjon

Jeg skal lage en ny app kalt Lånbort. Poenget med appen er å stimulere Norges befolkning til å låne bort/dele ting man har med andre.

Det skal ikke være penger involvert i appen – det er altså ikke snakk om en app der man leier ut eller selger ting.

Visjonen er at man skal stimulere til gjensidig tillit og en kultur der ikke alle trenger å eie alt selv. Ting man f.eks. bare trenger noen få ganger i livet, er det bedre at man låner enn at man kjøper. Dette skal forhindre overforbruk og være økonomisk gunstig. I tillegg er en tillitskultur positivt for samfunnet generelt.

# Distribusjon av appen

Innledningsvis skal appen være nettleserbasert (med UI tilpasset både desktop og mobil). Men fra start skal appen utvikles med tanke på at den etter hvert kan bli en mobilapp på Android og iOS; vi bør altså rigge systemet så det enkelt lar seg konvertere til en form som egner seg for mobilapper. Vi bør blant annet planlegge for at appen skal kunne gi brukeren varsler på mobilen.

# Repo-eier og KI-agenter – hvem skal gjøre hva?

Jeg, eieren av repoet, er *ikke* programmerer eller systemutvikler. Anse meg som en ren vibecoder som aldri skal se på eller ta stilling til kode – jeg skal helst jobbe på et så høyt abstraksjonsnivå som mulig. Jeg erkjenner at jeg iblant må gjøre enkelte manuelle operasjoner som KI-agenter ikke kan gjøre for meg, bl.a. for å koble ulike tjenester sammen (GitHub, Vercel, Supabase, Resend osv.). Når jeg må gjøre slikt, ønsker jeg at KI-agentene jeg samarbeider med (Claude Code, ChatGPT, Codex) skal gi meg svært konkrete steg-for-steg instrukser og ikke anta at jeg vet hvordan jeg gjør noe som helst fra før. Jeg ønsker aldri å bli informert om intrikate tekniske detaljer som det uansett er en KI-agent som skal håndtere. Jeg vil bare ha konsise, lettfattelige tilbakemeldinger om det jeg faktisk har interesse av å vite. Dette bør føres inn i CLAUDE.md fra start.

Min rolle skal først og fremst være å ha visjonen; å formidle til KI-agenter hva jeg ønsker; å gjøre menneskelige tester i UI for å bekrefte om endringer fungerer i praksis eller ikke og å oppdage ting som kan forbedres. Jeg tenker at mitt arbeid trolig aldri vil være "over", men at appen kontinuerlig forbedres over tid, uten ende.

# CLAUDE.md

Se på Anthropics offisielle anbefalinger for bruk av CLAUDE.md i hovedmappen og undermapper. Sørg for at særlig filen i hovedmappen er solid fra start, og legg inn mekanismer som beskytter filen mot degenerasjon over tid og holder den frisk, oppdatert og nyttig. Det er spesielt viktig å holde filen kort og effektiv og unngå å bruke den til dokumentasjon og loggføring som ikke trenger å leses ved hver kjøring. Se også forrige seksjon for retningslinjer for hvordan jeg ønsker at agenter skal interagere med meg – det må også med her.

# Varsler, chat og saker

Appen skal ha et eget varselsystem i UI slik at brukere får beskjed når det skjer hendelser som er relevante for dem. Jeg kommer til å nevne hva dette kan være underveis i dette dokumentet. Antall nye varsler kan gjerne vises som en lett synlig badge på ikonet til varselmodalen/varselsiden.

I tillegg skal brukere kunne kommunisere med hverandre i en chat med direktemeldinger. Chaten skal ikke bare inneholde fritekstmeldinger, men også strukturerte systemmeldinger som kan være interaktive (med knapper for å bekrefte/avvise forespørsler e.l.). Eksempler på dette underveis.

I spesielle tilfeller kan det opprettes saker, f.eks. ved konflikter mellom brukere eller admins. Det skal da være mulig å kommunisere via et separat meldingssystem som ikke er chat; ofte kan det være snakk om at man får skrive én melding, og deretter må vente på respons før det eventuelt åpnes for at man kan skrive mer. Eksempler underveis.

# Brukernivåer

Appen skal ha tre brukernivåer:

1. Vanlige brukere. Kan bruke alle vanlige funksjoner i miljøet (hva er miljø er, forklares senere), men kan ikke gjøre endringer i miljøets innstillinger.
2. Administratorer (videre kalt admins, men jeg ønsker at «administratorer» skal brukes i det faktiske UI. Har alle rettigheter vanlige brukere har i miljøet, og kan i tillegg gjøre endringer i miljøets innstillinger.
3. Utviklere (i første omgang meg – altså repo-eieren Peder). Har alle rettigheter uten unntak. Jeg kan blant annet slette miljøer jeg ikke selv er medlem av eller admin i, og ta endelige beslutninger når det oppstår konflikter som admins i et miljø ikke klarer å løse seg imellom.

Mer om de ulike rollene underveis.

# Miljøer

Lånene skal skje via såkalte miljøer (grupper; på forhånd beklager hvis jeg glemmer meg og kaller et miljø for en «gruppe» e.l.; anta at «gruppe» betyr miljø). Brukere kan opprette miljøer eller bli medlem av miljøer andre har opprettet.

Miljøer kan være

1. **åpne** (alle kan finne miljøet via søk eller direktekoblinger og melde seg inn uten invitasjon)
2. **lukkede** (kan finnes via søk eller lenkes til, men man får ikke innsyn eller medlemsskap uten admingodkjent innmeldingsforespørsel eller invitasjon fra en admin)
3. **skjulte** (kan ikke ses eller nås for ikke-medlemmer; invitasjon fra admin er eneste måte å bli medlem på).

# Opprettelse og invitasjon til miljøer

Alle brukere skal kunne opprette miljøer, som de da selv blir admins av. Admins kan invitere andre til å bli medlemmer via e-post eller i appen; hvis man takker ja til en invitasjon fra en admin, blir man automatisk medlem uansett hva slags miljø det er snakk om (åpent, lukket, skjult).

For vanlige medlemmer gjelder følgende:

1. De kan **invitere** hvem som helst til et åpent miljø; siden hvem som helst kan melde seg inn i åpne miljøer, kreves ingen admingodkjenning, og den inviterte blir medlem ved å takke ja. (Den inviterte kan også bli medlem uten å takke ja til invitasjonen direkte, men ved å selv melde seg inn direkte på miljøets side; selv om invitasjonen ikke ble besvart, skal den forsvinne hvis den inviterte melder seg inn selv.)
2. De kan **tipse** hvem som helst om lukkede miljø, men den inviterte blir da simpelthen henvist til miljøsiden og må legge inn forespørsel om å få bli medlem; forespørselen må godtas av en admin for at medlemskapet skal innvilges. Jeg foreslår å legge inn tipsing som en funksjon i appen som er analog med invitering, men som vises for vanlige medlemmer i lukkede miljøer spesifikt.
3. De har ingen myndighet i appen til å tipse om skjulte miljøer. Hvis de prøver å omgå dette og sender noen en direktelenke til et skjult miljø, vil mottakeren simpelthen komme til en «Siden finnes ikke eller kan ikke nås»-side. For å bli medlem av et skjult miljø, MÅ man ha blitt invitert av en *admin* – ellers får man ikke engang vite at miljøet eksisterer.

Åpne og lukkede miljøer skal ha kopierbare URL-er slik at hvem som helst kan invitere/tipse ved å sende en lenke. Skjulte miljøer må håndteres på en annen måte som gjør at det kun vises en generisk, uspesifikk URL når man er inne på dem, for å forhindre ethvert forsøk på å dele gruppen med andre.

# Admin-status og eierskap

Admin kan invitere andre medlemmer i et miljø til å bli admin. De inviterte må takke ja til invitasjonen for at adminstatus skal bli et faktum.

Alle admins skal ha samme rettigheter/muligheter/myndighet i appen, med ett mulig unntak: den som oppretter miljøet (eieren), skal kunne velge om andre admins skal få tilgang til å slette miljøet eller midlertidig skjule det fra appen; eiren kan sånn sett ha disse spesifikke mulighetene som andre admins ikke har – men som andre admins kan innvilges hvis eieren ønsker det.

Eieren kan velge å bemyndige én eller flere andre admins denne rettigheten, eller sette en global innstilling som gjør at alle admins har den automatisk.

Hvis det finnes minst én annen admin, skal en admin kunne frasi seg adminstatus (og dermed miste den helt til hen ev. blir invitert til å bli admin igjen av en annen admin) og eventuelt melde seg ut av miljøet. Hvis man er eneste admin, kan man ikke frasi seg adminstatus eller melde seg ut av miljøet; det må alltid være minst én admin. Men vi kan f.eks. legge inn en funksjon slik at en admin kan melde sin fratreden til miljøet og la det være førstemann til mølla for de andre medlemmen å overta rollen (den første som melder seg, blir ny admin). Fristen kan ta være f.eks. 30 dager; hvis ingen melder seg, slettes miljøet automatisk.

Eieren kan overføre eierskap til en annen admin, men det kan aldri være mer enn én eier. Eieren kan også velge å frasi seg eierskapet uten å overføre det til andre; i dette tilfellet vil miljøet få status som eierløs. Eierløse miljøer må fortsatt ha minst én admin. Hvis det kun finnes en eier, men ingen admins, får eieren ikke lov til å frasi seg eierskap uten å oppnevne enten en ny eier eller minst én admin først.

# Skjuling og sletting av eierløse miljøer

En admin i et eierløst miljø kan foreslå at miljøet skjules; alle admins vil få beskjed i admin-UI om forespørselen, og den innvilges umiddelbart hvis én annen admin godkjenner forslaget (forespørselen forsvinner da for øvrige admins).

En admin kan også foreslå at miljøet slettes; dette innvilges i utgangspunktet hvis ALLE admins i miljøet godkjenner forespørselen – men viktig: admins får nøyaktig 7 dager på seg til å svare, ellers kan sletteforslaget innvilges uten deres godkjenning. For å presisere: en eierløs gruppe blir slettet hvis alle admins *som har respondert innen 7 dager*, har godkjent. Hvis én eller flere admins avviser forespørselen om sletting, blir miljøet ikke slettet.

## Bestridelse av avvist sletteforespørsel

Hvis en admin som ønsker at miljøet skal slettes, ønsker å bestride utfallet når ikke alle admins godkjente og sletteforespørselen ble avvist, kan hen opprette en sak som sendes videre til utviklergruppen (som innledningsvis vil bestå av meg, repo-eier, så jeg skriver "jeg" videre). Senere kan det kanskje bli flere utviklere som kan behandle saker; åpne for denne muligheten fra start. Jeg tenker da at alle utviklere vil få beskjed i utvikler-UI-et om at en sak har blitt opprettet, og den første utvikleren til å påta seg oppdraget, tar saken videre. Saken vil da forsvinne fra de andre utviklernes UI, men den vil loggføres slik at alle utviklere senere kan få innsyn hvis de ønsker.

Ifm. slike saker skal alle admins få 7 dager på seg til å skrive hvorfor de mener at miljøet bør eller ikke bør slettes. Etter 7 dager blir de ulike admins innspill samlet i en egen konflikt-UI-flate der jeg kan lese alle innspill på ett sted. Jeg skal da kunne sende svar til hver og én av dem, og/eller til alle samtidig. Admingruppen skal ikke få innsyn i hva andre admins har skrevet, fordi fravær av inter-admin-kommunikasjon på dette stadiet gir alle mulighet til å si sin genuine mening ufarget av andres meninger, hvilket reduserer støy og bias i beslutningsprosessen. Etter å ha sendt tilbakemeldinger til én admin, skal den adminen kunne skrive en ny oppfølgingsmelding; denne frem-og-tilbake-korrespondansen kan skje så mange ganger som helst inntil jeg bestemmer at saken er lukket. Hvis jeg sender en melding til alle på én gang, kan jeg velge om jeg ønsker en ny svarrunde eller ikke. Når som helst i prosessen kan jeg velge å 1) slette gruppen med en siste beskjed til admins, eller 2) ikke slette gruppen med en siste beskjed til admins. Hvis jeg ikke sletter gruppen, skal det ikke være mulig for admins å opprette en tilsvarende konfliktforespørsel til meg før det har gått 30 dager.

# Opprettelse, utarbeidelse, redigering og medeierskap av utlånsobjekter

## Opprettelse

Brukere kan opprette utlånsobjekter (heretter kalt "objekter") direkte i sin personlige brukerflate. De blir ikke automatisk synlige i miljøene brukeren er medlem av. Brukeren kan deretter velge hvilke av de innmeldte miljøene objektet skal vises i. Brukeren skal også kunne opprette objekter via et miljø. Dette er ikke egentlig annerledes enn å opprette det i brukerflaten, men innebærer simpelthen at objekt-opprettelsessystemet kommer opp som en modal og fra start vises i det aktuelle miljøet. Men objektet havner uansett i brukerens privatr brukerflate, og er ikke låst til miljøet det ble opprettet i. Brukeren kan senere redigere objektet via sin brukerflate akkurat som objekter opprettet direkte i brukerflaten eller i andre miljøer, og velge å skjule objektet fra det aktuelle miljøet eller å vise det i andre miljøer. Det er altså samme system som brukes uansett hvor i appen man var da man initierte opprettelsen av et objekt, men systemet kan enten vises i brukerflaten eller som modaler i miljøer. De to visningsmåtene skal bruke samme underliggende kode, og ingenting skal være duplisert eller hardkodet til én av dem.

## Utarbeidelse

Når man oppretter et objekt, skal man minimum oppgi følgende:

1. En tittel som forteller klart og tydelig hva det er man låner bort
2. En kategori: her kommer jeg senere til å utarbeide en omfattende liste med kategorier og underkategorier man kan velge mellom. Man MÅ velge én av dem. Man kan ikke opprette egendefinerte kategorier, men "Annet" kommer til å være et valg hvis man ikke finner noe annet som passer.
3. En mer detaljert beskrivelse av objektet i fritekst, som blant annet kan inneholde (listen kan utvides senere):
   1. merke/modell
   2. bruksområde
   3. egenskaper
   4. størrelse/vekt/dimensjoner
   5. tilstand og kjente mangler/defekter/problemer
4. Tidsperioden(e) objektet er tilgjengelig for utlån via dato-inputs.
   1. Man kan velge kun en fra-dato (fra i dag er standardvalget) uten noen definert sluttdato.
   2. Man kan også opprette en periode med fra- og til-dato.
   3. Man kan også opprette flere tidsperioder med opphold mellom på en dynamisk måte. Den siste perioden kan være en fra-dato uten slutt-dato, men alle perioder før den siste må ha både fra- og til-datoer. Det kan ikke være overlapp mellom to fra-og-til-intervaller. Hvis to intervaller opprettes og det første slutter dagen før det neste begynner, skal brukeren informeres om at intervallene ikke har noe opphold mellom seg, og vil bli sammenslått til ett intervall. Det må altså være minst ett døgn mellom intervallene (for eksempel fra 1. til 3. januar og fra 5. januar og utover; hvis man oppgir 1. til 3. januar og 4. januar og utover, er det vanskelig å tolke dette som noe annet enn at objektet faktisk er tilgjengelig fra 1. januar og utover).

Man kan også oppgi følgende valgfrie informasjon (kan utvides etter hvert):

- Mellom 1 og 5 bilder av det man låner bort
- Hvilke betingelser som gjelder (hvor lenge man kan akseptere å låne det bort; hva som skal skje hvis objektet blir ødelagt, forsvinner eller lignende; hva objekter skal og ikke skal kunne brukes til; eller annet)

## Redigering

Man skal når som helst kunne gå tilbake og redigere all informasjon man oppga ved opprettelse/utarbeidelse via et identisk utseende UI som det man brukte ved opprettelse. Medlemmer som har sendt forespørsler om å få låne eller abonnerer på objektet, skal få varslel når objektet har blitt redigert. Hvis objektet redigeres på innen 2 timer fra første redigering, skal det ikke sendes nye varsler, men det kan sendes nye varsler annenhver time eller sjeldnere ved nye redigeringer.

## Medeierskap

Etter at man har opprettet et objekt, kan man (hvis man ønsker) invitere andre brukere til å bli medeiere av objektet. Hvis de godtar invitasjonen, havner objektet på deres bruker på lik linje med den som opprettet det, men i en kategori for medeide/sameiede objekter. Alle medeiere kan redigere objektet på vanlig måte, men medeiere vil da bli varslet om at det er gjort endringen, og kan via varselet eller objekt-siden (hvor det også opplyses om at objektet har blitt redigert, og av hvem og når) gå inn på en side der man ser objektsiden med endringer markert (slettet tekst eller slettede strukturerte opplysninger markeres rødt og gjennomstreket, ny tekst eller nye strukturerte opplysninger markeres grønt). Fra denne siden kan alle medeiere velger å gjenopprette forrige versjon hvis de ikke liker de nye endringene, eller de kan simpelthen gå inn og gjøre egne endringer.

Alle medeiere skal kunne legge ut objektet i sine miljøer.

## Hva skjer når et objekt befinner seg i flere miljøer samtidig?

Objekter tilhører brukeren (og eventuelle medeiere) - ikke et spesifikt miljø. Det samme objekter kan derfor vises i så mange miljøer som helst, og det skal vises med nøyaktig samme data (info, tilgjengelighetsperioder osv.) i alle. Hvis et objekt er lånt ut, uansett hvilket miljø lånet skjedde via, skal det vises som utlånt (se Lånestatus senere i dokumentet) i alle miljøer og for alle medeiere. Alle medeiere kan dessuten bekrefte at et utlånt objekt er tilbakelevere; dette kan f.eks. være nyttig hvis man får tilbake et objekt som ektefellen lånte ut.

# Låning

## Låneforespørsler

Medlemmer av miljøet/miljøene hvor objektet er publisert for utlån, kan gå inn på objektsiden, lese/se på bilder, og be om å få låne det. Man får da opp en forespørselsmodal der man må oppgir når man ønsker å låne det. "Så snart som mulig" er standardvalget, men man kan også oppgi en spesifikk dato eller et datointervall (fra- og til-dato).

Man må også legge inn hvor lenge man ønsker å låne objektet, slik at det er definert på forhånd når det skal leveres tilbake.

I tillegg må man legge inn en melding til utlåner i fritekst. Det etableres da en chat mellom utlåner og lånetaker der man kan snakke videre med hverandre.

Hvis utlåner godkjenner forespørselen, vil låneperioden registreres på objektet, som dermed gjøres utilgjengelig for utlån i perioden.

## Tilbakelevering

### Bekreftelse av tilbakelevering

Ved tilbakelevering av et objekt skal utlåner bekrefte at det er levert tilbake. Lånetaker skal også bekrefte at hen har levert det tilbake, men så lenge det kun er lånetaker som har bekreftet, får objektet inntil videre en usikker status (se neste seksjon). Objektet får ikke status som tilbakelevert før utlåner har bekreftet. Utlåner kan bekrefte uten at lånetaker gjør det, og tilbakeleveringen blir da endelig bekreftet. Når tilbakeleveringen er bekreftet av utlåner, trenger ikke lånetaker å gjøre det (og valget om å bekrefte skal også forsvinne fra lånetakers UI).

### Buffer før bekreftelse trer i kraft

Etter at utlåner (og ev. lånetaker) har trykket bekreft, skal det legges inn buffer på 30 sekunder før bekreftelsen faktisk trer i kraft. Før de 30 sekundene er gått, kan ingen andre enn den som har bekreftelsen, se at bekreftelsen er sendt inn. Grunnen til at dette skal eksistere, er at det skal være mulig å angre hvis man for eksempel kom borti bekreft-knappen ved en feil, eller oppdager at man har bekreftet på feil objekt, eller lignende. Man får opp en indikator/nedtelling som viser hvor lenge som er igjen av bufferperioden. Man kan velge å overstyre bufferen ved å trykke på "Bekreft umiddelbart" e.l.

### Tilbakekalling av bekreftelser

Etter fullført bekreftelse (når de 30 sekundene er utløpt) kan utlåner (og ev. lånetaker) likevel kalle tilbake bekreftelsen. Det kan være ulike grunner til at man ønsker dette. Hvis utlåner trekker tilbake bekreftelsen, skal lånetaker får varsel om dette. I chatten skal det komme om en strukturert melding om at lånetaker har kalt tilbake bekreftelsen, der utlåner må svare på om hen har levert tilbake objektet eller fortsatt har det. Hvis lånetaker svarer at hen fortsatt har objektet, er det ingen konflikt: lånetaker gjorde rett i å tilbakekalle bekreftelsen. Hvis lånetaker svarer at hen har levert tilbake objektet, får utlåner tilbake en strukturert melding om dette. Utlåner får da beskjed om at lånetaker mener å ha levert tilbake objektet, og at det synes å være en konflikt. Utlåner kan da velge å endre mening (dvs. bekrefte tilbakelevering likevel) eller å åpne en sak. Hvis det åpnes en slik sak, vil saken bli tilgjengelig for admins i miljøet hvor lånet skjedde, og for utviklere. Utviklere skal i utgangspunktet ikke ha noe med slike saker å gjøre, men skal likevel ha muligheten til å få innsyn; utviklere skal ikke få varsler om slike saker, så innsynet skjer eventuelt ved at utvikler manuelt går inn i et register og finner saken. I saken vil utlåner og lånetaker begge bli bedt om å skrive en melding i fritekst der de forklarer sin versjon av saken. Begge får mulighet til å skrive én melding i første omgang, og de to partene får ikke lese hverandres meldinger. Admin kan derimot lese begge meldinger, og kan gi separate, private svar til hver av partene. Admin kan da velge om de skal få mulighet til å svare eller ikke. Slik kan kommunikasjonen i prinsippet fortsette ubegrenset. Admin kan til slutt velge å lukke saken med en avsluttende melding til begge parter. Det er ikke sikkert admin faktisk kan løse konflikten, men saken skal uansett kunne lukkes når admin mener det ikke er mer som kan gjøres.

### Manglende bekreftelse etter utløpt låneperiode

Etter at det avtalte tidsintervallet for lån er utløpt, vil både lånetaker og utlåner få et varsel der de bes om å bekrefte om objektet er levert tilbake. Hvis ingen av partene bekrefter, vil objektet bli stående som utilgjengelig.

## Lånestatus

Objekter skal kunne ha følgende statuser (som vises på objektsiden og i miljøet):

- Tilgjengelig \[grønn indikator\] (utlånsperioden er fortsatt aktiv; ingen aktive lån pågår; eventuell tilbakelevering har blitt bekreftet av utlåner)
- Lånt bort \[rød indikator\] (aktivt lån pågår)
- Utiljengelig \[grå indikator\] (utenfor utlånsperioden)
- Usikker \[gul indikator\] (tilbakelevering har blitt bekreftet av lånetaker, men ikke av utlåner)

## Skjuling av objekter som har vært utilgjengelige lenge

Hvis et objekt har hatt status som utilgjengelig i minst 30 dager, skal objektet fjernes fra miljøene det har vært publisert i. Brukeren som er utlåner av objektet, skal fortsatt ha det i sin private brukerflate under en seksjon for deaktiverte objekter. Derfra kan brukeren manuelt reaktivere det for at det skal vises i miljøene igjen. Brukeren må da opprette en ny periode for tilgjengelighet.

# Anmeldelse av utlånsopplevelsen

Etter at et utlån er fullført, skal begge parter kunne avgi en flerpunkts, kvantitativ anmeldelse/omtale av den andre. Her kan du gjerne foreslå hva som bør med eller endres hvis du tenker at systemet mitt kunne vært bedre.

Jeg ser for meg en skår fra 1 til 5 på hvert punkt. Hvis man gir 5/5, tenker jeg at det er implisitt at man er fornøyd med alt, slik at det ikke er nødvendig å gå i detalj på de øvrige punktene.

Hvis man gir 4/5 eller mindre, MÅ man oppgi hva som kunne vært bedre/hva man var misfornøyd med.

## Fra utlåners perspektiv

Utlåner skal vurdere

1. om låntaker hentet objektet til avtalt tid
2. om låntaker leverte tilbake objektet til avtalt tid
3. om objektet var i rimelig god stand (ikke verre enn det normal bruksslitasje skulle tilsi) etter tilbakelevering
4. hvordan kommunikasjonen med medlåntaker var

Og til slutt valgfri en fritekstbeskrivelse av hvordan lånet foregikk/opplevdes.

## Fra låntakers perspektiv

Låntaker skal vurdere

1. om utlåner leverte objektet til avtalt tid
2. om utlåner var tilgjengelig for tilbakelevering til avtalt tid
3. om objektet var i like god stand som beskrevet/utlåner ga uttrykk for
4. hvordan kommunikasjonen med utlåner var

Og til slutt en valgfri fritekstbeskrivelse av hvordan lånet foregikk/opplevdes.

## Mekanisme for å forhindre misbruk av anmeldelsessystemet

Noen mennesker er urimelig strenge i sine anmeldelser og gir mer negative tilbakemeldinger enn fortjent. Dette kan vekke mistanke om at de det gjelder ikke har en negativitetsbias og ofte ikke gir pålitelige vurderinger. Det vil være synd om brukere som stort sett får gode vurderinger, skal få sin tillit svekket pga. en ufortjent negativ tilbakemelding.

Alle anmeldelser man gir og mottar, lagres på brukeren. Appen fører statistikk over alle anmeldelser. Over tid vil vi få data på hva slags anmeldelser folk typisk gir, både innenfor et gitt miljø, i et visst geografisk område, og i appen før øvrig.

Når vi har tilstrekkelig mye data (det trenger sannsynligvis ikke å være enorme mengder), skal brukere få private tilbakemeldinger i sitt dashboard på hvordan deres anmeldelser ligger an i forhold til andres hvis de er uvanlig dårlige. Poenget er først og fremst å gjøre brukerne oppmerksom på et mønster de kanskje ikke er spesielt bevisst på. Men hvis en bruker er langt mer negativ enn folk flest, vil det få en praktisk betydning i den forstand at dere anmeldelser vil vektes mindre slik at de påvirker andres score mindre.

- Hvis sentraltendensen ligger under 50-persentilen: "Sammenlignet med andre brukere er dine tilbakemeldinger gjerne noe mer negative." (Eller gjerne en mer elegant formulering hvis du kommer på en.)
- Under 25-persentilen: "Sammenlignet med andre brukere er dine tilbakemeldinger er klart mer negative."
- Under 10-persentilen: "Sammenlignet med andre brukere synes dine tilbakemeldinger i det store og hele å være uforholdsmessig negative. Dine anmeldelser vil fra nå av tilegnes mindre vekt, slik at de påvirker andre brukere mindre."
- Under 1-persentilen: kanskje en egen, enda tydeligere tilbakemelding, og at konsekvensen er at anmeldelsene vektes svært lite eller ingenting.

# Brukerskår

Vi skal ha et skåringssystem. Brukeren skal ha skårer med flere dimensjoner. Du kan gjerne foreslå andre navn og mekanismer på skårene, dette er bare mine forslag.

1. Gavmildhet: jo flere objekter man låner bort og jo flere utlån kan har gjennomført, jo høyere skal gavmildhetsskåren bli.
2. Pålitelighet: en vektet samleskår for anmeldelsene man har fått av andre (se forrige seksjon om hvordan noen brukere får mindre påvirkningskraft), og som kanskje ikke bare er et rent vektet gjennomsnitt, men også er noenlunde robust mot uteliggere.
3. Og kanskje en egen skår som handler om hvor mye man har lånt? Jeg tenker at det å låne i seg selv er positivt, fordi man gjør dette i stedet for å kjøpe inn nye ting til seg selv.

# Konsekvensen av hvordan man anmeldes av andre

Man skal kunne velge å filtrere bort brukere som har lavere pålitelighet enn man kan tolerere. Man skal ha én innstilling for hvor høy skår andre må ha for å se deg og objektene dine, og en annen for høy skår andre brukere må ha for at du skal se dem og objektene deres.

Kanskje bør vi også ha et eget varslingssystem som varsler utviklere hvis personer har fått svært mange og overveiende negative tilbakemeldinger over tid. Her er jeg åpen for forslag.

# Abonnere på objekter

Brukere skal kunne abonnere på ethvert objekt som er synlig for dem i Lånbort, enten det er i et miljø eller direkte hos en annen bruker. Abonnering gjør at man kan holdes oppdatert (gjennom varsler) på status på objektet, slik at man får vite når det er tilgjengelig osv.

# Chat med andre brukere

## Chat med andre vanlige brukere

Brukere skal kunne chatte med hverandre. Chatter skal lagres hos brukerne det gjelder, og kunne slettes av brukerne hvis de vil (slettes bare for brukeren som sletter, ikke for den andre). Chatter kan åpnes på flere måter:

- Ved å klikke på chat-knapper eller en popovermeny e.l. som står ved siden av navnene i listen over brukere i et miljø (som alle medlemmer av miljøet kan se)
- Ved å sende en hendvendelse om et konkret objekt via objektsiden; dette åpnes i den samme chatten som i forrige punkt, men med et strukturert melding som viser utlåner at det gjelder dette objektet
- Ved å bli venner med andre brukere (mer om dette senere), man kan nå hverandre også utenom miljøene, via en venneliste i brukerflaten
- Ved å gå inn i en tidligere chat og fortsette samtalen

## Chat med admins

Brukere skal kunne sende en melding til admins i et miljø. Dette er en annen type meldingssystem enn om brukeren åpner en chat med en bruker som også er en admin. I dette tilfellet åpnes en chat der alle miljøets admins er med. En admin kan da velge å "ta" chatten slik at bare den aktuelle adminen får varsler om nye meldinger i chaten (de andre kan fortsatt se chaten, men trenger da ikke å forstyrres av nye notifications). Hvis det bare er én admin, skal adminchatten fortsatt ikke lagres som en privat samtale mellom de to brukerne. Admins må også kunne fungere som vanlige brukere som låner eller låner bort objekter, og når en admin chater med en annen bruker i denne sammenhengen, er det ikke en "chat med admin" men "chat med et annet medlem (som tilfeldigvis også er admin, uten at det spiller noen rolle i denne sammenhengen)". Chat med admins må derfor ha en egen inngangsport i miljøet som ikke er via medlemslisten eller et objekt.

# Opprettelse av miljøer

Når en bruker oppretter et miljø, må/kan en del opplysninger oppgis:

1. Miljøets navn (må være unikt og ikke eksistere fra før) \[påkrevd\]
2. Om miljøet skal være åpent, lukket eller skjult \[påkrevd\]
3. Miljøets geografiske lokalisasjon med følgende underpunkter \[valgfritt, men for å velge kommune og ev. bydel, må man ha valgt et fylke først; det går an å bare velge fylke hvis man ønsker et bredere omfangsområde\]:
   1. Fylke (fra en liste over fylkene i Norge)
   2. Kommune (fra en liste over kommunene i fylket valgt i forrige punkt)
   3. Bydel (vises hvis en av kommunene vi har API-data for bydeler på, er valgt; se info om API-ene vi skal bruke, nedenfor). Hvis valgt kommune ikke har API-data på bydeler, skal bydel-listen ikke vises i UI.
   4. Eventuelt et punkt eller en sirkel med egendefinert radius på et kart fra Google Maps (krever ikke at man velger fylke eller noe annet først).
4. Målgruppe (hvem miljøet egner seg eller er ment for, f.eks. beboere i et bestemt borettslag, ansatte på en bestemt arbeidsplass, medlemmer av et idrettslag osv. osv. - mulighetene er uendelige - oppgis i fritekst) \[valgfritt\]
5. Hva slags objekter miljøet fokuserer på (f.eks. verktøy, sportsutstyr, barneutstyr, kjøkkenutstyr, klær - oppgis i fritekst) \[valgfritt\]
6. Eventuelle andre opplysninger eller føringer for miljøet (fritekst) \[valgfritt\]

Foreslå gjerne forbedringer eller tillegg til det jeg har foreslått.

# API-er brukt for fylker, kommuner og bydeler.

Lister over fylker og tilhørende kommuner skal importeres live fra Kartverkets API (https://api.kartverket.no/kommuneinfo/v1/). Liste over bydeler for et utvalg av kommuner skal hentes live fra et annet API (https://data.norge.no/nb/datasets/44f30e8d-b653-4463-9e78-73aa7fbcfdf0/bydelsinndeling).

# Invitasjon av andre til miljøer

## Invitasjon til åpne miljøer

Invitasjon til et åpent miljø kan skje på minst tre måter:

1. Man sender en e-postinvitasjon via miljø-UI-et (fyller inn e-post og trykker inviter). Særlig egnet hvis personen man inviterer, ikke har en bruker på Lånbort fra før eller man ikke er venn med vedkommende i appen fra før.
2. Inviterer en man er venn med i Lånbort fra før ved å velge dem fra/søke dem opp i en liste over venner i miljø-UI-et. Mer praktisk for mottakere som allerede har brukere og er venner med den som inviterer.
3. Sender URL til miljøet til mottakeren utenfor appen; mottakeren må da selv melde seg inn på samme måte som om hen hadde funnet miljøet ved å søke.

## Invitasjon til lukkede miljøer

Invitasjon til lukkede miljøer skjer på samme måte; forskjellen er at mottakeren ikke simpelthen kan takke ja til invitasjonen, men må be om å få bli medlem, og en admin må godta. Unntaket er hvis en admin inviterer via UI eller sender en spesiellenke som viser til en etablert admininvitasjon; da er admingodkjenning forhåndsgodkjent i systemet.

## Invitasjon til skjulte miljøer

Invitasjon til skjulte miljøer kan kun gjøres av en admin via UI (sende invitasjon til e-post eller invitere en man allerede er venn med i Lånbort). Siden skjulte miljøer ikke har noen URL, er det teknisk umulig å invitere ved å sende en URL.

# Oppdagelse av miljøer

Åpne og lukkede miljøer (men IKKE UNDER NOEN OMSTENDIGHETER skjulte!) skal kunne søkes opp i UI. Man kan gjøre fritekstsøk, der de mest kompatible miljønavnene vises først, og deretter treff fra de andre opplysningsfeltene til miljøet (se Opprettelse av miljøer).

Man kan også navigere seg frem til miljøer ved å velge fylke, og ev. by og bydel hvis tilgjengelig. Man får da opp en liste over alle miljøer innenfor den valgte geografiske lokalisasjonen.

Man kan også velge en sirkel med egendefinert radius på kartet (igjen basert på Google Maps), og får da opp alle miljøer som

1. er innenfor den definerte sirkelen
2. har en definert sirkel (se Opprettelse av miljø) som helt eller delvis overlapper med brukerens egendefinerte sirkel

Kom gjerne med forslag til flere praktiske måter å avgrense hvilke treff man får opp. Foreslå også hvordan vi kan få på plass selve kartsystemet.

# Innmelding i miljøer

Se "Invitasjon av andre til miljøer"; en del er allerede spesifisert. Kort oppsummert: brukeren kan melde seg inn i åpne miljøer direkte, men må be om å få bli medlem og godtas av en admin for å bli medlem av en lukket gruppe. Skjulte grupper skal ikke kunne oppdages, og kan kun nås via invitasjon.

Admins i et miljø kan definere (via fritekst, ikke via forhåndsdefinerte strukturerte kategorier) i miljøets innstillinger (som settes allerede når miljøet opprettes, eller på et senere tidspunkt; skal kunne redigeres når som helst) om brukere må oppgi visse typer informasjon ved innmelding/innmeldingsforespørsel. Dette kan f.eks. være adressen eller leilighetsnummer i borettslaget miljøet tilhører, medlemsnummer i en organisasjon e.l. Krav om disse opplysningene kan stilles enten det er et åpent, lukket eller skjult miljø. Brukeren må skrive noe før medlemsskapet blir et faktum.

- For åpne grupper skrives denne informasjonen umiddelbart etter at man har klikket på innmeldingsknappen, og den faktiske innmeldingen trer i kraft først etter at man har fylt inn noe.
- For lukkede grupper skrives informasjonen rett etter at man har forespurt innmelding; dette gir admins mulighet til å vurdere informasjonen før medlemskap innvilges. I UI-et admins bruker for å vurdere forespørsler, kan de sende en melding tilbake til brukeren (i det separate systemet, ikke i chat) og be om mer info; brukeren må da svare på meldingen; dette kan gå frem og tilbake helt til admin enten godtar eller avviser forespørselen. Admin kan velge å avvise forespørselen én gang; brukeren kan da sende en ny forespørsel om å bli medlem. Admin kan også avvise forespørselen og samtidig utestenge brukeren fra gruppen permanent; den vil da ikke lenger vises i søk hos brukeren, og hvis brukeren forsøker å nå gruppen via URL, vil hen simpelthen bli navigert til Lånbort sin forside uten noen beskjed eller forklaring.
- For skjulte miljøer må man bli invitert av admin, og kan derfor ikke sende noen innmeldingsforespørsel selv. Når man har godtatt invitasjonen, innvilges ikke medlemsskap nødvendigvis umiddelbart; miljøet kan fortsatt kreve at man fyller ut informasjonen, og admins kan (som for lukkede grupper) kreve mer informasjon i en frem-og-tilbake-korrespondanse. Når korrespondansen er over og admin er fornøyd, kan hen innvilge (eventuet avslå) det faktiske medlemsskapet.

# Se, kontakte og bli venner med andre brukere

Når man er medlem av et miljø, skal man kunne åpne en liste over brukerne som er med i miljøet (admins skal ha en egen badge/indikator på at de er admins). Derfra kan man klikke seg inn på profilen til brukerne. Når man er inne på en profil (og direkte fra medlemslisten) skal man kunne trykke på en knapp for å sende brukeren en venneforespørsel. Hvis den andre godkjenner forespørselen, blir man venner. Brukerne selv skal kunne velge hvilken informasjon om dem som vises for brukere man ikke er venn med og til venner, og hva som skal være skjult for alle.

Når man er venner, kan man uten videre bruke chatfunksjonen for å sende direktemeldinger. Personer man ikke er venn med, kan man kun sende meldinger til i forbindelse med en låneforespørsel eller spørsmål om et objekt; i dette tilfellet vil det først bli sendt en strukturert melding som kan inneholde f.eks. et spørsmål - og ikke en ren fritekstmelding. Man kan ikke fortsette å sende meldinger før mottakeren har godtatt at man kan chatte videre fritt, og man kan heller ikke se om mottakeren har sett forespørselen. Poenget er at ingen skal føle seg presset til å svare på forespørsler, og at fri samtale ikke etableres før begge parter er med på det.

# Fjerne venner; blokkere brukere

Man skal når som helst kunne fjerne andre fra vennelisten, og kan også velge å blokkere dem med det samme hvis man ønsker det. Man kan også blokkere brukere man ikke er venn med. Hvis det eneste du gjør, er å fjerne noen som venn, vil den andre fortsatt kunne se brukeren din, men da på samme måte som man ser en hvilken som helst annen bruker man ikke er venn med; man kan også sende en ny venneforespørsel. Hvis du blokkerer noen, vil de andre ikke kunne se noe som helst til deg, hverken profilen din, aktiviteten din eller objektene dine.

# Admin-gjennomgang før publisering av objekter i miljøet

Jeg tenker at det kan være fornuftig – og i det minste en innstilling som kan skrus på i et miljø – å ha admin-gjennomgang av alle objekter som forsøkes publisert i et miljø. Dette for å forhindre at uakseptable/ulovlige objekter blir publisert for utlån. Hvis en admin avviser et objekt, skal det også være mulig for admin å rapportere selve objektet slik at det havner på en liste over mistenkelige objekter som må vurderes av en utvikler.

# Rapportere mistenkelig/uakseptabelt/ulovlig innhold og brukere

Det skal være mulig å rapportere brukere som ikke oppfører seg, som ikke har levert tilbake objekter osv. Det skal også være mulig å rapportere objekter som man oppfatter som ikke i tråd med miljøets retningslinjer, eller som er ulovlige eller på andre måter uakseptable.

# Idéer som foreløpig ikke er utarbeidet

Her følger en liste over idéer jeg har notert meg, men foreløpig ikke beskrevet i detalj. Jeg håper du kan hjelpe meg med detaljene. Si fra hvis du trenger mer info for å foreslå noe fornuftig.

- Brukere kan velge hva de ønsker å varsles om, og hvordan de ønsker å bli varslet (in-app varsler, mobilvarsler, e-post)
- Objekter som har vært utilgjengelige i mer enn 30 dager, skjules automatisk fra alle miljøer; brukeren må aktivt gjenopprette det for at det skal bli synlig igjen.
- Offentlige spørsmål om objekt: i et miljø kan brukere stille spørsmål som vises for hele miljøet hvis man tenker at det er flere som kan være interessert i svaret.
- Kryptering. Hvis appen skal ha en chattefunksjon, trenger vi også et robust system for E2EE-kryptering. Generelt ønsker jeg høy sikkerhet i denne appen.
- Det kan potensielt skje et stort antall interaksjoner/transaksjoner i appen. Jeg ber om hjelp til å avgjøre hva som bør loggføres og hvor lenge ulike typer oppføringer bør lagres i loggen.
- Automatisk arkivering (til brukerens arkiv) av objekter som har vært utilgjengelige i over 6 måneder – og permanent sletting fra appen hvis det er gått over 12 måneder (gjerne med flere advarsler til brukeren i forkant).
- Automatisk inaktivering og til slutt permanent sletting av brukere som ikke har vært pålogget på et år.
- På sikt: vurdere å involvere et forsikringsselskap slik at begge brukere i en låneinteraksjon kan betale et depositum til forsikringsselskapet. Hvis det ikke blir behov for forsikring, får begge parter pengene igjen. Forsikringsselskapet kan ev. gå med på dette ved at de får en liten avkastning i form av renteinntekter på deposita.
- Vi må grundig vurdere det juridiske: jeg ønsker ikke at jeg eller Lånbort skal være ansvarlig for folks utlån. Brukerne må selv være ansvarlig. Appen må derfor ha tydelige vilkår for bruk som gjør det klinkende klart at det er brukerne selv som må ta ansvar hvis noe går galt.
