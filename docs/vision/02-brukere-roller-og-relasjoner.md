# Brukere, roller og relasjoner

> **Status:** Førsteutkast. Rollemodellen er renskrevet fra `VISION.md`, men enkelte grenser må avklares.

## Grunnidé

En person har én bruker i Lånbort, men kan ha forskjellige roller i forskjellige sammenhenger.

Det er derfor mer presist å se rollene som **kontekstuelle rettigheter** enn som tre globale «brukernivåer».

En bruker kan for eksempel være vanlig medlem i ett miljø, administrator i et annet, eier av et tredje og samtidig låntaker eller utlåner i konkrete lån.

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

Visjonen forutsetter at et miljø kan ha én **eier**.

Oppretteren er i utgangspunktet både eier og administrator.

Eierrollen er tenkt som en særskilt forvaltningsrolle knyttet særlig til miljøets fortsatte eksistens. Eieren skal kunne:

- overføre eierskapet til en annen administrator
- gi andre administratorer rett til å skjule eller slette miljøet
- eventuelt gi denne retten til alle administratorer

Et miljø skal aldri ha mer enn én eier, men kan bli eierløst dersom eieren frasier seg eierskapet på en måte som ikke etterlater miljøet uten administrator.

Forholdet mellom eierrollen og administratorrollen trenger videre avklaring, særlig ved fratreden.

## Plattformrolle

Det opprinnelige notatet bruker **utvikler** om en global rolle med innsyn og myndighet på tvers av miljøer.

Denne rollen omfatter mer enn teknisk utvikling. Den innebærer også plattformforvaltning og i enkelte tilfeller behandling av eskalerte konflikter.

I produktvisjonen omtales dette foreløpig som **plattformansvarlig**. Endelig navn er ikke bestemt.

En plattformansvarlig skal kunne ha særskilt myndighet til blant annet:

- behandle saker som er eskalert utover et miljø
- få innsyn i saker når dette er nødvendig
- håndtere alvorlige rapporter om innhold eller brukere
- gripe inn overfor miljøer ved behov
- utføre plattformomfattende administrative handlinger

Denne rollen må senere avgrenses strengt. At en teknisk utvikler kan gjøre noe i systemet, betyr ikke automatisk at hen bør ha produktmessig eller organisatorisk rett til å gjøre det.

## Vennskap

Brukere skal kunne sende venneforespørsler til andre brukere de kan se, for eksempel gjennom et felles miljø.

Når begge har godtatt, regnes de som venner.

Vennskap skal gjøre det enklere å:

- finne hverandre igjen
- kontakte hverandre direkte
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

En bruker som ikke er venn med mottakeren, skal derfor i utgangspunktet bare kunne initiere kontakt i en legitim produktkontekst, for eksempel:

- en låneforespørsel
- et spørsmål om et konkret objekt

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