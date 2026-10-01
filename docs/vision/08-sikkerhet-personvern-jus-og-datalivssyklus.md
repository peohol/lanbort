# Sikkerhet, personvern, jus og datalivssyklus

> **Status:** Konsolidert visjonsutkast. Produktgrensene for identitet, tilgang, personvern, logging, datalivssyklus, geografi og ansvar er avklart; tekniske og juridiske detaljer må fortsatt utredes før lansering.

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

### Habilitet og privilegert tilgang

En plattformomfattende rolle skal aldri gi en bruker ekstra rettigheter i en konkret sak der vedkommende selv er part, rapportert eller på annen måte direkte interessert.

En inhabil plattformforvalter skal bare ha den tilgangen som følger av egen ordinære bruker- eller partsrolle. Beskyttet saksinformasjon, modereringsverktøy og administrative avgjørelser i den aktuelle saken skal være utilgjengelige for vedkommende gjennom plattformrollen.

Tilgang til slike saker skal være sporbar. Det skal kunne dokumenteres hvilke forvaltere som har åpnet saken og utført administrative handlinger.

Hvis ingen habil intern forvalter finnes, skal systemet ikke løse dette ved å gi den berørte forvalteren tilgang til å behandle sin egen sak. En organisatorisk uavhengig behandlingsvei for alvorlige saker som gjelder selve plattformforvaltningen skal etableres før produktet når en skala der dette er nødvendig.

## Skjulte miljøer

Et skjult miljø skal ikke lekke meningsfull informasjon om sin eksistens til uvedkommende.

Det betyr blant annet at en ugyldig eller uautorisert forespørsel ikke skal gi mer informasjon enn nødvendig.

Skjulte miljøer skal heller ikke bruke delbare invitasjonslenker som adgangsmekanisme. Bare eksisterende Lånbort-brukere kan inviteres, og invitasjonen skal være intern og knyttet til den konkrete brukerkontoen. Det skal ikke sendes e-postinvitasjoner som gir adgang til skjulte miljøer.

En gyldig ventende administratorinvitasjon skal behandles som en beslutning tatt på vegne av miljøet, ikke som en personlig fullmakt som automatisk opphører dersom administratoren som sendte den senere mister rollen. Invitasjonen skal likevel kunne trekkes tilbake av miljøets autoriserte administrasjon eller ugyldiggjøres ved avvikling eller nødvendig plattformmoderering.

Miljøet kan ha en intern teknisk adresse i nettapplikasjonen, men denne skal ikke fungere som en delbar oppdagelses- eller adgangsmekanisme. En uvedkommende som kjenner adressen skal fortsatt ikke få meningsfull informasjon om miljøets eksistens.

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

### Mønsterdata for sikkerhet og misbruk

Lånbort kan beholde og analysere strukturerte signaler som er nødvendige for å oppdage gjentatt eller koordinert misbruk, for eksempel bekreftede modereringsbrudd, falsk identitet, dokumenterte duplikatkontoer eller forsøk på å omgå suspensjon.

Rått antall rapporter, blokkeringer eller konflikter skal ikke behandles som bevis på misbruk. Slike hendelser kan være feilaktige, strategiske eller sterkt korrelerte. Automatiske mønstersignaler skal derfor brukes som grunnlag for nærmere vurdering, ikke som automatisk dom eller direkte offentlig tillitsskår.

Oppbevaring og tilgang til slike data skal være formålsstyrt og følge de samme prinsippene om dataminimering, tilgangskontroll og begrenset lagring som øvrige sikkerhetsdata.

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

Permanent sletting skal i utgangspunktet være en eksplisitt brukerhandling eller følge av senere regler for kontosletting og datalivssyklus.

Et objekt skal ikke kunne slettes permanent mens det inngår i et reservert, aktivt eller fortsatt uavklart lån som krever oppfølging. Eieren kan avpublisere objektet og hindre nye forespørsler, men nødvendig objekt- og låneinformasjon må bestå til bindingen er avsluttet.

Hvis det bare finnes ikke-godkjente forespørsler, kan objektet slettes; forespørslene avsluttes da nøytralt.

Nødvendig historikk om tidligere lån eller saker kan måtte bevares separat selv om selve objektet senere slettes. Sletting skal ikke brukes til å fjerne eller omskrive et eksisterende felles låneforhold eller den historiske representasjonen av hva partene faktisk avtalte.

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

### Begrenset tilgang under deaktivering

Deaktivering skal som hovedregel stanse **ny aktivitet**, men skal ikke gjøre det umulig for brukeren å oppfylle allerede eksisterende forpliktelser.

En deaktivert eller sterkt begrenset konto skal derfor normalt fortsatt kunne utføre de minimumshandlingene som trengs for å avslutte eksisterende forhold, for eksempel:

- se reserverte, aktive og uavklarte lån
- se nødvendige avtalte tider og opplysninger
- registrere overlevering eller retur og svare på strukturerte avklaringer
- delta i allerede åpne saker der brukeren er part
- utføre nødvendige steg for å avvikle medeierskap eller andre bindinger

Samtidig skal brukeren normalt ikke kunne:

- opprette nye lån eller låneforespørsler
- publisere objekter for nye utlån
- starte nye chatter, vennskap eller andre sosiale relasjoner
- melde seg inn i nye miljøer
- utføre annen ordinær ny aktivitet

Hvis det finnes en særskilt sikkerhetsgrunn som gjør at selv denne begrensede kontotilgangen ikke kan forsvares, kan full stenging brukes som et strengere unntak.

### Suspensjon som modereringstiltak

Suspensjon skiller seg fra frivillig eller inaktivitetsbasert deaktivering ved at plattformen uttrykkelig har besluttet å begrense brukerens deltakelse. Derfor skal suspensjon stoppe nye låneforløp og nye fysiske overleveringer mens tiltaket gjelder.

Ikke-godkjente forespørsler kan avsluttes nøytralt, og reserverte lån som ennå ikke er overlevert kan avsluttes administrativt. Motparten skal få tilstrekkelig informasjon til å forstå at lånet ikke kan gjennomføres, men skal ikke få mer informasjon om suspensjonsgrunnen enn det som er nødvendig.

Hvis et objekt allerede er overlevert, skal brukeren normalt beholde den minimumstilgangen som trengs for å avslutte det konkrete forholdet på en trygg måte. Ved alvorlig sikkerhetsrisiko kan selv denne tilgangen erstattes av en strengere, kontrollert prosess.

### Bindinger som blokkerer sletting

Permanent kontosletting skal ikke gjennomføres så lenge brukeren fortsatt har aktive ansvar eller bindinger som må håndteres, blant annet:

- reserverte, aktive eller uavklarte lån som fortsatt krever faktisk oppfølging
- rollen som ansvarlig utlåner
- åpne saker eller modereringsprosesser
- miljøeierskap
- administrative roller som ikke kan fjernes uten å etterlate miljøet i en ugyldig tilstand
- medeierskap som først må avvikles på en kontrollert måte
- andre legitime eller juridiske oppbevaringsbehov

Et lån som etter en tilstrekkelig avklaringsprosess er **administrativt avsluttet som uavklart** skal ikke fortsette å blokkere kontosletting eller andre systemprosesser bare fordi returen historisk aldri ble endelig bekreftet. Den uavklarte historikken skal likevel bevares så lenge det ellers er legitimt og nødvendig.

Når slike bindinger er borte, kan langvarig inaktivitet føre til automatisk kontosletting etter de senere fastsatte reglene.

### Hva kontosletting betyr

Sletting av en konto skal redusere persondata mest mulig uten å omskrive nødvendig felles historikk.

Det betyr blant annet at:

- personlige profil- og kontodata kan slettes
- vennskap, medlemskap og andre aktive relasjoner opphører
- brukerens egne objekter uten nødvendige historiske bindinger kan slettes
- nødvendig historikk om tidligere lån, anmeldelser og saker kan bevares når andre brukere eller Lånbort fortsatt har et legitimt behov for den
- identiteten i slik historikk skal anonymiseres eller pseudonymiseres når fullt navn eller andre identifiserende opplysninger ikke lenger er nødvendige
- en publisert anmeldelse kan derfor bestå etter at forfatterens konto er slettet, men skal ikke fortsette å vise navn, profilbilde eller profillenke når disse opplysningene ikke lenger er nødvendige; den synlige forfatteren kan da vises nøytralt som «Tidligere bruker»
- dersom den slettede brukeren selv var den anmeldte, skal den aktive profilen og den aktive tillitsprofilen forsvinne; nødvendige historiske anmeldelser kan bestå i felles historikk, men skal ikke fortsette som en aktiv eller søkbar aggregert skår for en profil som ikke lenger finnes

En bruker skal derfor ikke kunne få nødvendig felles lånehistorikk til å forsvinne fra andre parters historikk bare fordi kontoen slettes.

Hvis personen senere oppretter en ny konto, skal historiske anmeldelser, skårer eller annen tillitshistorikk fra den slettede kontoen ikke automatisk knyttes til den nye profilen bare fordi systemet mistenker at det er samme person. Eventuell sammenkobling kan være relevant for sikkerhet, duplikatkontroll, omgåelse av tiltak eller annen kontrollert kontinuitet, men skal behandles i den særskilte sikkerhetsprosessen og ikke som automatisk gjenoppretting av den gamle sosiale profilen.

### Ventende invitasjoner og anmeldelser ved kontosletting

Ventende invitasjoner, uaksepterte rolleforespørsler og åpne anmeldelsesfrister skal ikke i seg selv regnes som aktive bindinger som blokkerer permanent sletting.

Konto-bundne invitasjoner som er sendt **til** brukeren faller bort når kontoen slettes. Personlige invitasjoner som er sendt **fra** brukeren og som forutsetter avsenderens fortsatte konto faller normalt også bort. En invitasjon som etter produktreglene tilhører et miljø fremfor den enkelte administratoren, kan derimot fortsette dersom miljøet fortsatt er gyldig og har annen autorisert administrasjon.

Ubenyttede personlige anmeldelsesrettigheter faller bort ved sletting. Allerede innsendte anmeldelser kan bevares som del av felles historikk etter de vanlige anonymiserings- og publiseringsreglene, og en motparts allerede opptjente anmeldelsesrett kan fullføres uten at dette gjenoppretter den slettede brukerens aktive profil.

### Synlig identitet i felles historikk etter sletting

Når en konto slettes, skal motpartens legitime kopi av felles historikk ikke automatisk omskrives eller slettes. Dette gjelder blant annet private meldinger, strukturerte lånehendelser og annen historikk som fortsatt har et legitimt oppbevaringsformål.

Den aktive profilen skal likevel forsvinne. Der konkret identitet ikke lenger er nødvendig, skal navn, profilbilde og profillenke fjernes eller erstattes med en nøytral betegnelse som **«Tidligere bruker»**. Mer identifiserende informasjon skal bare beholdes eller vises når den fortsatt er nødvendig for et konkret historisk, sikkerhetsmessig eller juridisk formål.

### Melding om mulig dødsfall eller varig utilgjengelighet

En bruker med legitim tilgang til en annen brukers profil eller et konkret felles forhold skal kunne melde at brukeren kan være død eller varig ute av stand til å håndtere kontoen. Dette skal være en særskilt konto- og kontinuitetssak, ikke en vanlig modereringsrapport.

En slik melding skal **ikke** i seg selv:

- deaktivere kontoen
- markere brukeren offentlig som død
- avslutte lån eller andre avtaler
- gi melderen eller en pårørende tilgang til kontoen
- overføre eierskap, administratorroller eller private data

Meldingen skal opprette en konfidensiell verifikasjonssak på plattformnivå. Lånbort skal så langt det er rimelig forsøke å avklare forholdet gjennom tilgjengelige verifiserte kontaktkanaler og eventuell dokumentasjon. Nøyaktige dokumentasjonskrav fastsettes senere.

Dersom meldingen avkreftes eller brukeren selv bekrefter at kontoen fortsatt er aktiv, avsluttes saken uten kontoendring. Melderen trenger ikke få innsyn i dokumentasjonen eller andre personopplysninger; det er tilstrekkelig med en nøytral bekreftelse på at meldingen er mottatt eller ferdigbehandlet.

Feilaktige meldinger skal ikke automatisk behandles som misbruk. Bevisst falske eller gjentatte strategiske meldinger kan derimot behandles som plattformmisbruk etter de vanlige modereringsreglene.

Hvis dødsfall eller varig utilgjengelighet blir tilstrekkelig verifisert, kan kontoen settes i en kontrollert tilstand der ny aktivitet stanses mens eksisterende forpliktelser håndteres. Bare den informasjonen som er nødvendig for dette formålet skal gjøres tilgjengelig.

### Begrenset representant ved dødsfall eller varig utilgjengelighet

Når det finnes en legitim og tilstrekkelig verifisert representant, for eksempel en representant for et dødsbo eller annen person med dokumentert rett til å opptre på brukerens vegne, kan Lånbort gi en **snever og formålsbundet representantrolle**.

Representanten skal ikke overta brukerens konto eller innloggingsidentitet. Rollen skal bare gi tilgang til konkrete handlinger og opplysninger som er nødvendige for å avslutte bestemte eksisterende forhold, for eksempel å:

- motta et objekt som er utlånt fra den utilgjengelige brukeren
- avtale praktisk tilbakelevering i et konkret lån
- bekrefte at et konkret objekt er mottatt
- medvirke til kontrollert avvikling av andre bindinger når dette er nødvendig og legitimt

Rollen skal ikke gi generell tilgang til private chatter, vennskap, miljøer, profilhistorikk eller andre objekter som ikke er nødvendige for den aktuelle oppgaven. All bruk av rollen skal være sporbar.

Hvis en bruker senere viser seg å være i live eller får tilbake kontroll over kontoen etter en feilaktig eller midlertidig vurdering, skal representantens tilgang trekkes tilbake og ordinær konto kunne gjenopprettes etter nødvendig identitetskontroll. Historikken om de administrative handlingene skal beholdes.

### Når den varig utilgjengelige brukeren er låntaker

Hvis en verifisert død eller varig utilgjengelig bruker har et annet menneskes objekt i et aktivt lån, kan en legitim representant få akkurat den tilgangen som er nødvendig for å tilbakeføre objektet. Rollen gir ikke tilgang til resten av kontoen.

Hvis tilbakeføring ikke kan avklares, kan lånet avsluttes administrativt som uavklart etter de vanlige reglene. Dødsfall eller dokumentert varig utilgjengelighet skal ikke behandles som negativ låntakeratferd. Den administrative avslutningen skal heller ikke gjøre objektet tilgjengelig for nye lån før eieren har bekreftet fysisk kontroll over objektet.

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

## Kontinuitet uten personvernlekkasje

Når eksisterende relasjoner må fortsette etter at medlemskap, vennskap eller kontoaktivitet endres, skal Lånbort bevare den minste tilgangen som er nødvendig for å håndtere den konkrete forpliktelsen. Dette skal ikke brukes til å gjenåpne generell profil-, miljø- eller sosial tilgang som ellers er bortfalt.

Hvis samme objekt forekommer i både skjulte og ikke-skjulte kontekster, skal systemet kunne håndheve globale forhold som faktisk ledighet uten å forklare dem på en måte som røper det skjulte miljøet, dets medlemmer eller aktivitet.

Ved avvikling eller sletting av et skjult miljø kan nødvendig historisk informasjon om konkrete lån og saker beholdes for direkte parter og andre med et legitimt historisk behov. Miljøet skal likevel ikke bli søkbart eller på annen måte eksponert for brukere som ikke hadde eller ikke lenger har en legitim historisk forbindelse til den aktuelle informasjonen.

## Deaktivering av medeier

Deaktivering av en medeiers konto skal stoppe ny aktivitet fra denne kontoen, men skal ikke automatisk slette medeierrettigheten eller eksisterende felles historikk.

Hvis brukeren er ansvarlig utlåner i et eksisterende lån, må dette ansvaret avsluttes eller overføres etter de etablerte reglene før permanent kontosletting eller full uttreden kan gjennomføres. Andre medeiere kan fortsatt forvalte objektet innenfor sine egne rettigheter.

## Detaljer som fastsettes senere

Følgende skal fastsettes i senere sikkerhets-, personvern-, juridisk- og produktarbeid:

- konkrete oppbevaringstider per datatype
- konkrete tidslinjer for konto- og objektlivssyklus
- dokumentasjonskrav ved særskilt kontoavslutning, for eksempel ved dødsfall
- den tekniske krypterings- og autorisasjonsarkitekturen
- den detaljerte policyen for ulovlige, regulerte og risikofylte objekter
- kvalifisert vurdering av relevante norske og EØS-rettslige krav

Dette er ikke åpne spørsmål om produktets grunnleggende retning.