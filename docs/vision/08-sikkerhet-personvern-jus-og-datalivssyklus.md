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

Privat chat skal ha sterk beskyttelse.

Ende-til-ende-kryptering er en ønsket retning for kommunikasjon der bare deltakerne skal kunne lese innholdet.

Samtidig finnes kommunikasjonstyper der en administrator eller plattformforvalter må kunne behandle innholdet, for eksempel formelle saker.

Derfor må systemet senere skille tydelig mellom:

- privat part-til-part-kommunikasjon
- administrative samtaler
- systemmeldinger
- formelle saker
- offentlig eller miljøsynlig kommunikasjon

Én krypteringsmodell passer ikke nødvendigvis alle.

## Logging og sporbarhet

Lånbort vil kunne produsere mange hendelser. Ikke alt bør lagres for alltid, men enkelte handlinger må kunne rekonstrueres.

Aktuelle hendelser som kan trenge sporbarhet inkluderer:

- endring av administrative roller
- viktige medlemskapsbeslutninger
- endring av eierskap
- publisering og moderering av objekter
- inngåelse og endring av lån
- bekreftelse og tilbakekalling av tilbakelevering
- rapporter og saksbehandling
- sikkerhetskritiske handlinger

Hvilke hendelser som skal logges, hvem som kan lese loggen og hvor lenge data skal oppbevares, må avgjøres per datatype og formål.

«Logg alt for alltid» er ikke et akseptabelt standardprinsipp.

## Objektets datalivssyklus

Visjonen skisserer en gradvis livssyklus for objekter som ikke lenger er tilgjengelige:

1. etter en kortere periode fjernes de fra aktive miljøflater
2. etter lengre inaktivitet kan de arkiveres hos brukeren
3. etter ytterligere tid kan permanent sletting vurderes etter tydelige forhåndsvarsler

Foreløpige tidsgrenser i kildedokumentet er 30 dager, seks måneder og tolv måneder.

Disse tallene er ikke endelig vurdert.

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

At én bruker ønsker å fjerne data fra sin egen konto, betyr ikke nødvendigvis at samme historikk kan eller bør forsvinne for alle andre.

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

Dette skal ikke hindre rapportering av forhold som gjelder tryggheten eller integriteten til selve plattformen, for eksempel trusler, trakassering, svindelforsøk eller ulovlig bruk.

Det må i tillegg utarbeides tydelige generelle vilkår og informasjon om ansvar.

Det er likevel viktig å ikke behandle en ansvarserklæring eller bruksvilkår som en teknisk måte å «fjerne» alt juridisk ansvar på. Hvilket ansvar plattformen faktisk kan ha følger av gjeldende rett og produktets reelle funksjon, ikke bare av hva brukeren klikker seg enig i.

Juridiske spørsmål må derfor vurderes særskilt før lansering.

## Ulovlige og risikofylte objekter

Produktet trenger en tydelig policy for gjenstander som ikke skal kunne formidles gjennom Lånbort.

Dette kan omfatte objekter som er:

- ulovlige å eie eller overføre
- regulerte
- farlige
- uegnede for utlån uten særskilt kompetanse eller kontroll

Nøyaktig avgrensning må gjøres senere med relevant juridisk og sikkerhetsmessig vurdering.

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