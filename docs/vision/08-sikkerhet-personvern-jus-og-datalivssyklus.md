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

Lånbort vil kunne produsere mange hendelser. Ikke alt bør lagres for alltid, men enkelte handlinger må kunne rekonstrueres.

Aktuelle hendelser som kan trenge sporbarhet inkluderer:

- endring av administrative roller
- viktige medlemskapsbeslutninger
- endring av eierskap
- publisering og moderering av objekter
- inngåelse og endring av lån
- bekreftelse av tilbakelevering og senere feil-/avviksmeldinger
- rapporter og saksbehandling
- sikkerhetskritiske handlinger

Hvilke hendelser som skal logges, hvem som kan lese loggen og hvor lenge data skal oppbevares, må avgjøres per datatype og formål.

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

Det opprinnelige notatet foreslår automatisk inaktivering og til slutt sletting av kontoer som ikke har vært brukt på ett år.

Dette kan ikke fastsettes isolert.

Før en konto kan slettes må det blant annet tas hensyn til:

- aktive eller uavklarte lån
- åpne saker
- medeierskap
- miljøer der brukeren er eneste administrator eller eier
- data som andre brukere har legitimt behov for å beholde
- juridiske oppbevaringskrav
- brukerens rettigheter til sletting

Visjonen beholder målet om å ikke oppbevare døde kontoer unødvendig, men den konkrete mekanismen er åpen.

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

## Juridisk ansvar

Målet er at Lånbort skal fasilitere kontakt og utlån, mens brukerne selv tar ansvar for de konkrete gjenstandene de velger å låne ut eller låne.

Ved **direkte lån mellom venner** skal dette prinsippet også gjøres eksplisitt i selve låneflyten: begge parter må godta en ansvarserklæring før lånet etableres. Erklæringen skal gjøre det klart at partene selv må håndtere privatrettslige konflikter om blant annet tilbakelevering, skade, tap og erstatning, og at Lånbort ikke tilbyr plattformbasert mekling eller avgjørelse av slike tvister.

Ved miljøbaserte lån kan miljøadministratorer tilby en strukturert meklingsprosess dersom partene blir uenige. Dette endrer ikke det grunnleggende ansvarsprinsippet: administratoren kan hjelpe partene med dialog og dokumentasjon, men skal ikke fastsette juridisk skyld, erstatningsansvar eller andre bindende privatrettslige konsekvenser.

En vanlig lånetvist skal heller ikke kunne eskaleres til plattformforvalter bare fordi en part er misfornøyd med utfallet av meklingen.

Dette skal ikke hindre rapportering av forhold som gjelder tryggheten eller integriteten til selve plattformen, for eksempel trusler, trakassering, svindelforsøk eller ulovlig bruk. Slike forhold behandles som moderering av plattformbruk, ikke som avgjørelse av den underliggende lånetvisten.

Det må i tillegg utarbeides tydelige generelle vilkår og informasjon om ansvar.

Det er likevel viktig å ikke behandle en ansvarserklæring eller bruksvilkår som en teknisk måte å «fjerne» alt juridisk ansvar på. Hvilket ansvar plattformen faktisk kan ha følger av gjeldende rett og produktets reelle funksjon, ikke bare av hva brukeren klikker seg enig i.

Juridiske spørsmål må derfor vurderes særskilt før lansering.

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