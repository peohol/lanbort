# Brukere, roller og relasjoner

> **Status:** Førsteutkast. Rollemodellen er renskrevet fra `VISION.md`, men enkelte grenser må avklares.

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
- et miljø kan aldri ha mer enn én eier
- eieren har alle vanlige administratorrettigheter
- eierskapet kan bare overføres til en annen administrator
- en eier kan ikke frasi seg administratorrollen uten først å overføre eller frasi seg eierskapet

Eierrollen er knyttet til særskilt forvaltningsansvar for miljøets fortsatte eksistens. Eieren skal blant annet kunne:

- overføre eierskapet til en annen administrator
- gi andre administratorer rett til å skjule eller slette miljøet
- eventuelt gi denne retten til alle administratorer

Et miljø kan bli eierløst dersom eieren frasier seg eierskapet, forutsatt at minst én administrator fortsatt finnes.

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

**Retning:** Den blokkerte skal ikke kunne bruke vanlige produktflater til å finne, kontakte eller se aktivitet og objekter fra den som har blokkert.

Det må senere defineres hvordan blokkering virker når partene samtidig:

- er medlemmer av samme miljø
- har et aktivt lån
- har en pågående sak
- trenger tilgang til historikk som ikke kan forsvinne midt i en konflikt

## Medeierskap til objekter

Brukere kan ha felles eierskap til et utlånsobjekt. Dette er en objektrelasjon, ikke en generell brukerrolle.

Detaljene beskrives i [Utlånsobjekter](04-utlansobjekter.md).

## Åpne spørsmål

De viktigste uavklarte spørsmålene for rolle- og relasjonsmodellen er samlet i [Åpne spørsmål](open-questions.md).