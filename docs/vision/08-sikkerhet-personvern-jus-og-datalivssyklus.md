# Sikkerhet, personvern, jus og datalivssyklus

> **Status:** Førsteutkast. Dette dokumentet beskriver produktkrav og risikoområder. Det er ikke en sikkerhetsarkitektur eller juridisk vurdering.

## Grunnprinsipp

Lånbort skal behandle sikkerhet og personvern som grunnleggende produktegenskaper.

Appen vil kunne inneholde:

- identitets- og profilopplysninger
- sosiale relasjoner
- geografisk tilknytning
- private meldinger
- opplysninger om eiendeler
- historikk om utlån
- konflikter og rapporter
- tillits- og anmeldelsesdata

Feil tilgang til slike opplysninger kan være mer skadelig enn tap av en vanlig offentlig profil. Produktet må derfor utformes med tydelige tillitsgrenser og minst mulig unødvendig datatilgang.

## Identitet og kontoopprettelse

Lånbort er en plattform for utlån av fysiske eiendeler mellom mennesker. En viss grad av ansvarlig identitet er derfor et sikkerhets- og tillitstiltak.

For første versjon og en eventuell lukket pilot gjelder følgende produktretning:

- brukeren må være minst 18 år
- brukeren skal oppgi sitt virkelige navn
- minst én kontaktkanal skal verifiseres
- BankID eller tilsvarende sterk identitetsverifisering kreves ikke

BankID er ønskelig som en mulig senere styrking av identitetsnivået ved bred utrulling, men kostnaden gjør at dette ikke inngår i pilot- eller startmodellen.

Hvis sterk identitetsverifisering senere innføres, må det vurderes særskilt hvordan dette påvirker kostnader, personvern, tilgjengelighet og hvem som kan bruke tjenesten.

## Tilgang skal følge kontekst

En bruker skal bare få tilgang til informasjon og handlinger som rollen og situasjonen gir grunnlag for.

Eksempler:

- medlemskap i ett miljø gir ikke automatisk tilgang til et annet
- administratorrettigheter gjelder bare der brukeren faktisk er administrator
- en teknisk eller plattformomfattende rolle skal ikke ha mer menneskelig innsyn enn oppgaven krever
- skjulte miljøer skal ikke kunne oppdages av uvedkommende
- blokkering og profilinnstillinger skal håndheves av systemet, ikke bare skjules visuelt

De konkrete autorisasjonsreglene skal beskrives senere i en egen modell.

## Skjulte miljøer

Et skjult miljø skal ikke lekke meningsfull informasjon om sin eksistens til uvedkommende.

Det betyr blant annet at en ugyldig eller uautorisert forespørsel ikke skal gi mer informasjon enn nødvendig.

Visjonen bør formulere resultatet – ikke kreve en bestemt teknisk URL-løsning.

## Privat kommunikasjon

Vanlig privat chat mellom to brukere skal som produktmål være ende-til-ende-kryptert.

Det samme gjelder privat fritekst og vedlegg i samtalen rundt et konkret lån mellom utlåner og låntaker.

Strukturerte lånehendelser, som forespørsler, godkjenninger, avtalte perioder, statusendringer og returbekreftelser, er derimot systemdata som Lånbort må kunne behandle for at lånefunksjonen skal virke.

Kommunikasjon som uttrykkelig sendes til en administrativ funksjon, som innmeldingssaker, administratorkontakt, meklingssaker, rapporter og kommunikasjon med plattformforvalter, må kunne leses av de autoriserte personene som behandler saken. Slike flater skal ha streng tilgangskontroll og sterk konfidensialitet, men er ikke klassisk ende-til-ende-kryptert bare mellom to private brukere.

En miljøadministrator skal **ikke** få automatisk tilgang til privat lånechat dersom det oppstår en konflikt. Partene må selv sende inn den informasjonen eller dokumentasjonen de ønsker at administratoren skal vurdere.

## Logging og sporbarhet

Lånbort skal lagre historikk når den er nødvendig for en felles avtale, ansvarlighet, sikkerhet eller en legitim pågående eller etterfølgende prosess. Målet er ikke å bygge en mest mulig komplett kronikk over brukerens liv i appen.

Logging og oppbevaring skal derfor være formålsstyrt og vurderes per datatype.

### Avtale- og lånehistorikk

Hendelser som kan være nødvendige for å forstå et konkret lån skal kunne bevares så lenge det med rimelighet trengs for partene og eventuelle etterfølgende saker.

Dette omfatter blant annet:

- opprettelse og godkjenning av lån
- avtalte perioder og vilkår
- avtalte endringer
- overføring av ansvarlig utlåner
- returbekreftelser
- avvik og senere korrigerende hendelser

### Forvaltningshistorikk

Vesentlige handlinger som forklarer hvordan en nåværende forvaltnings- eller eierskapstilstand oppstod skal kunne spores.

Dette omfatter blant annet:

- endring av administratorroller
- eierskap og eierskapsoverføring i miljøer
- viktige medlemskapsbeslutninger
- moderering
- vesentlige endringer av medeide objekter

### Saks- og modereringshistorikk

Rapporter, meklingssaker og plattformmoderering kan ha et særskilt behov for dokumentasjon. Samtidig kan slike data være særlig personvernfølsomme.

Oppbevaringen skal derfor knyttes til sakens formål, alvorlighet og eventuelle behov for senere oppfølging, ikke til en generell regel om permanent lagring.

### Tekniske sikkerhetslogger

Innlogging, mislykkede tilgangsforsøk og andre sikkerhetskritiske hendelser kan logges når dette er nødvendig for å forebygge, oppdage eller undersøke misbruk.

Slike logger skal ha en klart begrenset levetid og skal ikke behandles som permanent brukerhistorikk.

### Ikke all aktivitet skal bli historikk

Lånbort skal ikke lagre enhver mulig brukerhandling permanent bare fordi det er teknisk mulig.

Det er normalt ikke behov for evig historikk over for eksempel:

- alle profilendringer
- alle søk
- alle sidevisninger
- enhver ordinær navigasjons- eller brukerhandling

### Brukersynlig historikk og intern logging er forskjellige ting

At en hendelse må logges av sikkerhets-, revisjons- eller ansvarlighetshensyn betyr ikke at andre brukere eller miljøadministratorer skal kunne lese loggen.

Tilgang til loggdata skal følge formålet med loggen og den konkrete rollen.

Konkrete oppbevaringstider skal bestemmes senere per datatype når personvernbehov, produktbehov og juridiske krav vurderes samlet.

«Logg alt for alltid» er ikke et akseptabelt standardprinsipp.

## Objektets datalivssyklus

Objekter som ikke lenger har nåværende eller fremtidig tilgjengelighet skal kunne gå gjennom en gradvis og reversibel opprydding:

1. etter en kortere periode kan de skjules fra aktive miljøflater
2. etter lengre inaktivitet kan de flyttes til brukerens arkiv
3. de kan reaktiveres av eieren

Foreløpige terskler er omtrent 30 dager før skjuling og omtrent seks måneder før arkivering.

**Et objekt skal ikke slettes permanent automatisk bare fordi det har vært inaktivt lenge.**

Permanent sletting skal i utgangspunktet være en eksplisitt brukerhandling eller følge av senere regler for kontosletting og datalivssyklus. Nødvendig historikk om tidligere lån eller saker kan måtte bevares separat selv om selve objektet slettes.

Hvis lagringsmengden ved betydelig større skala senere blir en reell driftsutfordring, kan den tekniske lagringsstrategien og oppryddingsmekanismene revurderes uten at inaktivitet automatisk trenger å bety permanent sletting.

## Brukerkontoens livssyklus

Lånbort skal skille tydelig mellom **inaktivitet**, **deaktivering** og **permanent kontosletting**.

Langvarig inaktivitet skal ikke føre direkte til permanent sletting.

Den ønskede livssyklusen er:

1. Etter langvarig inaktivitet varsles brukeren gjennom en verifisert kontaktkanal og får rimelig tid til å komme tilbake.
2. Kontoen kan deretter settes i en inaktiv eller dvalelignende tilstand.
3. I denne tilstanden skal nye lån og annen ny aktivitet stanses, og brukerens objekter kan skjules fra oppdagelsesflater.
4. Kontoen og nødvendig historikk beholdes slik at brukeren fortsatt kan reaktivere kontoen dersom sletting ennå ikke har skjedd.
5. Først etter ytterligere tid kan kontoen bli kandidat for permanent sletting.

Den konkrete tidslinjen bestemmes senere.

### Bindinger som blokkerer sletting

Permanent kontosletting skal ikke gjennomføres så lenge brukeren fortsatt har aktive ansvar eller bindinger som må håndteres, blant annet:

- reserverte, aktive eller uavklarte lån
- rollen som ansvarlig utlåner
- åpne saker eller modereringsprosesser
- miljøeierskap
- administrative roller som ikke kan fjernes uten å etterlate miljøet i en ugyldig tilstand
- medeierskap som først må avvikles på en kontrollert måte
- andre legitime eller juridiske oppbevaringsbehov

Når slike bindinger er borte, kan langvarig inaktivitet føre til automatisk kontosletting etter de senere fastsatte reglene.

### Hva kontosletting betyr

Sletting av en konto skal redusere persondata mest mulig uten å omskrive nødvendig felles historikk.

Det betyr blant annet at:

- personlige profil- og kontodata kan slettes
- vennskap, medlemskap og andre aktive relasjoner opphører
- brukerens egne objekter uten nødvendige historiske bindinger kan slettes
- nødvendig historikk om tidligere lån, anmeldelser og saker kan bevares når andre brukere eller Lånbort fortsatt har et legitimt behov for den
- identiteten i slik historikk skal anonymiseres eller pseudonymiseres når fullt navn eller andre identifiserende opplysninger ikke lenger er nødvendige

En bruker skal derfor ikke kunne få nødvendig felles lånehistorikk til å forsvinne fra andre parters historikk bare fordi kontoen slettes.

### Kontrollert avslutning i særtilfeller

Plattformforvalter skal i særtilfeller kunne initiere deaktivering og kontrollert avslutning av en konto når vanlig selvbetjent sletting ikke er mulig eller hensiktsmessig.

Aktuelle eksempler kan være:

- dokumentert dødsfall
- dokumentert duplikatkonto
- konto opprettet på falsk identitet
- andre alvorlige forhold der kontoen ikke bør forbli aktiv

Dette skal ikke være en generell «slett bruker»-funksjon.

Plattformforvalteren skal først kunne deaktivere kontoen slik at ny aktivitet stanses. Deretter må aktive bindinger håndteres etter de vanlige reglene før eventuell permanent sletting eller anonymisering.

Alle slike inngrep skal være begrunnede og sporbare.

Ved henvendelser fra tredjepart, for eksempel en påstått pårørende ved dødsfall, skal ikke en ubekreftet henvendelse alene være tilstrekkelig grunnlag for permanent sletting. Krav til dokumentasjon og prosess bestemmes senere.

## Personlig sletting versus felles historikk

En del data eksisterer i relasjon mellom flere brukere.

Eksempler:

- chat
- lån
- anmeldelser
- saker
- felles objekter

At én bruker ønsker å fjerne data fra sin egen konto eller visning, betyr ikke nødvendigvis at samme historikk kan eller bør forsvinne for alle andre.

For privat chat skal «Fjern fra mine samtaler» eller tilsvarende forstås som personlig skjuling/fjerning fra egen visning, ikke som sletting av den andre partens kopi eller av den underliggende felles historikken. En generell «slett for alle»-funksjon inngår ikke i kjernevisjonen.

Produktet må gjøre forskjellen mellom:

- skjule fra egen visning
- avslutte eller arkivere
- anonymisere
- slette personlig kopi
- permanent slette underliggende data

forståelig for brukeren.

## Geografisk informasjon og presisjon

Lånbort skal bruke den minst presise geografiske informasjonen som faktisk er nødvendig for formålet.

### Miljøer

Miljøer kan ha geografisk tilknytning som brukes til oppdagelse, for eksempel:

- kommune
- bydel
- nabolag
- et omtrentlig område på kart
- et presist offentlig sted når dette er naturlig for miljøet

Et miljø skal ikke måtte vise en privat eller unødvendig presis adresse bare for å kunne finnes.

Skjulte miljøer skal ikke lekke geografisk informasjon til ikke-medlemmer.

### Brukere

Brukere skal ikke som hovedregel måtte oppgi eller vise en presis bostedsposisjon i profilen.

Lånbort skal heller ikke ha løpende posisjonssporing som en del av den normale produktmodellen.

Hvis brukerens posisjon brukes til funksjoner som «finn miljøer nær meg», skal posisjonen behandles som et søkehjelpemiddel og ikke automatisk gjøres til en sosial profilopplysning.

### Objekter

Et objekt kan ha et omtrentlig henteområde som gjør det mulig å vurdere praktisk nærhet, for eksempel bydel eller nabolag.

En privat hjemmeadresse eller annen eksakt henteadresse skal ikke automatisk vises sammen med objektet.

Eksakt møtested eller adresse kan deles privat når det finnes et konkret lån eller en annen legitim situasjon der partene trenger informasjonen.

### Medlemsverifisering er noe annet enn geografisk oppdagelse

Opplysninger som en bruker oppgir for å dokumentere tilknytning til et miljø, for eksempel adresse eller leilighetsnummer i et borettslag, skal ikke automatisk brukes som synlig profilinformasjon, kartposisjon eller geografisk oppdagelsesdata.

Formålet med opplysningen skal styre hvordan den brukes og hvem som får se den.

## Juridisk ansvar og produktgrense

Lånbort skal ta ansvar for plattformen og de forholdene plattformen selv kontrollerer, men skal ikke opptre som garantist for den fysiske gjenstanden eller som dommer i det privatrettslige forholdet mellom utlåner og låntaker.

### Det Lånbort skal ta ansvar for

Lånbort skal blant annet ta ansvar for:

- sikkerhet og personvern i tjenesten
- at tilgangsregler, blokkering og andre produktgrenser faktisk håndheves
- at strukturerte låneavtaler og hendelser gjengis korrekt
- at brukerne får forståelig informasjon om hvordan systemet fungerer
- håndtering av rapporter om trusler, trakassering, svindelforsøk, ulovlig innhold og annet misbruk av plattformen
- rimelig moderering av objekter og brukere når plattformreglene brytes
- at anmeldelses- og tillitssystemet ikke bevisst fremstiller informasjon misvisende
- de administrative prosessene Lånbort selv tilbyr

Lånbort skal ikke gi inntrykk av å tilby sterkere identitetskontroll, sikkerhet eller garanti enn produktet faktisk gjør. Dersom identitetsnivået for eksempel bare bygger på verifisert kontaktinformasjon, skal dette ikke presenteres som full identitetsverifisering.

### Det Lånbort ikke skal garantere eller avgjøre

Lånbort skal ikke love eller garantere:

- at en bruker faktisk er den vedkommende hevder å være utover det uttrykkelig angitte verifiseringsnivået
- at en bruker vil opptre redelig
- at en fysisk gjenstand er sikker, feilfri eller juridisk eid av den registrerte eieren
- at et objekt blir tilbakelevert
- at partene blir enige om skade, tap eller erstatning
- kompensasjon dersom noe går galt
- en bindende avgjørelse av private tvister

Ved **direkte lån mellom venner** skal dette prinsippet også gjøres eksplisitt i selve låneflyten: begge parter må godta en ansvarserklæring før lånet etableres. Erklæringen skal gjøre det klart at partene selv må håndtere privatrettslige konflikter om blant annet tilbakelevering, skade, tap og erstatning, og at Lånbort ikke tilbyr plattformbasert mekling eller avgjørelse av slike tvister.

Ved miljøbaserte lån kan miljøadministratorer tilby en strukturert meklingsprosess dersom partene blir uenige. Dette endrer ikke det grunnleggende ansvarsprinsippet: administratoren kan hjelpe partene med dialog og dokumentasjon, men skal ikke fastsette juridisk skyld, erstatningsansvar eller andre bindende privatrettslige konsekvenser.

En vanlig lånetvist skal heller ikke kunne eskaleres til plattformforvalter bare fordi en part er misfornøyd med utfallet av meklingen.

Dette skal ikke hindre rapportering av forhold som gjelder tryggheten eller integriteten til selve plattformen, for eksempel trusler, trakassering, svindelforsøk eller ulovlig bruk. Slike forhold behandles som moderering av plattformbruk, ikke som avgjørelse av den underliggende lånetvisten.

### Produktgrensen avgjør ikke alene det juridiske ansvaret

Det må utarbeides tydelige generelle vilkår og informasjon om ansvar.

Ansvarserklæringer og bruksvilkår skal ikke behandles som en teknisk måte å «fjerne» juridisk ansvar på. Hvilket ansvar plattformen faktisk kan ha følger av gjeldende rett og produktets reelle funksjon, ikke bare av hva brukeren klikker seg enig i.

Før bred lansering må de relevante norske og EØS-rettslige områdene vurderes særskilt og kvalifisert.

Produktrollen kan oppsummeres som at Lånbort skal være en ansvarlig tilrettelegger, ikke et forsikringsselskap, en garantist eller en domstol.

## Ulovlige og risikofylte objekter

Lånbort skal ikke brukes til å formidle objekter som er ulovlige, sterkt regulerte eller innebærer uforholdsmessig risiko for skade ved utlån mellom privatpersoner.

Dette er et fast produktprinsipp.

Den konkrete grensedragningen skal håndteres i en egen, vedlikeholdbar plattformpolicy. Enkelte typer objekter kan være tillatt med særskilte vilkår eller begrensninger, mens andre skal forbys helt.

Før bred lansering må denne policyen vurderes juridisk og sikkerhetsmessig. Kategorier som krever særskilt vurdering omfatter blant annet våpen, legemidler, rusmidler, farlige kjemikalier, kjøretøy, medisinsk utstyr og annet sikkerhetskritisk utstyr.

## Betaling mellom brukere

Lånbort skal ikke tilby noe system for betaling mellom brukere.

Appen skal derfor ikke håndtere:

- leiebetaling
- kjøpesummer
- betaling for «tjenesten» det er å låne bort
- overføring av penger mellom utlåner og låntaker

Dersom to brukere privat velger å gjøre et økonomisk oppgjør utenfor Lånbort, er dette deres eget forhold. Plattformen skal ikke aktivt forsøke å oppdage eller forhindre dette, men heller ikke fasilitere, registrere eller administrere betalingen.

## Mulig fremtidig forsikring eller depositum

En mulig senere idé er samarbeid med en ekstern forsikringsaktør der partene kan stille depositum eller på annen måte få beskyttelse mot skade eller tap.

Dette skal forstås som en mulig **trygghetsmekanisme**, ikke som betaling fra låntaker til utlåner. I normaltilfellet vil et depositum være ment å tilbakeføres når lånet avsluttes uten hendelser.

Forsikring eller depositum er ikke del av den etablerte kjernevisjonen og skal ikke planlegges fra start. Ideen kan vurderes først når den øvrige appen er ferdig nok til at et slikt tillegg faktisk er relevant.

Hvis dette senere vurderes, må spørsmål om betaling, tilbakebetaling, finansielle og juridiske krav, skadebehandling og Lånborts rolle vurderes som et eget produktområde.

## Åpne spørsmål

Se [Åpne spørsmål](open-questions.md) for spørsmål om blant annet identitet, alder, datalagring, kryptering, logging, sletting, lovlige objekter og ansvar.