# Begreper

> **Status:** Arbeidsordliste for visjonen. Begrepene kan endres når produktmodellen avklares.

## Bruker

En person med konto i Lånbort.

I første versjon skal brukeren være minst 18 år, oppgi sitt virkelige navn og ha minst én verifisert kontaktkanal. BankID er ikke et krav fra start.

## Miljø

Et fellesskap der medlemmer kan oppdage hverandre og gjøre objekter tilgjengelige for utlån.

Tidligere notater kan bruke «gruppe» om det samme. I produktvisjonen brukes **miljø**.

## Medlem

En bruker som har aktivt medlemskap i et bestemt miljø.

## Administrator

Et medlem med administrative rettigheter i et bestemt miljø.

I faktisk brukergrensesnitt er ønsket term **administrator**, ikke «admin». «Admin» kan brukes som kortform i interne dokumenter.

## Eier av miljø

Den administratoren som har særskilt forvaltningsansvar for miljøets fortsatte eksistens.

Et aktivt miljø skal normalt ha nøyaktig én eier. Eieren kan overføre eierskapet til en annen administrator eller starte avvikling.

Et miljø kan bare være eierløst midlertidig som en unntakstilstand dersom eieren forsvinner uten kontrollert overføring.

## Plattformforvalter

En global produktrolle med særskilte rettigheter på tvers av miljøer, blant annet for plattformmoderering og enkelte plattformomfattende administrative handlinger.

Rollen finnes i Lånborts bruker- og rettighetsmodell. Den er ikke det samme som å være systemutvikler.

## Systemutvikler

En person eller KI-agent som arbeider med kode, arkitektur, drift eller annen teknisk utvikling av Lånbort.

**Systemutvikler er ikke en egen rolle i appens UI eller produktets rettighetsmodell.** En systemutvikler får bare plattformforvalterrettigheter dersom vedkommende eksplisitt tildeles den separate produktrollen.

## Objekt / utlånsobjekt

En gjenstand som én eller flere brukere registrerer i Lånbort for mulig utlån.

Objektet tilhører brukeren eller brukerne, ikke miljøet det vises i.

## Eier / medeier av objekt

Bruker som har forvaltningsrett til et objekt i Lånbort.

Medeierskap til objekt er forskjellig fra eierskap til miljø.

Når flere eier et objekt, kan hver medeier disponere det når det er ledig. Den medeiaren som godkjenner et konkret lån blir ansvarlig utlåner for akkurat dette lånet; andre medeiere kan ikke normalt endre eller avslutte lånet.

## Utlåner / ansvarlig utlåner

Brukeren som inngår og håndterer et konkret lån på utlånersiden.

Ved medeierskap blir den medeiaren som godkjenner låneforespørselen ansvarlig utlåner for akkurat dette lånet. Rollen omfatter blant annet avtaleendringer og endelig returbekreftelse.

## Låntaker

Bruker som får låne objektet i et konkret lån.

## Låneforespørsel

En strukturert forespørsel om å få låne et bestemt objekt på et bestemt tidspunkt eller i en bestemt periode.

## Lån

En avtale mellom utlåner og låntaker om midlertidig bruk av et objekt.

Et lån kan oppstå gjennom et miljø eller direkte mellom venner, men bruker deretter det samme grunnleggende lånesystemet og den samme brukerflaten.

Hvis lånet oppstod gjennom et miljø, beholdes miljøet som opprinnelseskontekst for blant annet historikk og eventuell miljøbasert mekling. Selve lånet er likevel ikke avhengig av fortsatt medlemskap i miljøet.

Det normale låneforløpet går gjennom statusene **forespurt**, **reservert**, **utlånt**, **avventer returavklaring** og **avsluttet**, med egne avvik som blant annet kansellert, forsinket og usikker/uenighet.

## Tilgjengelighet

Perioder der eierne i utgangspunktet ønsker at objektet skal kunne lånes.

Tilgjengelighet er en egenskap ved objektet og er ikke det samme som lånestatus eller faktisk ledighet.

## Faktisk ledighet

Om objektet i praksis kan lånes i et bestemt tidsrom, gitt både eierens tilgjengelighet og eksisterende reservasjoner, aktive lån eller andre blokkeringer.

## Lånestatus

Tilstanden til et konkret lån, for eksempel forespurt, reservert, utlånt, avventer returavklaring eller avsluttet.

**Avventer returavklaring** er en nøytral status når returtidspunktet er passert eller retur er meldt uten endelig bekreftelse.

**Forsinket** brukes bare når det faktisk er kjent at objektet fortsatt er hos låntaker etter avtalt returtid uten gyldig forlengelse. Taushet alene skal ikke gi denne statusen.

En tidligere hendelse i lånet slettes ikke bare fordi status senere endres. Hvis en returbekreftelse viser seg å være feil, beholdes bekreftelsen i historikken og en ny hendelse kan sette lånet tilbake til usikker/uenighet.

## Venn

En gjensidig relasjon mellom to brukere som begge har akseptert forbindelsen.

## Miljøspesifikt objektspørsmål

Et spørsmål om et objekt som stilles i et bestemt miljø og bare er synlig i dette miljøet. Spørsmålstråden følger miljøkonteksten selv om selve objektet også er publisert andre steder.

## Abonnement på objekt

En brukerrelasjon der brukeren ønsker varsler om relevante endringer i et objekt.

## Varsel

En systemgenerert beskjed om en hendelse som er relevant for brukeren.

## Chat

Løpende samtale mellom brukere eller i en administrativ kontaktflate.

## Strukturert melding

En melding som systemet forstår som en bestemt hendelse eller handling, og som kan inneholde knapper eller annen interaksjon.

## Sak

En strukturert prosess for vurdering, konflikt eller administrativ behandling der det kan være regler for hvem som får skrive, lese og beslutte hva.

## Rapport

En melding om mulig problematisk bruker, objekt, adferd eller innhold som skal vurderes. En rapport innebærer ikke at det rapporterte automatisk anses som klanderverdig.

## Blokkering

En ensidig brukerhandling som skal hindre vanlig synlighet og kontakt fra en bestemt annen bruker, med nødvendige unntak for aktive lån, saker eller annen historikk som må håndteres.

## Pålitelighet

Foreløpig navn på en mulig tillitsdimensjon basert på erfaringer fra gjennomførte lån. Den konkrete skåren er ikke ferdig definert.

## Gavmildhet

Foreløpig navn på en mulig dimensjon som uttrykker brukerens bidrag som utlåner.