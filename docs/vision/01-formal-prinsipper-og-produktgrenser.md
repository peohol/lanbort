# Formål, prinsipper og produktgrenser

> **Status:** Førsteutkast. Dette dokumentet beskriver ønsket produktretning, ikke teknisk løsning.

## Formål

Lånbort skal gjøre det enklere for mennesker i Norge å låne bort ting de allerede eier, og å låne ting de bare trenger av og til.

Utgangspunktet er at mange gjenstander brukes sjelden, samtidig som mange kjøper tilsvarende gjenstander fordi det er vanskelig å vite hvem som kan låne dem bort, om de er tilgjengelige, og hvordan et lån kan gjennomføres på en trygg og oversiktlig måte.

Lånbort skal redusere denne friksjonen.

## Samfunnsmessig ambisjon

Produktet skal bidra til en kultur der det er mer naturlig å dele eksisterende ressurser enn å kjøpe nytt når behovet er midlertidig. Den ønskede effekten er:

- mindre overforbruk
- bedre utnyttelse av ting som allerede finnes
- lavere kostnader for brukerne
- mer kontakt og samarbeid mellom mennesker
- økt gjensidig tillit

Tillit skal ikke forstås som blind tillit. Appen skal gjøre ansvarlig deling lettere ved å gi brukerne oversikt, forutsigbarhet, kontroll og mekanismer for å håndtere problemer.

## Ikke en markedsplass for utleie, salg eller betaling

**Retning:** Lånbort skal ikke være en kommersiell markedsplass. Appen skal ikke ha funksjoner for at brukere kan:

- sette leiepris på objekter
- selge objekter
- betale hverandre
- kreve inn eller formidle betaling mellom hverandre

Kjernen i produktet er gratis utlån og deling.

Lånbort skal samtidig ikke forsøke å kontrollere eller forhindre at to brukere på eget initiativ gjør et privat økonomisk oppgjør utenfor appen. Et slikt oppgjør skjer utenfor Lånbort og er ikke en funksjon eller del av låneprosessen i systemet.

En eventuell senere forsikrings- eller depositumløsning gjennom en tredjepart regnes som noe annet enn betaling mellom utlåner og låntaker. Formålet vil i så fall være trygghet og risikohåndtering, ikke vederlag for utlånet. Dette skal **ikke planlegges som del av den første produktvisjonen eller den første implementeringen**. Ideen kan vurderes på nytt når den øvrige appen er etablert.

## Miljøer som sosial ramme

Lånbort skal i hovedsak organisere deling gjennom **miljøer**: fellesskap av mennesker som har en naturlig grunn til å dele med hverandre, for eksempel et borettslag, en arbeidsplass, et idrettslag, et nabolag eller et interessefellesskap.

Miljøene skal kunne ha ulik grad av åpenhet og ulikt geografisk eller sosialt omfang.

Lån skal også kunne skje **direkte mellom to brukere som er venner**, uten at et miljø er involvert.

Direkte lån utenfor miljøer er foreløpig begrenset til venner. Brukere som ikke er venner, kan ikke låne direkte av hverandre; mellom slike brukere må et eventuelt lån skje gjennom et miljø der objektet er publisert og begge har nødvendig adgang.

Ved et direkte lån mellom venner inngår partene en privat låneavtale som de selv har ansvar for. Før lånet kan etableres i Lånbort, skal **begge parter uttrykkelig godta en kort og tydelig ansvarserklæring** om at Lånbort bare fasiliterer lånet og ikke behandler eller avgjør konflikter mellom dem om for eksempel tilbakelevering, skade, tap eller erstatning.

## Hele låneforløpet skal støttes

Lånbort skal støtte mer enn bare oppdagelse av objekter. Produktet skal dekke hele forløpet:

1. finne relevante mennesker, miljøer og objekter
2. publisere og beskrive objekter
3. angi tilgjengelighet og vilkår
4. be om å få låne
5. kommunisere og avklare
6. godkjenne og gjennomføre et lån
7. følge status under lånet
8. bekrefte tilbakelevering
9. håndtere manglende tilbakelevering eller uenighet
10. gi tilbakemeldinger etterpå
11. bygge opp et historisk tillitsgrunnlag

## Brukerkontroll

Brukerne skal ha betydelig kontroll over:

- hvilke miljøer de deltar i
- hvilke objekter de gjør synlige, og hvor
- hvem som kan se deler av profilen deres
- hvem de er venner med
- hvem de blokkerer
- hvilke varsler de mottar
- hvilke objekter de følger eller abonnerer på

Kontrollmekanismer skal ikke gjøre produktet unødvendig tungvint, men de skal redusere sosialt press og uønsket kontakt.

## Sikkerhet og personvern som produktkrav

Høy sikkerhet er en grunnleggende del av visjonen, ikke en funksjon som legges til senere.

Dette innebærer blant annet at:

- skjult informasjon faktisk skal være skjult for uvedkommende
- rettigheter skal følge rollen og sammenhengen brukeren opptrer i
- sensitive handlinger skal være sporbare der det er nødvendig
- brukerne skal forstå hva andre kan se
- kommunikasjon skal beskyttes på en måte som er forenlig med den funksjonen den har
- sletting, arkivering og oppbevaring av data skal være gjennomtenkt

De konkrete sikkerhetsmekanismene avgjøres senere.

## Plattformretning

Første versjon skal være nettleserbasert og fungere godt både på mobil og desktop.

Produktet skal samtidig utformes slik at en senere mobilapp på Android og iOS ikke krever at produktmodellen tenkes på nytt. Mobilvarsler er en ønsket del av den langsiktige brukeropplevelsen.

Dette er en produktretning, ikke et valg av teknisk rammeverk.

## Kontinuerlig produktutvikling

Lånbort er tenkt som et produkt som forbedres kontinuerlig. Visjonen skal derfor kunne utvikles etter erfaring med reelle brukere.

Det skal likevel være tydelig når en idé bare er en hypotese, og når noe er blitt en stabil del av produktets retning.