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

Samtidig finnes kommunikasjonstyper der en administrator eller plattformansvarlig må kunne behandle innholdet, for eksempel formelle saker.

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

Det må utarbeides tydelige vilkår og informasjon om ansvar.

Det er likevel viktig å ikke behandle vilkår som en teknisk måte å «fjerne» alt juridisk ansvar på. Hvilket ansvar plattformen faktisk kan ha følger av gjeldende rett og produktets reelle funksjon, ikke bare av ordlyden i bruksvilkårene.

Juridiske spørsmål må derfor vurderes særskilt før lansering.

## Ulovlige og risikofylte objekter

Produktet trenger en tydelig policy for gjenstander som ikke skal kunne formidles gjennom Lånbort.

Dette kan omfatte objekter som er:

- ulovlige å eie eller overføre
- regulerte
- farlige
- uegnede for utlån uten særskilt kompetanse eller kontroll

Nøyaktig avgrensning må gjøres senere med relevant juridisk og sikkerhetsmessig vurdering.

## Fremtidig forsikring eller depositum

En mulig fremtidig idé er samarbeid med en ekstern forsikringsaktør der partene kan stille depositum og få en forsikringslignende beskyttelse.

Dette er ikke en del av den etablerte kjernevisjonen.

Det reiser egne spørsmål om:

- forholdet til prinsippet om gratis utlån
- betaling og tilbakebetaling
- finansielle og juridiske krav
- hvem som avgjør en skade
- hva Lånbort selv formidler eller er part i

Ideen skal derfor ligge som en mulig senere retning, ikke som et nåværende krav.

## Åpne spørsmål

Se [Åpne spørsmål](open-questions.md) for spørsmål om blant annet identitet, alder, datalagring, kryptering, logging, sletting, lovlige objekter og ansvar.