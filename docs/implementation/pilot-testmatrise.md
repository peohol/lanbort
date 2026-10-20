# Lukket pilot – manuell testmatrise

> **Status:** Versjon 1.0, 18. oktober 2026. Dette er en offentlig **testkatalog**, ikke en resultatjournal. Ingen deltakeridentiteter, reelle hendelser eller skjermbilder skal registreres her.

**Tilhørende styringsdokument:** [Gjennomføringsplan for piloten](pilot-testplan.md). Kravgrunnlag: [produktspesifikasjonen](../product-spec/README.md), [brukerreisene](../ux/02-sentrale-brukerreiser.md), [skjerm- og flytinventaret](../ux/08-skjerm-og-flytinventar.md), [kvalitetsporter](quality-gates.md).

## Slik brukes matrisen

Hver ID er stabil på tvers av kodeendringer, testomganger og privat fremdriftsjournal.

- **B (basis):** må bestås før normal pilot kan gjennomføres; kjøres tidlig der det er mulig.
- **O (ordinær):** vanlig funksjon som skal prøves av ekte piloter, helst av to uavhengige brukerpar når det gjelder lån.
- **U (utvidet):** kontrollert scenario med fiktive hendelser/testobjekter; skal prøves minst én gang, med mindre funksjonen er dokumentert deaktivert i piloten.

**Bestått** betyr at den beskrevne sluttatferden ble observert av testeren på en faktisk enhet. En grønn automatisert test alene teller ikke som manuell pilotdekning. Bruk *Ikke relevant* med forklaring dersom funksjonen ikke finnes eller er deaktivert ved testtidspunktet; ikke merk den som Bestått.

Den private journalen har én post per ID per testgjennomføring, med status, tidspunkt, testerversjon, enhet og eventuell feilreferanse. Her nedenfor føres **ikke** resultater eller personopplysninger.

<!-- generert:pilot-tester start -->
## A – Konto, innlogging og vennskap (11)

| ID | Prioritet | Fase | Testhandling | Forventet resultat |
| --- | :---: | :---: | --- | --- |
| A01 | B | 1 | Inviter ny deltaker, logg inn med e-postkode, fullfør alder og navn | Konto opprettes bare for invitert adresse; bruker kommer til Hjem |
| A02 | B | 0 | Forsøk registrering fra ikke-invitert adresse | Ingen konto opprettes og svaret røper ikke invitasjonsstatus |
| A03 | B | 1 | Prøv korrekt, feil, utløpt og gjentatt engangskode | Riktig kode virker; avslag forklares uten kontolekkasje |
| A04 | O | 1 | Logg ut og inn igjen, også på en annen nettleser | Konto, profil og vanlige data bevares |
| A05 | O | 2 | Rediger profil og varslings-/konto-innstillinger | Oppdateringer lagres og er synlige etter ny innlogging |
| A06 | O | 1 | Send, godta, avslå og trekk venneforespørsler | Begge parter ser korrekt relasjon uten feilaktige varsler |
| A07 | O | 2 | Spør eksisterende medlem om vennskap via e-post, med e-postvarsling av | Forespørselen kommer i appen; ingen uønsket e-post sendes |
| A08 | O | 2 | Produkteier inviterer ny adresse med «Spør også om å bli venner» | Innlogging blir mulig, og mottakeren får valgfri ventende forespørsel |
| A09 | O | 2 | Bli venner ved QR-kode og ved manuell kode | Skann gir forespørsel, ikke automatisk vennskap |
| A10 | U | 4 | Prøv utløpt/erstattet QR-kode, egen kode og ny forespørsel etter avslag | Avvises nøytralt uten å røpe relasjon |
| A11 | U | 4 | Blokker og opphev blokkering | Ny uønsket kontakt sperres; eksisterende låneforpliktelser bevares |

## M – Miljøer og medlemskap (12)

| ID | Prioritet | Fase | Testhandling | Forventet resultat |
| --- | :---: | :---: | --- | --- |
| M01 | B | 1 | Opprett åpent miljø og meld inn ny deltaker | Miljøet kan finnes; innmelding skjer uten manuell godkjenning |
| M02 | O | 2 | Opprett lukket miljø og søk medlemskap | Ikke-medlem ser begrenset informasjon; administrator må behandle |
| M03 | O | 2 | Be om mer informasjon i innmeldingssøknad | Søkeren ser spørsmålet og kan svare |
| M04 | O | 2 | Godkjenn og avslå søknader | Søkeren varsles riktig og får riktig adgang |
| M05 | O | 2 | Inviter eksisterende medlem til skjult miljø | Kun adressaten får invitasjon og kan velge |
| M06 | B | 1 | Søk etter skjult miljø som uvedkommende | Skjult miljø, medlemsliste og ting er utilgjengelige |
| M07 | O | 2 | Se miljøregler, medlemsliste, roller og publiserte ting som medlem | Bare opplysninger rollen gir rett til vises |
| M08 | O | 3 | Forlat miljø frivillig | Ny tilgang fjernes; eksisterende godkjente lån består |
| M09 | O | 2 | Inviter ny administrator og godta/avslå rolle | Rettigheter endres først etter gyldig aksept |
| M10 | U | 4 | Administrator avslutter medlemskap og vurderer ny søknad | Tiltaket er sporbar, adgang oppdateres og ny vurdering er mulig |
| M11 | U | 4 | Endre type eller medlemskrav på testmiljø | Påkrevde samtykker, frister og informasjon håndteres |
| M12 | U | 4 | Avvikle tomt testmiljø, deretter et miljø med historikk | Ingen ny aktivitet; bare berettiget historisk innsyn består |

## T – Ting, bilder, søk og medeierskap (15)

| ID | Prioritet | Fase | Testhandling | Forventet resultat |
| --- | :---: | :---: | --- | --- |
| T01 | B | 1 | Registrer ting med tittel, kategori og beskrivelse | Tingen opprettes riktig |
| T02 | B | 1 | Last opp 1–5 bilder; åpne både hovedbilde og øvrige bilder | Bildene vises riktig for dem som har tilgang |
| T03 | O | 2 | Endre bilder og slett/arkiver testting | Miniatyrbilder og historiske visninger oppfører seg riktig |
| T04 | O | 2 | Opprett og endre tilgjengelighetsperioder og vilkår | Endringene gjenspeiles på tingens side og i nye forespørsler |
| T05 | O | 2 | Publiser i ett/to miljøer og separat for venner | Synlighet følger hvert eksplisitte publiseringsvalg |
| T06 | O | 2 | Finn ting via Finn, vennefilter og miljøsøk | Relevante treff vises, uvedkommende treff ikke |
| T07 | O | 3 | Se ting som er utlånt, sperret eller ikke tilgjengelig | Nøytral status uten å røpe private årsaker |
| T08 | O | 2 | Finn egne og medeide ting under Mine ting | Status og handlinger er forståelige |
| T09 | O | 2 | Følg en tilgjengelig ting der funksjonen tilbys | Varsel/abonnement følger synlighet og tilgjengelighet |
| T10 | O | 3 | Arkiver og reaktiver en ting | Tingen forsvinner fra vanlig søk og kommer tilbake korrekt |
| T11 | U | 4 | Slett en testting uten forpliktelser | Slettingen respekterer historiske opplysninger og personvern |
| T12 | U | 4 | Prøv å slette en ting med aktivt/godkjent lån | Forpliktelsen hindrer feilaktig sletting |
| T13 | U | 4 | Inviter medeier; godta og administrer tingen fra begge kontoer | Rettigheter og endringshistorikk er korrekte |
| T14 | U | 4 | La medeier begrense tilgjengelighet og oppheve egen begrensning | Begrensning håndheves mot alle nye lån |
| T15 | U | 4 | Rediger samme ting samtidig på ulike enheter/medeiere | Ingen stille overskriving av nye endringer |

## L – Forespørsler, avtaler, overlevering og retur (20)

| ID | Prioritet | Fase | Testhandling | Forventet resultat |
| --- | :---: | :---: | --- | --- |
| L01 | B | 1 | Be venn om direktelån | Forespørsel opprettes i riktig vennskontekst med ansvarserklæring |
| L02 | B | 1 | Be om miljølån | Riktig miljøkontekst og mottaker beholdes |
| L03 | O | 1 | Velg start/slutt, vilkår og valgfri melding; kontroller oppsummering | Avtalegrunnlag vises forståelig før innsending |
| L04 | B | 1 | Godkjenn forespørsel som utlåner | Avtale og reservasjon opprettes én gang |
| L05 | O | 3 | Avslå og trekk tilbake ventende forespørsler | Begge ser endelig status og korrekt varsel |
| L06 | B | 1 | Send overlappende forespørsler på samme ting | Én godkjenning sperrer kolliderende lån |
| L07 | O | 3 | Endre vesentlige vilkår mens forespørsel venter | Låntaker må bekrefte endringer før avtale |
| L08 | B | 1 | Åpne Lån fra begge kontoer før og etter godkjenning | Korrekt status, part og neste steg vises |
| L09 | B | 1 | Bekreft faktisk overlevering | Lån går riktig fra reservert til utlånt |
| L10 | O | 3 | Foreslå forlengelse og annen avtaleendring; godta og avslå | Bare gjensidig godkjente og kollisjonsfrie endringer lagres |
| L11 | U | 4 | Kanseller godkjent lån før overlevering | Begge parter kan kansellere, reservasjon frigjøres |
| L12 | O | 3 | Låntaker registrerer retur | Utlåner ser ventende mottaksbekreftelse |
| L13 | B | 1 | Utlåner bekrefter mottatt ting | Lånet fullføres med uendret historikk |
| L14 | O | 3 | Angre returbekreftelse i løpet av 30 sekunder, prøv også utløpt frist | Angring kun innen frist; senere problem blir ny hendelse |
| L15 | O | 3 | Returner tidlig og søk senere i frigjort periode | Restperioden blir ledig dersom ingen annen sperre finnes |
| L16 | U | 4 | La overlevering/retur passere avtalte frister | Nøytral avklaring og korrekte varsler vises |
| L17 | U | 4 | La partene oppgi motstridende overleverings-/returopplysninger | Uenighet vises uten skyldplassering eller feilaktig gjenåpning |
| L18 | U | 4 | Registrer fiktiv skade, mangel eller tap på avtalt testlån | Begge forklaringer loggføres uten å omskrive hverandre |
| L19 | U | 4 | Opphev vennskap eller medlemskap etter godkjenning | Nødvendig adgang til å avslutte lånet består |
| L20 | U | 4 | Overfør ansvar mellom medeiere, eventuelt med låntakers aksept | Ansvar flyttes bare etter riktige samtykker |

## K – Varsler, chat og enheter (14)

| ID | Prioritet | Fase | Testhandling | Forventet resultat |
| --- | :---: | :---: | --- | --- |
| K01 | B | 1 | Utløs viktige varsler om nye forespørsler og oppgaver | Varsler kommer til rett bruker én gang |
| K02 | O | 2 | Trykk varsler fra ulike flater | Åpner rett lån, ting, forespørsel eller samtale |
| K03 | O | 2 | Utfør Hjem-oppgaver og se at de forsvinner fra ventelisten | Oppgavestatus oppdateres uten at andre skjules |
| K04 | O | 2 | Kontroller markering av nye varsler i appnavigasjonen | Teller/markering stemmer etter lesing |
| K05 | O | 2 | Skru av og på e-post- og chatvarsler | Preferanser følges; påkrevde sikkerhetsvarsler sendes |
| K06 | B | 1 | Aktiver privat chat med pilotsamtykke | Chat aktiveres først etter uttrykkelig bekreftelse |
| K07 | B | 1 | Send og motta privat melding mellom to inviterte | Bare samtalepartene kan lese meldingen |
| K08 | O | 2 | Demp samtale og fjern den fra samtalelisten | Egne valg påvirker bare eget innsyn/varsler |
| K09 | O | 2 | Koble ny mobil/PC til chatkontoen | Koblingen må godkjennes etter gjeldende protokoll |
| K10 | O | 2 | Se automatisk enhetstype/navn og gi manuelt navn/ikon | Enheter kan skilles fra hverandre |
| K11 | O | 2 | Godkjenn og tilbakekall chat-enhet | Sikkerhetsvarsel sendes og ny adgang stoppes ved tilbakekalling |
| K12 | U | 4 | Prøv recovery eller chat-tilbakestilling med isolert testkonto | Historikk/nøkler håndteres som dokumentert; ingen falsk gjenoppretting |
| K13 | U | 4 | Kontroller forventninger om lesebekreftelser og admininnsyn | Ingen falske lesebekreftelser eller administrator-tilgang |
| K14 | U | 4 | Blokker kontakt under aktivt lån | Ordinær chat stoppes, snever lånelogistikk består |

## R – Anmeldelser og tillit (7)

| ID | Prioritet | Fase | Testhandling | Forventet resultat |
| --- | :---: | :---: | --- | --- |
| R01 | O | 3 | La begge parter anmelde gjennomført lån | Rett skala/dimensjoner og bare gyldig anmelderrett |
| R02 | O | 3 | La én part unnlate å anmelde frem til 14-dagersfrist | Dobbelblind publisering og tidsfrist fungerer |
| R03 | O | 3 | Gi lav vurdering der begrunnelse kreves | Formular håndhever begrunnelse |
| R04 | O | 3 | Gi ett tilsvar på publisert anmeldelse | Bare ett tilsvar og uendret original |
| R05 | O | 3 | Se tillitsvisning fra forskjellige roller/kontekster | Riktige aggregerte signaler og datagrunnlag vises |
| R06 | U | 4 | Prøv anmeldelse fra skjult miljø mot uvedkommende | Kontekst, identitet og fritekst lekker ikke |
| R07 | U | 4 | Blokker motparten etter lånet, før anmeldelse | Opptjent anmeldelsesrett består |

## D – Miljøadministrasjon, rapporter og saker (10)

| ID | Prioritet | Fase | Testhandling | Forventet resultat |
| --- | :---: | :---: | --- | --- |
| D01 | O | 2 | La miljøadministrator motta medlems-/publiseringsoppgaver | Oppgavene vises på riktig sted med riktig status |
| D02 | O | 2 | Krev forhåndsgodkjenning og godkjenn/avvis publisering | Miljøsynlighet følger avgjørelsen |
| D03 | O | 3 | Send melding til miljøets administratorer | Sak oppstår i riktig administrativ kontekst |
| D04 | O | 3 | Rapporter testting, testperson eller testanmeldelse | Rapport går bare til habil/mulig behandlingsnivå |
| D05 | O | 3 | Tildel, behandle og lukk sak med avslutningsmelding | Partene får korrekt status uten konfidensielle data |
| D06 | U | 4 | Prøv mekling med motstridende forklaringer | Administrator ser kun uttrykkelig saksmateriale, aldri privat chat |
| D07 | U | 4 | La administrator være part i rapportert sak | Inhabil administrator mister behandlingsrett |
| D08 | U | 4 | Moderer publisering eller medlem i ett miljø | Tiltaket gjelder lokalt og har forklaring/historikk |
| D09 | U | 4 | Test sak i miljø uten habil administrator | Saken blir ventende uten falsk eskalering |
| D10 | B | 0 | Kontroller at global plattformforvaltning er av under pilot | Ingen aktive globale modereringsvalg vises |

## S – Personvern, kontolivssyklus og robusthet (9)

| ID | Prioritet | Fase | Testhandling | Forventet resultat |
| --- | :---: | :---: | --- | --- |
| S01 | B | 1 | Prøv direkte URL-er og søk mot skjulte data som utenforstående | Ingen skjulte ting, medlemsdata eller samtaler blir tilgjengelige |
| S02 | O | 0 | Finn personvern-/sikkerhetsinformasjon og kontaktkanal | Teksten er forståelig og samsvarer med faktisk drift |
| S03 | O | 1 | Bruk mobil og PC; logg inn/ut på ulike nettlesere | Normal kontodata og riktig enhetsmodell oppfører seg korrekt |
| S04 | U | 4 | Avbryt nettverk eller gjenta samme innsending på testdata | Ingen dobbeltsending eller doble lån |
| S05 | U | 4 | Deaktiver dedikert testkonto med eksisterende forpliktelser | Ingen nye avtaler; nødvendige avslutningshandlinger består |
| S06 | U | 4 | Slett dedikert testkonto uten aktive bindinger | Sletting/anonymisering følger dokumentert livssyklus |
| S07 | U | 4 | Forsøk sletting av konto med aktivt testlån | Aktive bindinger håndteres eksplisitt; intet stille tap |
| S08 | U | 4 | Prøv tilgang etter slettet ting, arkivert miljø eller bortfalt relasjon | Historiske data vises bare til dem med gyldig rett |
| S09 | B | 0 | Verifiser feillogger, alerting, sikkerhetskopi og driftsberedskap | Feil kan oppdages; ingen sensitiv data logges eller havner i offentlig repo |
<!-- generert:pilot-tester slutt -->

## Dekning og sluttrapport

Katalogen inneholder **98 manuelle testpunkter** fordelt på åtte områder. Oppdater katalogen gjennom vanlig PR dersom funksjoner blir lagt til/fjernet. Ny ID skal ikke gjenbrukes. Den private journalen må skille mellom «prøvd og bestått», «prøvd og feilet», «blokkert», «ikke relevant» og «ikke prøvd».

Aggregert status (antall bestått/feilet/blokkert/ikke prøvd per område) kan offentliggjøres etter anonymisering. Ingen statistikk eller resultater foreligger ved opprettelsen av denne katalogen.
