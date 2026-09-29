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

Invitasjon til et skjult miljø skal bare kunne sendes til en **eksisterende Lånbort-bruker** og skal være en intern, konto-bundet invitasjon i Lånbort.

Det skal ikke finnes e-postinvitasjoner, delbare invitasjonslenker eller andre overførbare lenker som kan brukes til å få adgang til et skjult miljø. En person uten Lånbort-konto må derfor først opprette en vanlig konto og kan deretter inviteres av en administrator.

Invitasjonen skal ikke kunne overføres til en annen bruker. En administrator som ønsker å invitere en annen person må sende en egen invitasjon til den aktuelle brukerens konto.

En ventende administratorinvitasjon skal tilhøre **miljøet**, ikke den enkelte administratoren som sendte den. Hvis avsenderen senere mister administratorrollen eller forlater miljøet, skal invitasjonen derfor som hovedregel fortsatt være gyldig.

Andre administratorer med nødvendig myndighet skal kunne trekke tilbake en ventende invitasjon. Invitasjonen skal også kunne falle bort dersom miljøet går til avvikling, ikke lenger tar inn medlemmer, eller plattformmoderering gjør den ugyldig som følge av misbruk eller andre alvorlige forhold.

Historikken skal kunne vise hvem som opprinnelig sendte invitasjonen og om eller hvorfor den senere ble trukket tilbake.

Et skjult miljø kan ha en intern teknisk adresse i nettapplikasjonen, men denne skal ikke fungere som en delbar oppdagelses- eller adgangsmekanisme. En uvedkommende som får tak i en slik adresse skal fortsatt ikke få meningsfull informasjon om miljøets eksistens.

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

### Habilitet i meklings- og konfliktsaker

En administrator som selv er part i en lånetvist, eller som har en tilsvarende direkte interessekonflikt, skal ikke få administratorinnsyn i saken og skal ikke kunne behandle den som saksbehandler. Vedkommende beholder bare den tilgangen som følger av egen rolle som part i lånet.

Hvis det ikke finnes noen habil administrator i miljøet, skal miljømekling regnes som utilgjengelig. Saken skal ikke automatisk eskaleres til plattformforvalter av den grunn.

For et miljøbasert lån som allerede er godkjent, følger retten til å bruke den aktuelle meklingsprosessen med lånet selv om en av partene senere ikke lenger er medlem av miljøet. Dette gir ikke tilbake generell medlemsadgang. Administrator kan avslutte meklingen når det ikke lenger fremstår rimelig eller nyttig å fortsette.

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

## Kontinuitet ved avvikling, utestengelse og manglende administrasjon

Når et miljø går til avvikling, skal ikke-godkjente låneforespørsler som bygger på miljøet avsluttes nøytralt. Allerede godkjente lån fortsetter etter de vanlige reglene.

Anmeldelsesrettigheter som allerede er opptjent gjennom lån i miljøet skal ikke falle bort fordi miljøet går til avvikling. En allerede åpnet meklingssak kan fortsette så lenge det finnes en habil og autorisert administrator som med rimelighet kan behandle den. Hvis slik behandling ikke lenger er mulig, avsluttes meklingen kontrollert uten automatisk eskalering til plattformforvalter.

Hvis et medlem utestenges eller på annen måte mister medlemskapet etter at et lån er godkjent, fortsetter lånet, nødvendige lånehandlinger, opptjente anmeldelsesrettigheter og eventuell allerede tilgjengelig miljømekling etter de samme prinsippene som ved ordinært opphør av medlemskap. Utestengelsen gir ikke brukeren ny eller generell adgang til miljøet.

Hvis et miljø midlertidig står uten administratorer, skal ventende innmeldingsforespørsler, administratorkontakter og andre prosesser som krever administratorbehandling ikke kunne avgjøres av uvedkommende. De kan stå på vent så lenge det finnes en realistisk kontinuitetsvei. Brukerne skal få tydelig beskjed om at behandling for øyeblikket ikke er tilgjengelig. Hvis administrasjon ikke gjenopprettes og miljøet går til avvikling, avsluttes de åpne prosessene kontrollert etter sin art.

Hvis eieren samtidig var eneste administrator og forsvinner uten overføring, kan miljøet ikke fortsette ordinær drift. Nye medlemskap, nye miljøbaserte lån og andre handlinger som krever administrasjon stanses, og miljøet går mot kontrollert avvikling dersom ingen gyldig ny administrator/eier kan etableres.

### Habilitet ved rapporter om administrator

En administrator som selv er gjenstand for en rapport eller annen administrativ vurdering fra et medlem, skal ikke behandle den samme rapporten eller en tett sammenvevd sak som saksbehandler. En annen habil administrator må overta dersom slik behandling skal skje på miljønivå. Hvis ingen habil administrator finnes, gjelder de vanlige reglene om at miljøbehandling ikke er tilgjengelig og at dette ikke i seg selv skaper en rett til plattformbasert tvisteløsning.

## Endring til skjult miljø

Hvis et eksisterende miljø endres til skjult, skal eksisterende medlemmer beholde medlemskapet med mindre miljøet beslutter noe annet etter sine vanlige regler. Eksisterende godkjente lån fortsetter uendret.

Fra det tidspunktet miljøet blir skjult, skal synlighetsreglene for skjulte miljøer gjelde for ikke-medlemmer. Historiske anmeldelser, spørsmål og annen miljøspesifikk sosial kontekst skal ikke fortsette å være synlig utenfor miljøet bare fordi den tidligere var knyttet til et åpent eller lukket miljø.

Ved senere avvikling av et skjult miljø kan nødvendig historisk kontekst fortsatt vises til direkte parter og andre som har et legitimt historisk behov, men miljøets eksistens og sosiale kontekst skal ikke gjøres oppdagbar for utenforstående.

## Detaljer som fastsettes senere

Følgende er bevisst utsatt til senere produktspesifikasjon og datalivssyklusarbeid:

- den konkrete fristen administratorer får til å melde interesse for å overta et midlertidig eierløst miljø
- den konkrete angrefristen ved frivillig avvikling
- konkrete lagrings- og slettetider etter avvikling

Prinsippene for kontinuitet og avvikling er allerede avklart.