# Brukere, roller og relasjoner

> **Status:** Konsolidert visjonsutkast. Rollemodellen og de sentrale grensene mellom bruker, administrator, eier og plattformforvalter er avklart.

## Grunnidé

En person har én bruker i Lånbort, men kan ha forskjellige roller i forskjellige sammenhenger.

Det er derfor mer presist å se rollene som **kontekstuelle rettigheter** enn som tre globale «brukernivåer».

En bruker kan for eksempel være vanlig medlem i ett miljø, administrator i et annet, eier av et tredje og samtidig låntaker eller utlåner i konkrete lån.

## Brukeridentitet og grunnkrav

For den første versjonen og en eventuell begrenset pilot skal en bruker:

- være minst 18 år
- oppgi sitt virkelige navn
- ha minst én verifisert kontaktkanal

Den konkrete kontaktkanalen eller kombinasjonen av kontaktkanaler bestemmes senere. Poenget er at kontoen ikke bare skal være knyttet til en uverifisert opplysning.

BankID skal **ikke være et krav fra start**, blant annet fordi hver identitetsverifisering har en kostnad som ikke passer med målet om en gratis app i pilot- og tidligfase.

Ved en eventuell senere bred utrulling kan sterk identitetsverifisering, for eksempel BankID, vurderes på nytt dersom behov, kostnad og finansieringsmodell gjør det rimelig.

## Vanlig bruker

En vanlig bruker skal kunne:

- opprette og administrere sin egen profil
- opprette utlånsobjekter
- bli medlem av miljøer
- publisere egne eller medeide objekter i miljøer der hen har adgang
- be om å få låne objekter
- kommunisere med andre innenfor reglene for kontakt
- bli venn med andre brukere
- abonnere på objekter
- anmelde gjennomførte utlån
- rapportere problematisk innhold eller adferd

## Medlem av et miljø

Medlemskap gir adgang til det aktuelle miljøets innhold etter miljøets regler.

Et medlem skal kunne opptre som vanlig bruker i miljøet, men kan ikke endre miljøets administrative innstillinger med mindre hen også er administrator.

## Administrator

Administratorrollen gjelder i et bestemt miljø.

En administrator skal ha alle vanlige medlemsrettigheter og i tillegg kunne utføre administrative oppgaver, blant annet:

- behandle innmeldingsforespørsler
- invitere brukere der miljøtypen tillater det
- endre miljøets innstillinger
- behandle miljørelaterte saker og konflikter
- moderere innhold etter miljøets regler
- eventuelt forhåndsgodkjenne objekter før publisering
- invitere andre medlemmer til å bli administratorer

Administratorer skal fortsatt kunne bruke miljøet som vanlige medlemmer. Når en administrator låner eller låner bort en gjenstand, opptrer hen i denne sammenhengen som bruker, ikke som administrator.

## Eier av et miljø

Et miljø kan ha én **eier**.

Eierrollen er ikke en alternativ rolle til administrator. Den er en **tilleggsstatus som bare kan innehas av en administrator**.

Det innebærer at:

- oppretteren er i utgangspunktet både eier og administrator
- et aktivt miljø skal normalt ha nøyaktig én eier
- eieren har alle vanlige administratorrettigheter
- eierskapet kan bare overføres til en annen administrator
- en eier kan ikke frasi seg administratorrollen uten først å overføre eierskapet eller starte avvikling av miljøet

Eierrollen er knyttet til særskilt forvaltningsansvar for miljøets fortsatte eksistens og administratorgruppe. Eieren skal blant annet kunne:

- overføre eierskapet til en annen administrator
- starte eller avbryte en kontrollert frivillig avvikling av miljøet
- fjerne administratorrollen fra en annen administrator

Andre administratorer skal ikke kunne frata hverandre administratorrollen.

Eierrollen skal ikke gi særskilt myndighet i konkrete lån, konflikter eller saker utover de rettighetene personen ellers har som administrator, utlåner eller låntaker. Eieren skal heller ikke få ekstra tilgang til private samtaler eller rett til å omskrive historikk.

Dersom en eier eller administrator alvorlig misbruker rollen eller bryter plattformreglene, kan plattformforvalter gripe inn som et sikkerhets- eller modereringstiltak, for eksempel ved å suspendere administrative rettigheter eller gjennomføre en kontrollert eierskapsoverføring. Dette skal være et særtilfelle, ikke en ordinær styringsmekanisme.

Eierløshet skal ikke være en ordinær, varig driftsform. Den kan oppstå midlertidig dersom eieren forsvinner uten kontrollert overføring, for eksempel fordi kontoen deaktiveres eller slettes. Da skal systemet forsøke å etablere en ny eier blant gjenværende administratorer før miljøet eventuelt går til avvikling.

## Plattformforvalter

**Plattformforvalter** er en global produktrolle i Lånborts UI og rettighetsmodell.

Rollen er skilt fra miljøadministratorer ved at myndigheten gjelder på tvers av miljøer. Den kan blant annet brukes til å:

- behandle saker som etter produktets regler hører hjemme på plattformnivå
- få innsyn i slike saker når dette er nødvendig
- håndtere alvorlige rapporter om innhold eller brukere
- gripe inn overfor miljøer når plattformens regler eller sikkerhet krever det
- utføre særskilte plattformomfattende administrative handlinger

I første omgang vil repo-eieren kunne være den eneste plattformforvalteren, men rollen skal kunne gis til andre betrodde personer senere.

### Ikke en systemutviklerrolle

Systemutviklere, kodeagenter og andre som arbeider med å utvikle eller drifte Lånbort skal **ikke ha en egen brukerrolle i appens UI bare fordi de er utviklere**.

Produktrollene i denne visjonen beskriver hva en innlogget bruker kan se og gjøre i Lånbort. De beskriver ikke arbeidsfordelingen blant dem som bygger systemet.

Hvis en person som også er systemutvikler skal ha plattformforvaltermyndighet, må vedkommende tildeles denne produktrollen eksplisitt på samme grunnlag som andre. Teknisk tilgang til kode, hosting eller database skal ikke i seg selv gi en tilsvarende UI-rolle eller organisatorisk myndighet.

## Vennskap

Brukere skal kunne sende venneforespørsler til andre brukere de kan se, for eksempel gjennom et felles miljø.

Når begge har godtatt, regnes de som venner.

Vennskap skal gjøre det enklere å:

- finne hverandre igjen
- kontakte hverandre direkte
- låne objekter direkte av hverandre uten at lånet må være knyttet til et miljø
- invitere hverandre til miljøer der dette er tillatt
- eventuelt få tilgang til mer profilinformasjon hvis brukeren har valgt det

En bruker skal når som helst kunne fjerne en venn.

## Profil og synlighet

Brukeren skal kunne kontrollere hvilken profilinformasjon som er synlig:

- for brukere generelt
- for venner
- bare for brukeren selv

Den nøyaktige listen over profilfelt er ikke bestemt.

## Kontakt mellom brukere som ikke er venner

Visjonen søker å unngå at fremmede kan sende ubegrensede direktemeldinger.

En bruker som ikke er venn med mottakeren, skal derfor i utgangspunktet bare kunne initiere kontakt i en legitim produktkontekst.

Direkte lån utenfor miljøer er ikke tilgjengelig mellom brukere som ikke er venner. Dersom to ikke-venner skal kunne gjennomføre et lån, må objektet være tilgjengelig gjennom et miljø der lånet kan initieres etter miljøets regler. Kontakt kan da for eksempel gjelde:

- en låneforespørsel på et objekt som er publisert i miljøet
- et spørsmål om et konkret objekt som er synlig i miljøet

Før mottakeren har akseptert videre samtale, skal avsenderen ikke kunne fortsette med fri meldingsutveksling. Mottakeren skal heller ikke på dette stadiet påføres sosialt press gjennom for eksempel lesebekreftelse.

## Blokkering

En bruker skal kunne blokkere en annen bruker, uavhengig av om de tidligere har vært venner.

Blokkering skal forstås som en **kontakt- og synlighetsregel**, ikke som en mekanisme for å omskrive felles historikk eller oppheve eksisterende forpliktelser.

Hovedregelen er at den blokkerte ikke skal kunne bruke vanlige produktflater til å:

- finne eller kontakte den som har blokkert
- sende nye venneforespørsler, direktemeldinger eller låneforespørsler
- se profil, objekter eller vanlig aktivitet fra den som har blokkert

Et eksisterende vennskap opphører ved blokkering.

At partene fortsatt er medlemmer av samme miljø opphever ikke blokkeringen. De kan fortsatt være medlemmer av miljøet, men produktet skal så langt det er praktisk mulig unngå å eksponere dem for hverandre gjennom ordinære oppdagelses- og kontaktflater.

### Eksisterende lån, saker og historikk

Blokkering skal ikke gjøre det umulig å fullføre forhold som allerede eksisterer.

Ved et reservert eller aktivt lån skal begge parter fortsatt kunne se den nødvendige låneflaten, strukturerte hendelser, frister og handlinger som kreves for å gjennomføre eller avslutte lånet. Vanlig fri chat mellom partene kan derimot stenges av blokkeringen. Produktet skal da støtte fullføring med minst mulig nødvendig direkte kontakt.

Ved en åpen sak beholder begge den tilgangen som følger av saksrollen. Blokkering skal ikke kunne brukes til å skjule saken, trekke tilbake nødvendig historikk eller hindre autorisert saksbehandling. Saksprosessen skal heller ikke åpne en ny generell direktekontakt mellom partene.

Tidligere strukturerte lån, anmeldelser, rollehendelser og annen nødvendig felles historikk slettes ikke av blokkering.

Når det ikke lenger finnes aktive lån, saker eller andre nødvendige felles forpliktelser, gjelder blokkeringen fullt ut.

### Blokkering og opptjente anmeldelsesrettigheter

Blokkering skal ikke fjerne anmeldelsesrettigheter som allerede er opptjent gjennom et gjennomført eller ellers vurderingsberettiget lån.

Begge parter kan fortsatt levere anmeldelse innen den ordinære fristen, og den anmeldte kan fortsatt gi det ene tilsvaret som anmeldelsesmodellen tillater. Dette regnes som del av den felles lånehistorikken, ikke som gjenåpnet direktekontakt.

Blokkeringen skal fortsatt stanse fri chat, nye vennskapsforespørsler, nye lån og annen ordinær kontakt. Anmeldelser og tilsvar skal kunne rapporteres og modereres etter de vanlige reglene.

### Blokkering og medeierskap

Hvis to registrerte medeiere av samme objekt blokkerer hverandre, skal objektet fryses for nye utlån. Det skal skjules fra andre brukeres ordinære oppdagelsesflater og skal ikke kunne inngå i nye lån.

Alle ikke-godkjente låneforespørsler på objektet avsluttes nøytralt når denne frysingen oppstår. Tredjeparten skal ikke få opplyst at årsaken er konflikt eller blokkering mellom medeierne.

Allerede reserverte eller aktive lån fortsetter etter de vanlige reglene. Nødvendige strukturerte handlinger rundt slike eksisterende lån skal fortsatt være tilgjengelige selv om fri kontakt mellom medeierne er blokkert.

For at objektet igjen skal kunne lånes ut, må medeierskapet avklares slik at objektet har én registrert eier. Det er ikke tilstrekkelig bare å oppheve blokkeringen.

Hvis en potensiell låntaker og én av flere medeiere har en aktiv blokkering i noen retning, skal det medeide objektet ikke kunne inngå i et nytt lån med denne brukeren. Objektet bør ikke vises for brukeren i ordinære oppdagelsesflater, og blokkeringens eksistens eller hvilken medeier den gjelder skal ikke avsløres.

### Brukerkontroll

Blokkering skal kunne gjøres uten rapport eller begrunnelse.

Den blokkerte skal ikke få et eksplisitt systemvarsel om hvem som har blokkert vedkommende. Produktet trenger samtidig ikke love at blokkeringen er umulig å utlede indirekte, for eksempel dersom et vennskap eller kontaktmuligheter forsvinner.

## Medeierskap til objekter

Brukere kan ha felles eierskap til et utlånsobjekt. Dette er en objektrelasjon, ikke en generell brukerrolle.

Detaljene beskrives i [Utlånsobjekter](04-utlansobjekter.md).

## Detaljer som fastsettes senere

Den konkrete kontaktkanalen ved kontoopprettelse og den nøyaktige listen over profilfelt fastsettes i senere produktspesifikasjon. Dette endrer ikke de avklarte prinsippene for identitet, roller, relasjoner, synlighet og blokkering.