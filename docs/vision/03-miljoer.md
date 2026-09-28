# Miljøer

> **Status:** Førsteutkast. Miljøer er en sentral del av produktmodellen. Flere av de konkrete styringsmekanismene er foreløpige.

## Hva er et miljø?

Et **miljø** er et fellesskap der medlemmer kan finne hverandre og gjøre objekter tilgjengelige for utlån.

Eksempler kan være:

- et borettslag
- et nabolag
- en arbeidsplass
- et idrettslag
- en organisasjon
- et interessefellesskap
- et geografisk område

Objekter eies ikke av miljøet. Et objekt tilhører brukeren eller brukerne som eier det, og kan publiseres i ett eller flere miljøer.

Et miljø er først og fremst en **oppdagelses- og adgangsramme**. Det gjør det mulig å finne objekter og etablere lån mellom brukere som ikke allerede er venner.

Når en låneforespørsel først er sendt, blir låneforholdet behandlet som en egen relasjon mellom utlåner og låntaker. Selve låneflaten skal i hovedsak være den samme uansett om lånet oppstod gjennom et miljø eller direkte mellom venner.

## Tre typer miljøer

### Åpent miljø

Et åpent miljø:

- kan oppdages av ikke-medlemmer
- kan finnes gjennom søk og delbar lenke
- lar brukere melde seg inn uten individuell forhåndsgodkjenning

Miljøet kan likevel kreve at nye medlemmer fyller ut bestemte opplysninger før medlemskapet blir aktivt.

### Lukket miljø

Et lukket miljø:

- kan oppdages av ikke-medlemmer
- kan finnes gjennom søk og delbar lenke
- viser en begrenset offentlig forhåndsvisning
- krever godkjenning fra en administrator før vanlig medlemskap innvilges

Før medlemskap kan en bruker se:

- miljøets navn
- beskrivelse
- geografiske tilknytning
- eventuell målgruppe
- eventuelle regler eller krav for medlemskap
- omtrentlig medlemstall

Før medlemskap skal brukeren **ikke** kunne se:

- medlemsliste
- administratorenes identitet
- konkrete utlånsobjekter
- intern aktivitet
- samtaler
- annen informasjon som er ment for medlemmer

### Skjult miljø

Et skjult miljø:

- skal ikke være oppdagbart for ikke-medlemmer
- skal ikke avsløre sin eksistens gjennom vanlig søk eller navigasjon
- skal bare kunne nås gjennom en gyldig invitasjonsprosess initiert av en administrator

Kravet er et **personvernutfall**, ikke en bestemt URL-mekanisme. En nettapplikasjon kan ha en intern adresse til en ressurs uten at denne adressen gir uvedkommende kunnskap om ressursen. Den tekniske løsningen avgjøres senere.

## Opprettelse av miljø

Alle vanlige brukere skal kunne opprette et miljø. Oppretteren blir som utgangspunkt eier og administrator.

Ved opprettelse skal eller kan følgende oppgis:

### Påkrevd

- navn
- miljøtype: åpent, lukket eller skjult

### Valgfritt

- geografisk tilknytning
  - fylke
  - kommune
  - bydel der dette er relevant og tilgjengelig
  - et punkt eller et område på kart
- beskrivelse av målgruppen
- beskrivelse av hvilke typer objekter miljøet særlig er ment for
- andre opplysninger eller føringer

Miljønavn trenger **ikke** være globalt unike.

Flere miljøer kan derfor ha samme navn når det er naturlig. Systemet skal skille miljøene med en intern unik identifikator, mens brukerflaten ved behov kan vise relevant kontekst som geografisk område, organisasjon eller annen beskrivelse for å gjøre dem lette å skille.

## Geografisk oppdagelse

Åpne og lukkede miljøer skal kunne oppdages gjennom flere innganger:

- fritekstsøk
- geografisk filtrering
- kart
- direkte lenke

Søk skal kunne bruke mer enn bare navnet, for eksempel målgruppe, beskrivelse og geografisk tilknytning.

Kartbasert søk skal kunne finne miljøer som ligger i eller overlapper med et område brukeren angir.

Valg av kartleverandør og datakilder er ikke en del av visjonen.

## Invitasjoner og tips

### Åpne miljøer

Et vanlig medlem kan invitere andre, for eksempel:

- via e-post
- ved å velge en eksisterende venn i Lånbort
- ved å dele en vanlig lenke

Mottakeren kan også melde seg inn på egen hånd.

### Lukkede miljøer

Et vanlig medlem kan **tipse** andre om miljøet. Den som mottar tipset, må gjennom den vanlige innmeldingsprosessen og godkjennes av en administrator.

En administrator kan sende en særskilt invitasjon. En slik invitasjon betyr at administratoren allerede har vurdert hvem personen er og besluttet at vedkommende skal få adgang til miljøet.

Hvis miljøet krever obligatoriske medlemsopplysninger, må den inviterte fortsatt fylle dem ut før medlemskapet aktiveres. Opplysningene trenger derimot **ikke en ny administratorgodkjenning**. Administratorinvitasjonen regnes som forhåndsgodkjenning av medlemskapet.

Den inviterte må også eventuelt godta generelle regler eller vilkår som gjelder alle medlemmer.

### Skjulte miljøer

Bare administratorer skal kunne invitere.

En invitasjon kan for eksempel sendes til e-post eller til en eksisterende bruker. Ikke-medlemmer skal ellers ikke kunne oppdage miljøet.

## Krav ved innmelding

Administratorer skal kunne definere informasjon som nye medlemmer må oppgi, for eksempel:

- adresse eller leilighetsnummer
- medlemsnummer
- annen informasjon som viser tilknytning til miljøet

Kravene formuleres foreløpig som fritekst.

### Åpent miljø

Brukeren fyller ut den krevde informasjonen før medlemskapet aktiveres.

Det er foreløpig ikke tenkt manuell godkjenning bare fordi informasjon kreves.

### Lukket miljø

Opplysningene inngår i innmeldingsforespørselen.

En administrator kan:

- godkjenne
- be om mer informasjon
- avslå
- avslå og samtidig utestenge brukeren fra nytt forsøk

Dialog om innmeldingen skal skje i et separat saks-/forespørselssystem, ikke som vanlig privat chat.

### Skjult miljø

Brukeren må først være invitert av en administrator.

Invitasjonen innebærer at medlemskapet allerede er forhåndsgodkjent av administratoren. Hvis miljøet krever obligatoriske medlemsopplysninger, må den inviterte fortsatt fylle dem ut før medlemskapet aktiveres, men opplysningene skal ikke gjennom en ny manuell godkjenningsrunde.

## Administrasjon

En administrator kan invitere et annet medlem til å bli administrator. Rollen blir aktiv først når mottakeren godtar.

Alle administratorer skal i utgangspunktet ha samme løpende administrative myndighet. Særskilte rettigheter til å skjule eller slette miljøet kan være forbeholdt eieren eller delegeres av eieren.

## Fratreden og kontinuitet

Et miljø skal alltid ha minst én administrator.

En administrator skal kunne frasi seg rollen dersom minst én annen administrator gjenstår.

Hvis eneste administrator ønsker å fratre, må systemet støtte en kontrollert overføring. Det opprinnelige utkastet foreslår en periode der andre medlemmer kan melde seg som ny administrator, eventuelt med automatisk avvikling hvis ingen overtar. Mekanismen er foreløpig og må avklares.

## Permanent utestenging fra et miljø

En permanent utestengt bruker skal oppleve miljøet som om det **ikke eksisterer**.

Det innebærer at miljøet:

- ikke vises i søk eller kart
- ikke kan åpnes via direkte lenke
- ikke kan nås gjennom tips eller invitasjoner
- ikke viser navn, beskrivelse eller annen offentlig forhåndsvisning
- ikke gir tilgang til objekter, medlemmer eller aktivitet gjennom miljøet

Dette gjelder også dersom miljøet ellers er åpent eller lukket.

Administratorer skal senere kunne oppheve utestengingen. Selve utestengingen skal være sporbar som en administrativ handling.

### Pågående lån påvirkes ikke av miljøets synlighet

Et lån som allerede er opprettet gjennom miljøet, er en egen relasjon mellom utlåner og låntaker.

Hvis en av partene blir utestengt fra miljøet, skal derfor:

- miljøet forsvinne fullstendig for den utestengte
- pågående lån, reservasjoner og nødvendig lånehistorikk fortsatt være tilgjengelige i den vanlige låneflaten
- lånet kunne fullføres uten at brukeren får generell tilgang tilbake til miljøet

Miljøtilknytningen kan fortsatt bevares som intern kontekst for historikk, moderering og eventuell miljøbasert mekling, men den skal ikke brukes som en bakdør til miljøet for en utestengt bruker.

## Eierløse miljøer

Eieren skal alltid også være administrator.

Eieren skal kunne overføre eierskapet til en annen administrator.

Hvis eieren ønsker å fratre som administrator, må vedkommende først enten overføre eierskapet eller frasi seg det.

Visjonen åpner også for at eieren kan frasi seg eierskapet uten å utpeke en ny eier, slik at miljøet blir **eierløst**, forutsatt at minst én administrator fortsatt finnes.

Et eierløst miljø skal fortsatt kunne administreres.

### Midlertidig skjuling

Det opprinnelige forslaget er at én administrator kan foreslå skjuling, og at forslaget trer i kraft når én annen administrator godkjenner.

### Sletting

Det opprinnelige forslaget er:

- én administrator kan foreslå sletting
- alle administratorer får syv dager til å svare
- sletting gjennomføres dersom alle som faktisk svarer innen fristen, godkjenner
- ett eksplisitt avslag stanser slettingen

Dette er en detaljert, men fortsatt foreløpig styringsmekanisme.

## Bestridelse av sletting

Hvis en sletteforespørsel i et eierløst miljø blir avvist, skal en administrator kunne eskalere spørsmålet til plattformnivå.

Det opprinnelige forslaget innebærer:

- alle administratorer får en frist til å sende sin begrunnelse
- begrunnelsene er private mellom den enkelte administratoren og saksbehandleren
- administratorene får ikke se hverandres innlegg i denne fasen
- plattformforvalter kan stille oppfølgingsspørsmål individuelt eller samlet
- plattformforvalter avslutter saken med en beslutning om sletting eller fortsatt eksistens
- ny tilsvarende eskalering kan sperres en periode etter avsluttet sak

Den konkrete prosessen må senere vurderes både produktmessig og juridisk.

## Moderering av objekter i et miljø

Et miljø skal kunne ha en innstilling som krever administratorgodkjenning før et objekt blir synlig der.

En administrator som avviser et objekt, skal også kunne rapportere objektet til plattformnivå dersom det fremstår ulovlig, farlig eller på annen måte problematisk.

## Viktige åpne spørsmål

Blant annet må vi avklare:

- hvordan eneste administrator kan fratre
- hvilke slettemekanismer som er proporsjonale og forståelige

Se [Åpne spørsmål](open-questions.md).