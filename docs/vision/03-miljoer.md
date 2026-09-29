# Miljøer

> **Status:** Konsolidert visjonsutkast. Miljøtypene, medlemsmodellen, administratorrollen, eierrollen og avviklingsprinsippene er avklart.

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
- har selvbetjent innmelding uten individuell vurdering fra en administrator

Miljøet kan likevel kreve at nye medlemmer fyller ut nødvendige opplysninger, godtar regler eller bekrefter en egenerklæring før medlemskapet blir aktivt. Eventuelle adgangskrav må være selvdeklarerte eller automatisk og entydig avgjørbare dersom miljøet fortsatt skal regnes som åpent.

Hvis medlemskap avhenger av at en administrator vurderer dokumentasjon, tilhørighet eller om oppgitte opplysninger er tilstrekkelige, skal miljøet bruke modellen for lukket miljø.

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

Et miljø skal bare kunne kreve medlemsopplysninger som har et konkret og relevant formål. Opplysninger skal ikke samles inn «for sikkerhets skyld».

Aktuelle opplysninger kan for eksempel være:

- bekreftelse på at brukeren tilhører målgruppen
- adresse eller leilighetsnummer når dette faktisk er relevant for medlemskapet
- medlemsnummer
- annen informasjon som dokumenterer eller beskriver tilknytning til miljøet

Kravene kan i første omgang formuleres som fritekst.

### Åpent miljø

Brukeren kan måtte:

- fylle ut enkelte nødvendige opplysninger
- godta miljøets regler
- bekrefte en egenerklæring
- oppfylle et automatisk og entydig kontrollerbart krav

Medlemskapet skal deretter kunne aktiveres uten individuell administratorvurdering.

Opplysninger som krever menneskelig vurdering av om brukeren faktisk oppfyller medlemsvilkårene, for eksempel kontroll av bosted, organisasjonsmedlemskap eller dokumentasjon, hører hjemme i et lukket miljø.

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

Alle administratorer skal ha samme løpende administrative myndighet i den ordinære driften av miljøet.

Eieren har i tillegg et avgrenset organisatorisk ansvar for kontinuitet og administratorgruppen. Bare eieren kan:

- overføre eierskapet
- starte eller avbryte en frivillig avvikling
- fjerne administratorrollen fra en annen administrator

Andre administratorer skal ikke kunne degradere eller fjerne hverandre.

Eierstatus skal ikke gi ekstra myndighet i konkrete lån, konflikter eller saker, og skal ikke gi særskilt tilgang til privat kommunikasjon.

Ved alvorlig misbruk av eier- eller administratorrollen kan plattformforvalter gripe inn etter plattformens modereringsregler, blant annet ved å suspendere administrative rettigheter eller gjennomføre en kontrollert eierskapsoverføring. Dette er et sikkerhets- og modereringstiltak, ikke en normal intern styringsmekanisme.

## Fratreden, eierskap og kontinuitet

Et aktivt miljø skal normalt ha:

- minst én administrator
- nøyaktig én eier
- en eier som også er administrator

En administrator som ikke er eier, kan frasi seg administratorrollen så lenge minst én administrator fortsatt gjenstår.

En eier som ønsker å trekke seg, skal ikke kunne etterlate miljøet permanent eierløst. Eieren må enten:

1. overføre eierskapet til en annen administrator, eller
2. starte en kontrollert avvikling av miljøet.

Hvis eieren samtidig er eneste administrator og ønsker å fortsette miljøet, må en ny administrator først overta eierskapet.

## Midlertidig eierløst miljø

Eierløshet skal behandles som en **midlertidig unntakstilstand**, ikke som en normal organisasjonsform.

Den kan for eksempel oppstå dersom eierens konto forsvinner eller blir utilgjengelig uten at eierskapet først ble overført.

Hvis andre administratorer finnes, skal de varsles og få mulighet til å overta eierskapet.

Hvis flere administratorer ønsker å overta, skal bare administratorer som aktivt melder at de vil bli ny eier inngå i utvelgelsen. Dersom flere melder seg innen fristen, får den av kandidatene som har vært administrator i miljøet sammenhengende lengst eierskapet.

Regelen er bevisst enkel og skal sikre forutsigbar kontinuitet uten å innføre avstemning eller et kappløp om å reagere først på et varsel. Den konkrete fristen for å melde interesse bestemmes senere.

Hvis ingen administrator overtar innen fristen, går miljøet over i avvikling.

## Avvikling av miljø

Eieren skal kunne starte en kontrollert avvikling av miljøet.

Avvikling skal være en egen tilstand, ikke det samme som umiddelbar permanent sletting.

Når avviklingen starter:

- miljøet skal ikke lenger ta inn nye medlemmer
- nye lån skal ikke kunne opprettes gjennom miljøet
- miljøet kan skjules fra vanlig oppdagelse
- eksisterende lån fortsetter i det felles lånesystemet og skal kunne fullføres normalt
- objektene forblir brukernes egne objekter, men publiseringen i miljøet opphører som del av avviklingen
- nødvendig historikk og aktive saker skal bevares så lenge de fortsatt trengs

En frivillig avvikling skal ha en tydelig angremulighet eller angrefrist før den blir endelig.

Når aktive forhold er avsluttet, kan miljøet arkiveres og senere slettes etter de generelle reglene for datalivssyklus.

Det skal ikke kreves avstemning blant administratorene, et bestemt antall administratorgodkjenninger eller eskalering til plattformforvalter bare for å avgjøre om et eierløst miljø skal bestå. Dersom ingen overtar eierskapet, er normalutfallet avvikling.

## Moderering av objekter i et miljø

Et miljø skal kunne ha en innstilling som krever administratorgodkjenning før et objekt blir synlig der.

En administrator som avviser et objekt, skal også kunne rapportere objektet til plattformnivå dersom det fremstår ulovlig, farlig eller på annen måte problematisk.

## Detaljer som fastsettes senere

Følgende er bevisst utsatt til senere produktspesifikasjon og datalivssyklusarbeid:

- den konkrete fristen administratorer får til å melde interesse for å overta et midlertidig eierløst miljø
- den konkrete angrefristen ved frivillig avvikling
- konkrete lagrings- og slettetider etter avvikling

Prinsippene for kontinuitet og avvikling er allerede avklart.