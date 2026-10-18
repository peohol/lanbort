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

## A – Konto, innlogging og vennskap (11)

| ID | Prioritet | Testhandling | Forventet resultat |
| --- | :---: | --- | --- |
| A01 | B | Inviter ny deltaker, logg inn med e-postkode, fullfør alder og navn | Konto opprettes bare for invitert adresse; bruker kommer til Hjem |
| A02 | B | Forsøk registrering fra ikke-invitert adresse | Ingen konto opprettes og svaret røper ikke invitasjonsstatus |
| A03 | B | Prøv korrekt, feil, utløpt og gjentatt engangskode | Riktig kode virker; avslag forklares uten kontolekkasje |
| A04 | O | Logg ut og inn igjen, også på en annen nettleser | Konto, profil og vanlige data bevares |
| A05 | O | Rediger profil og varslings-/konto-innstillinger | Oppdateringer lagres og er synlige etter ny innlogging |
| A06 | O | Send, godta, avslå og trekk venneforespørsler | Begge parter ser korrekt relasjon uten feilaktige varsler |
| A07 | O | Spør eksisterende medlem om vennskap via e-post, med e-postvarsling av | Forespørselen kommer i appen; ingen uønsket e-post sendes |
| A08 | O | Produkteier inviterer ny adresse med «Spør også om å bli venner» | Innlogging blir mulig, og mottakeren får valgfri ventende forespørsel |
| A09 | O | Bli venner ved QR-kode og ved manuell kode | Skann gir forespørsel, ikke automatisk vennskap |
| A10 | U | Prøv utløpt/erstattet QR-kode, egen kode og ny forespørsel etter avslag | Avvises nøytralt uten å røpe relasjon |
| A11 | U | Blokker og opphev blokkering | Ny uønsket kontakt sperres; eksisterende låneforpliktelser bevares |

## M – Miljøer og medlemskap (12)

| ID | Prioritet | Testhandling | Forventet resultat |
| --- | :---: | --- | --- |
| M01 | B | Opprett åpent miljø og meld inn ny deltaker | Miljøet kan finnes; innmelding skjer uten manuell godkjenning |
| M02 | O | Opprett lukket miljø og søk medlemskap | Ikke-medlem ser begrenset informasjon; administrator må behandle |
| M03 | O | Be om mer informasjon i innmeldingssøknad | Søkeren ser spørsmålet og kan svare |
| M04 | O | Godkjenn og avslå søknader | Søkeren varsles riktig og får riktig adgang |
| M05 | O | Inviter eksisterende medlem til skjult miljø | Kun adressaten får invitasjon og kan velge |
| M06 | B | Søk etter skjult miljø som uvedkommende | Skjult miljø, medlemsliste og ting er utilgjengelige |
| M07 | O | Se miljøregler, medlemsliste, roller og publiserte ting som medlem | Bare opplysninger rollen gir rett til vises |
| M08 | O | Forlat miljø frivillig | Ny tilgang fjernes; eksisterende godkjente lån består |
| M09 | O | Inviter ny administrator og godta/avslå rolle | Rettigheter endres først etter gyldig aksept |
| M10 | U | Administrator avslutter medlemskap og vurderer ny søknad | Tiltaket er sporbar, adgang oppdateres og ny vurdering er mulig |
| M11 | U | Endre type eller medlemskrav på testmiljø | Påkrevde samtykker, frister og informasjon håndteres |
| M12 | U | Avvikle tomt testmiljø, deretter et miljø med historikk | Ingen ny aktivitet; bare berettiget historisk innsyn består |

## T – Ting, bilder, søk og medeierskap (15)

| ID | Prioritet | Testhandling | Forventet resultat |
| --- | :---: | --- | --- |
| T01 | B | Registrer ting med tittel, kategori og beskrivelse | Tingen opprettes riktig |
| T02 | B | Last opp 1–5 bilder; åpne både hovedbilde og øvrige bilder | Bildene vises riktig for dem som har tilgang |
| T03 | O | Endre bilder og slett/arkiver testting | Miniatyrbilder og historiske visninger oppfører seg riktig |
| T04 | O | Opprett og endre tilgjengelighetsperioder og vilkår | Endringene gjenspeiles på tingens side og i nye forespørsler |
| T05 | O | Publiser i ett/to miljøer og separat for venner | Synlighet følger hvert eksplisitte publiseringsvalg |
| T06 | O | Finn ting via Finn, vennefilter og miljøsøk | Relevante treff vises, uvedkommende treff ikke |
| T07 | O | Se ting som er utlånt, sperret eller ikke tilgjengelig | Nøytral status uten å røpe private årsaker |
| T08 | O | Finn egne og medeide ting under Mine ting | Status og handlinger er forståelige |
| T09 | O | Følg en tilgjengelig ting der funksjonen tilbys | Varsel/abonnement følger synlighet og tilgjengelighet |
| T10 | O | Arkiver og reaktiver en ting | Tingen forsvinner fra vanlig søk og kommer tilbake korrekt |
| T11 | U | Slett en testting uten forpliktelser | Slettingen respekterer historiske opplysninger og personvern |
| T12 | U | Prøv å slette en ting med aktivt/godkjent lån | Forpliktelsen hindrer feilaktig sletting |
| T13 | U | Inviter medeier; godta og administrer tingen fra begge kontoer | Rettigheter og endringshistorikk er korrekte |
| T14 | U | La medeier begrense tilgjengelighet og oppheve egen begrensning | Begrensning håndheves mot alle nye lån |
| T15 | U | Rediger samme ting samtidig på ulike enheter/medeiere | Ingen stille overskriving av nye endringer |

## L – Forespørsler, avtaler, overlevering og retur (20)

| ID | Prioritet | Testhandling | Forventet resultat |
| --- | :---: | --- | --- |
| L01 | B | Be venn om direktelån | Forespørsel opprettes i riktig vennskontekst med ansvarserklæring |
| L02 | B | Be om miljølån | Riktig miljøkontekst og mottaker beholdes |
| L03 | O | Velg start/slutt, vilkår og valgfri melding; kontroller oppsummering | Avtalegrunnlag vises forståelig før innsending |
| L04 | B | Godkjenn forespørsel som utlåner | Avtale og reservasjon opprettes én gang |
| L05 | O | Avslå og trekk tilbake ventende forespørsler | Begge ser endelig status og korrekt varsel |
| L06 | B | Send overlappende forespørsler på samme ting | Én godkjenning sperrer kolliderende lån |
| L07 | O | Endre vesentlige vilkår mens forespørsel venter | Låntaker må bekrefte endringer før avtale |
| L08 | B | Åpne Lån fra begge kontoer før og etter godkjenning | Korrekt status, part og neste steg vises |
| L09 | B | Bekreft faktisk overlevering | Lån går riktig fra reservert til utlånt |
| L10 | O | Foreslå forlengelse og annen avtaleendring; godta og avslå | Bare gjensidig godkjente og kollisjonsfrie endringer lagres |
| L11 | U | Kanseller godkjent lån før overlevering | Begge parter kan kansellere, reservasjon frigjøres |
| L12 | O | Låntaker registrerer retur | Utlåner ser ventende mottaksbekreftelse |
| L13 | B | Utlåner bekrefter mottatt ting | Lånet fullføres med uendret historikk |
| L14 | O | Angre returbekreftelse i løpet av 30 sekunder, prøv også utløpt frist | Angring kun innen frist; senere problem blir ny hendelse |
| L15 | O | Returner tidlig og søk senere i frigjort periode | Restperioden blir ledig dersom ingen annen sperre finnes |
| L16 | U | La overlevering/retur passere avtalte frister | Nøytral avklaring og korrekte varsler vises |
| L17 | U | La partene oppgi motstridende overleverings-/returopplysninger | Uenighet vises uten skyldplassering eller feilaktig gjenåpning |
| L18 | U | Registrer fiktiv skade, mangel eller tap på avtalt testlån | Begge forklaringer loggføres uten å omskrive hverandre |
| L19 | U | Opphev vennskap eller medlemskap etter godkjenning | Nødvendig adgang til å avslutte lånet består |
| L20 | U | Overfør ansvar mellom medeiere, eventuelt med låntakers aksept | Ansvar flyttes bare etter riktige samtykker |

## K – Varsler, chat og enheter (14)

| ID | Prioritet | Testhandling | Forventet resultat |
| --- | :---: | --- | --- |
| K01 | B | Utløs viktige varsler om nye forespørsler og oppgaver | Varsler kommer til rett bruker én gang |
| K02 | O | Trykk varsler fra ulike flater | Åpner rett lån, ting, forespørsel eller samtale |
| K03 | O | Utfør Hjem-oppgaver og se at de forsvinner fra ventelisten | Oppgavestatus oppdateres uten at andre skjules |
| K04 | O | Kontroller markering av nye varsler i appnavigasjonen | Teller/markering stemmer etter lesing |
| K05 | O | Skru av og på e-post- og chatvarsler | Preferanser følges; påkrevde sikkerhetsvarsler sendes |
| K06 | B | Aktiver privat chat med pilotsamtykke | Chat aktiveres først etter uttrykkelig bekreftelse |
| K07 | B | Send og motta privat melding mellom to inviterte | Bare samtalepartene kan lese meldingen |
| K08 | O | Demp samtale og fjern den fra samtalelisten | Egne valg påvirker bare eget innsyn/varsler |
| K09 | O | Koble ny mobil/PC til chatkontoen | Koblingen må godkjennes etter gjeldende protokoll |
| K10 | O | Se automatisk enhetstype/navn og gi manuelt navn/ikon | Enheter kan skilles fra hverandre |
| K11 | O | Godkjenn og tilbakekall chat-enhet | Sikkerhetsvarsel sendes og ny adgang stoppes ved tilbakekalling |
| K12 | U | Prøv recovery eller chat-tilbakestilling med isolert testkonto | Historikk/nøkler håndteres som dokumentert; ingen falsk gjenoppretting |
| K13 | U | Kontroller forventninger om lesebekreftelser og admininnsyn | Ingen falske lesebekreftelser eller administrator-tilgang |
| K14 | U | Blokker kontakt under aktivt lån | Ordinær chat stoppes, snever lånelogistikk består |

## R – Anmeldelser og tillit (7)

| ID | Prioritet | Testhandling | Forventet resultat |
| --- | :---: | --- | --- |
| R01 | O | La begge parter anmelde gjennomført lån | Rett skala/dimensjoner og bare gyldig anmelderrett |
| R02 | O | La én part unnlate å anmelde frem til 14-dagersfrist | Dobbelblind publisering og tidsfrist fungerer |
| R03 | O | Gi lav vurdering der begrunnelse kreves | Formular håndhever begrunnelse |
| R04 | O | Gi ett tilsvar på publisert anmeldelse | Bare ett tilsvar og uendret original |
| R05 | O | Se tillitsvisning fra forskjellige roller/kontekster | Riktige aggregerte signaler og datagrunnlag vises |
| R06 | U | Prøv anmeldelse fra skjult miljø mot uvedkommende | Kontekst, identitet og fritekst lekker ikke |
| R07 | U | Blokker motparten etter lånet, før anmeldelse | Opptjent anmeldelsesrett består |

## D – Miljøadministrasjon, rapporter og saker (10)

| ID | Prioritet | Testhandling | Forventet resultat |
| --- | :---: | --- | --- |
| D01 | O | La miljøadministrator motta medlems-/publiseringsoppgaver | Oppgavene vises på riktig sted med riktig status |
| D02 | O | Krev forhåndsgodkjenning og godkjenn/avvis publisering | Miljøsynlighet følger avgjørelsen |
| D03 | O | Send melding til miljøets administratorer | Sak oppstår i riktig administrativ kontekst |
| D04 | O | Rapporter testting, testperson eller testanmeldelse | Rapport går bare til habil/mulig behandlingsnivå |
| D05 | O | Tildel, behandle og lukk sak med avslutningsmelding | Partene får korrekt status uten konfidensielle data |
| D06 | U | Prøv mekling med motstridende forklaringer | Administrator ser kun uttrykkelig saksmateriale, aldri privat chat |
| D07 | U | La administrator være part i rapportert sak | Inhabil administrator mister behandlingsrett |
| D08 | U | Moderer publisering eller medlem i ett miljø | Tiltaket gjelder lokalt og har forklaring/historikk |
| D09 | U | Test sak i miljø uten habil administrator | Saken blir ventende uten falsk eskalering |
| D10 | B | Kontroller at global plattformforvaltning er av under pilot | Ingen aktive globale modereringsvalg vises |

## S – Personvern, kontolivssyklus og robusthet (9)

| ID | Prioritet | Testhandling | Forventet resultat |
| --- | :---: | --- | --- |
| S01 | B | Prøv direkte URL-er og søk mot skjulte data som utenforstående | Ingen skjulte ting, medlemsdata eller samtaler blir tilgjengelige |
| S02 | O | Finn personvern-/sikkerhetsinformasjon og kontaktkanal | Teksten er forståelig og samsvarer med faktisk drift |
| S03 | O | Bruk mobil og PC; logg inn/ut på ulike nettlesere | Normal kontodata og riktig enhetsmodell oppfører seg korrekt |
| S04 | U | Avbryt nettverk eller gjenta samme innsending på testdata | Ingen dobbeltsending eller doble lån |
| S05 | U | Deaktiver dedikert testkonto med eksisterende forpliktelser | Ingen nye avtaler; nødvendige avslutningshandlinger består |
| S06 | U | Slett dedikert testkonto uten aktive bindinger | Sletting/anonymisering følger dokumentert livssyklus |
| S07 | U | Forsøk sletting av konto med aktivt testlån | Aktive bindinger håndteres eksplisitt; intet stille tap |
| S08 | U | Prøv tilgang etter slettet ting, arkivert miljø eller bortfalt relasjon | Historiske data vises bare til dem med gyldig rett |
| S09 | B | Verifiser feillogger, alerting, sikkerhetskopi og driftsberedskap | Feil kan oppdages; ingen sensitiv data logges eller havner i offentlig repo |

## Dekning og sluttrapport

Katalogen inneholder **98 manuelle testpunkter** fordelt på åtte områder. Oppdater katalogen gjennom vanlig PR dersom funksjoner blir lagt til/fjernet. Ny ID skal ikke gjenbrukes. Den private journalen må skille mellom «prøvd og bestått», «prøvd og feilet», «blokkert», «ikke relevant» og «ikke prøvd».

Aggregert status (antall bestått/feilet/blokkert/ikke prøvd per område) kan offentliggjøres etter anonymisering. Ingen statistikk eller resultater foreligger ved opprettelsen av denne katalogen.
