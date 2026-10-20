# Lukket pilot – manuell testmatrise

> **Status:** Versjon 1.1, 20. oktober 2026: hver test har fått en steg-for-steg-instruks og tydelige krav for når den er bestått. Dette er en offentlig **testkatalog**, ikke en resultatjournal. Ingen deltakeridentiteter, reelle hendelser eller skjermbilder skal registreres her.

**Tilhørende styringsdokument:** [Gjennomføringsplan for piloten](pilot-testplan.md). Kravgrunnlag: [produktspesifikasjonen](../product-spec/README.md), [brukerreisene](../ux/02-sentrale-brukerreiser.md), [skjerm- og flytinventaret](../ux/08-skjerm-og-flytinventar.md), [kvalitetsporter](quality-gates.md).

## Slik brukes matrisen

Hver ID er stabil på tvers av kodeendringer, testomganger og privat fremdriftsjournal.

Under hver områdetabell står testene i sin helhet: hva som må være klart før du starter, stegene i rekkefølge, og hva du må se for at testen er bestått. Alle punktene under «Testen er bestått når» må stemme. Pilotflaten viser den samme instruksen på testens side. **Konto A** er den som tester (eier, utlåner eller administrator), **Konto B** er motparten, **Konto C** er en utenforstående uten relasjon til dem, og **Konto D** er en ekstra testkonto der testen trenger en til. **Produkteier** er produkteierens egen konto. Bruk egne testkontoer og bare oppdiktede navn og hendelser.

- **B (basis):** må bestås før normal pilot kan gjennomføres; kjøres tidlig der det er mulig.
- **O (ordinær):** vanlig funksjon som skal prøves av ekte piloter, helst av to uavhengige brukerpar når det gjelder lån.
- **U (utvidet):** kontrollert scenario med fiktive hendelser/testobjekter; skal prøves minst én gang, med mindre funksjonen er dokumentert deaktivert i piloten.

**Bestått** betyr at den beskrevne sluttatferden ble observert av testeren på en faktisk enhet. En grønn automatisert test alene teller ikke som manuell pilotdekning. Bruk *Ikke relevant* med forklaring dersom funksjonen ikke finnes eller er deaktivert ved testtidspunktet; ikke merk den som Bestått.

Den private journalen har én post per ID per testgjennomføring, med status, tidspunkt, testerversjon, enhet og eventuell feilreferanse. Her nedenfor føres **ikke** resultater eller personopplysninger.

<!-- generert:pilot-tester start -->
## A – Konto, innlogging og vennskap (11)

| ID | Prioritet | Fase | Testhandling | Forventet resultat |
| --- | :---: | :---: | --- | --- |
| A01 | B | 1 | Inviter en ny person, og la vedkommende logge inn med e-postkode og fullføre kontoen | Personen som ble invitert, får e-post, kan logge inn med en kode og fylle ut navn og bekrefte at hen er over 18. Etterpå havner hen på Hjem. |
| A02 | B | 0 | Prøv å lage konto med en e-postadresse som ikke er invitert | Ingen konto blir laget, og ingen kode kommer. Det som står på skjermen, er det samme som for en invitert adresse, så man kan ikke se om adressen er invitert eller ikke. |
| A03 | B | 1 | Prøv riktig kode, feil kode, gammel kode og en kode som allerede er brukt | Riktig kode logger deg inn. Feil, utløpt eller allerede brukt kode blir avvist med samme melding, og meldingen røper ikke om e-postadressen har en konto. |
| A04 | O | 1 | Logg ut og inn igjen, også i en annen nettleser, og se at alt er der fortsatt | Etter at du har logget ut og inn igjen, både i samme og i en annen nettleser, er kontoen, profilen og tingene, lånene og vennene dine som før. |
| A05 | O | 2 | Endre profilbilde, varslingsvalg og utseende, og se at det er lagret etter ny innlogging | Endringene i profilbilde, hvem som ser bildet, og varslingsvalg blir lagret og er der fortsatt etter at du har logget ut og inn igjen. |
| A06 | O | 1 | Send, godta, avslå og trekk tilbake venneforespørsler mellom to personer | Begge ser til enhver tid om de er venner, har en ventende forespørsel eller ikke er venner. Det kommer bare varsel når en forespørsel kommer og når den blir godtatt, ikke ved avslag, tilbaketrekking eller fjernet vennskap. |
| A07 | O | 2 | Spør et medlem om å bli venner via e-postadressen når mottakeren har slått av e-postvarsler | Venneforespørselen dukker opp i appen hos mottakeren, men det kommer ingen e-post til mottakeren, fordi hen har slått av varsler på e-post. |
| A08 | O | 2 | Produkteieren inviterer en ny person og spør samtidig om å bli venner | Den nye personen kan logge inn og lage konto. Etterpå venter en venneforespørsel fra Produkteieren, som personen selv velger om hen vil godta eller avslå. |
| A09 | O | 2 | Bli venner ved å skanne QR-koden, og ved å skrive inn koden for hånd | Når du skanner eller skriver inn koden, blir det sendt en venneforespørsel. Dere blir ikke venner før den andre godtar den. |
| A10 | U | 4 | Prøv en utløpt eller erstattet QR-kode, din egen kode og en ny forespørsel etter et avslag | Alle forsøkene blir stoppet med en nøytral melding. Meldingen sier ikke om koden er utløpt, er din egen eller om den andre har avslått deg. |
| A11 | U | 4 | Blokker en person og opphev blokkeringen, og se at lån dere har avtalt, fortsetter | Den du blokkerer, kan ikke lenger finne deg eller ta ny kontakt med deg, men lån dere allerede har avtalt, fortsetter som før. Når du opphever blokkeringen, blir dere ikke automatisk venner igjen. |

### A01 – Inviter en ny person, og la vedkommende logge inn med e-postkode og fullføre kontoen

**Prioritet:** B · **Fase:** 1

**Forventet resultat:** Personen som ble invitert, får e-post, kan logge inn med en kode og fylle ut navn og bekrefte at hen er over 18. Etterpå havner hen på Hjem.

**Før du starter**

- Produkteierens konto, innlogget på én enhet (for eksempel PC).
- En e-postadresse som aldri har vært brukt i Lånbort, og som du kan lese e-posten til (for eksempel en egen testadresse). Den kalles «den nye adressen» under.
- En annen enhet, eller en privat nettleserfane, der ingen er logget inn i Lånbort. Her spiller du den nye personen.
- Bruk et oppdiktet navn, for eksempel «Testperson Ny».

**Slik gjør du det**

1. Som Produkteier: Trykk på det runde profilbildet ditt (eller initialene dine) øverst på skjermen for å åpne «Konto». Trykk «Venner».
2. Under «Legg til venner», trykk «Inviter en person». Se at siden heter «Inviter en person».
3. Skriv den nye adressen i feltet «E-postadresse». La avkrysningen «Spør også om å bli venner» stå tom (den prøves i A08). Trykk «Send invitasjon».
4. Se at det kommer en tekst som begynner med «Sendt til» og den nye adressen, og som sier «Er adressen ikke i Lånbort fra før, får personen en invitasjon på e-post.»
5. Som den nye personen: åpne e-posten for den nye adressen. Vent til det kommer en e-post med emnet «[Produkteierens navn] inviterer deg til Lånbort» (kan ta et par minutter, se også i søppelpost).
6. Trykk på lenken «Registrer deg i Lånbort» i e-posten, og åpne den i den private fanen eller på den andre enheten. Se at siden «Logg inn» åpnes.
7. Skriv den nye adressen i «E-postadresse» og trykk «Send kode». Se teksten «Er [adressen] invitert, har vi sendt en kode dit.»
8. Åpne e-posten «Din kode til Lånbort». Skriv den sekssifrede koden i feltet «Kode fra e-posten» og trykk «Bekreft».
9. Se at siden «Fullfør kontoen din» kommer. Trykk «Fullfør» uten å fylle ut noe, og se at du ikke kommer videre.
10. Skriv «Testperson Ny» i «Fullt navn», kryss av «Jeg bekrefter at jeg er 18 år eller eldre» og trykk «Fullfør».
11. Se at du kommer til Hjem: overskriften er «Hjem», og hovedmenyen med «Hjem», «Finn», «Lån», «Mine ting» og «Samtaler» vises.
12. Trykk på det runde profilbildet ditt (eller initialene dine) øverst på skjermen for å åpne «Konto», og se at navnet «Testperson Ny» står øverst.

**Testen er bestått når**

- Invitasjonen kom fram på e-post med Produkteierens navn og lenken «Registrer deg i Lånbort».
- Koden fra e-posten «Din kode til Lånbort» ble godtatt for den nye adressen.
- Siden «Fullfør kontoen din» krevde fullt navn og avkrysning for 18 år før «Fullfør» gikk videre.
- Etter «Fullfør» kom personen til Hjem, og «Konto» viser navnet som ble skrevet inn.

### A02 – Prøv å lage konto med en e-postadresse som ikke er invitert

**Prioritet:** B · **Fase:** 0

**Forventet resultat:** Ingen konto blir laget, og ingen kode kommer. Det som står på skjermen, er det samme som for en invitert adresse, så man kan ikke se om adressen er invitert eller ikke.

**Før du starter**

- En e-postadresse som aldri er invitert til eller brukt i Lånbort, og som du kan lese e-posten til. Den kalles «den uinviterte adressen» under.
- E-postadressen til Konto A (en vanlig, invitert konto) til sammenligning.
- To private nettleserfaner der ingen er logget inn i Lånbort.

**Slik gjør du det**

1. I den første private fanen: åpne Lånbort og trykk «Logg inn eller opprett konto».
2. Se at overskriften er «Logg inn» og at det står «Lånbort er foreløpig bare åpent for dem som er invitert. Vi sender deg en engangskode på e-post.»
3. Skriv den uinviterte adressen i «E-postadresse» og trykk «Send kode». Skriv ned teksten som kommer (den skal være «Er [adressen] invitert, har vi sendt en kode dit.»). Se at feltet «Kode fra e-posten» vises.
4. I den andre private fanen: gjør det samme med Konto A sin adresse. Se at teksten er nøyaktig lik, bare med en annen adresse.
5. Vent 10 minutter. Se i innboksen og søppelposten til den uinviterte adressen at det ikke har kommet noen e-post «Din kode til Lånbort».
6. I den første fanen: skriv en oppdiktet kode, for eksempel 123456, og trykk «Bekreft». Skriv ned feilmeldingen.
7. I den andre fanen: skriv en feil kode for Konto A (for eksempel 123456, men ikke den riktige) og trykk «Bekreft». Se at feilmeldingen er nøyaktig den samme som i forrige steg: «Koden er feil eller utløpt. Sjekk e-posten eller be om en ny kode.»
8. I den første fanen: vent ett minutt, trykk «Send ny kode», og se at teksten er den samme som før. Vent 5 minutter og se at det fortsatt ikke kommer noen e-post.
9. Gå til Lånbort sin forside i den første fanen og se at du fortsatt ikke er logget inn (knappen «Logg inn eller opprett konto» vises).

**Testen er bestått når**

- Den uinviterte adressen fikk ingen e-post med kode, heller ikke etter «Send ny kode».
- Teksten etter «Send kode» var lik for den uinviterte adressen og for Konto A sin adresse.
- Feilmeldingen etter en oppdiktet kode var den samme for begge adressene, og ingen tekst sa noe om at adressen ikke er invitert eller ikke har konto.
- Den private fanen med den uinviterte adressen var fortsatt ikke logget inn til slutt.

### A03 – Prøv riktig kode, feil kode, gammel kode og en kode som allerede er brukt

**Prioritet:** B · **Fase:** 1

**Forventet resultat:** Riktig kode logger deg inn. Feil, utløpt eller allerede brukt kode blir avvist med samme melding, og meldingen røper ikke om e-postadressen har en konto.

**Før du starter**

- Konto A og tilgang til e-posten til Konto A.
- Den uinviterte adressen fra A02 (eller en annen adresse uten konto) til sammenligning.
- En privat nettleserfane der du ikke er logget inn.
- Avsett ca. 20 minutter: en kode varer i 10 minutter. Det går bare an å be om en ny kode én gang i minuttet, og høyst 5 koder per time. Får du «Det har vært for mange forsøk. Vent litt og prøv igjen.» når du trykker «Bekreft», vent 15 minutter og fortsett. Får du den når du ber om en kode, har adressen fått 5 koder den siste timen: vent til det har gått en time siden den første, eller fortsett med en annen testkonto.

**Slik gjør du det**

1. Åpne Lånbort i den private fanen, trykk «Logg inn eller opprett konto», skriv Konto A sin adresse og trykk «Send kode». Vent på e-posten «Din kode til Lånbort» (kode 1).
2. Feil kode: skriv en sekssifret kode som ikke er kode 1 (for eksempel kode 1 med siste siffer endret) og trykk «Bekreft». Se meldingen «Koden er feil eller utløpt. Sjekk e-posten eller be om en ny kode.» og at du fortsatt er på kodesiden.
3. Riktig kode: tøm feltet, skriv kode 1 og trykk «Bekreft». Se at du kommer til Hjem.
4. Trykk på det runde profilbildet ditt (eller initialene dine) øverst på skjermen for å åpne «Konto», trykk «Logg ut». Kommer det en egen side om privat chat, trykk «Logg ut» der også. Se at du er på forsiden med knappen «Logg inn eller opprett konto».
5. Brukt kode: trykk «Logg inn eller opprett konto», skriv Konto A sin adresse og trykk «Send kode». En ny e-post (kode 2) kommer – ikke bruk den nå. Skriv i stedet kode 1 og trykk «Bekreft». Se samme melding: «Koden er feil eller utløpt. Sjekk e-posten eller be om en ny kode.»
6. Utløpt kode: vent minst 11 minutter etter at kode 2 kom. Skriv kode 2 og trykk «Bekreft». Se den samme meldingen.
7. Trykk «Send ny kode». Skriv den nye koden (kode 3) fra e-posten og trykk «Bekreft». Se at du kommer til Hjem.
8. Sammenlign: i en ny privat fane, trykk «Logg inn eller opprett konto», skriv adressen uten konto og trykk «Send kode». Skriv 123456 og trykk «Bekreft». Se at meldingen er nøyaktig den samme som for Konto A.

**Testen er bestått når**

- Kode 1 (riktig, første gang) og kode 3 (ny kode) logget inn Konto A og viste Hjem.
- Feil kode, allerede brukt kode 1 og utløpt kode 2 ga alle meldingen «Koden er feil eller utløpt. Sjekk e-posten eller be om en ny kode.», og ingen av dem logget inn.
- Adressen uten konto fikk nøyaktig samme melding som Konto A ved feil kode.
- Ingen melding sa om adressen har konto, er invitert eller ikke.

### A04 – Logg ut og inn igjen, også i en annen nettleser, og se at alt er der fortsatt

**Prioritet:** O · **Fase:** 1

**Forventet resultat:** Etter at du har logget ut og inn igjen, både i samme og i en annen nettleser, er kontoen, profilen og tingene, lånene og vennene dine som før.

**Før du starter**

- Konto A som allerede har noe innhold: profilbilde, minst én venn, minst én ting i «Mine ting» og gjerne et lån.
- To nettlesere, for eksempel nettleseren på mobilen og en annen nettleser på PC-en (eller Chrome og Safari/Firefox på samme maskin).
- Privat chat er ikke en del av denne testen: hvis Samtaler ber deg koble til en ny enhet i den andre nettleseren, er det forventet.

**Slik gjør du det**

1. Logg inn som Konto A i nettleser 1. Trykk på det runde profilbildet ditt (eller initialene dine) øverst på skjermen for å åpne «Konto». Skriv ned navnet, hva som står under navnet om profilbildet, og antallet ved «Venner».
2. Åpne «Mine ting» og skriv ned hvor mange ting som står der og navnet på én av dem. Åpne «Lån» og skriv ned hvilke lån som står der.
3. Åpne «Konto» igjen og trykk «Logg ut». Kommer det en egen side om privat chat, les den og trykk «Logg ut». Se at du kommer til forsiden med knappen «Logg inn eller opprett konto».
4. Trykk «Logg inn eller opprett konto», skriv Konto A sin adresse, trykk «Send kode», skriv koden fra e-posten og trykk «Bekreft». Se at du kommer rett til Hjem uten å måtte fylle ut navn på nytt.
5. Sjekk «Konto», «Mine ting» og «Lån» mot det du skrev ned.
6. Åpne Lånbort i nettleser 2 og logg inn som Konto A på samme måte. Se at du kommer rett til Hjem.
7. Sjekk «Konto», «Mine ting» og «Lån» i nettleser 2 mot det du skrev ned.

**Testen er bestått når**

- Etter «Logg ut» var forsiden med «Logg inn eller opprett konto» vist, og du var ikke lenger innlogget.
- Ny innlogging gikk rett til Hjem, uten siden «Fullfør kontoen din».
- Navn, profilbilde og antall venner i «Konto» var det samme i begge nettlesere som før utloggingen.
- De samme tingene i «Mine ting» og de samme lånene i «Lån» var der i begge nettlesere.

### A05 – Endre profilbilde, varslingsvalg og utseende, og se at det er lagret etter ny innlogging

**Prioritet:** O · **Fase:** 2

**Forventet resultat:** Endringene i profilbilde, hvem som ser bildet, og varslingsvalg blir lagret og er der fortsatt etter at du har logget ut og inn igjen.

**Før du starter**

- Konto A, innlogget.
- Et testbilde som ikke viser en ekte person (for eksempel et bilde av en ting eller et landskap) lagret på enheten.
- En annen nettleser til slutt (valgfritt, se steg 9).
- Skriv ned hvordan innstillingene er før du begynner, så du kan sette dem tilbake etterpå.

**Slik gjør du det**

1. Trykk på det runde profilbildet ditt (eller initialene dine) øverst på skjermen for å åpne «Konto». Trykk på kortet med navnet og bildet ditt øverst. Siden «Profilbilde» åpnes.
2. Trykk «Legg til profilbilde» (eller «Bytt profilbilde» om du har et fra før) og velg testbildet. Flytt eller zoom utsnittet og trykk «Lagre bildet». Se at det nye bildet vises.
3. Under «Hvem ser profilbildet?», velg «Bare vennene dine».
4. Gå tilbake til «Konto». Se at det under navnet står «Profilbildet ser bare vennene dine», og at bildet øverst på skjermen er det nye.
5. Trykk «Varslingsvalg». Under «Til orientering», slå «På e-post» på. Under «Handling», slå «På e-post» på.
6. Gå tilbake til «Konto», trykk «Utseende» og velg «Mørkt». Se at appen blir mørk.
7. Gå tilbake til «Konto» og trykk «Logg ut» (og «Logg ut» igjen hvis det kommer en side om privat chat). Logg inn igjen som Konto A med kode fra e-posten.
8. Åpne «Konto» og sjekk: det nye bildet vises, under navnet står «Profilbildet ser bare vennene dine», og ved «Utseende» står «Mørkt». Åpne «Varslingsvalg» og se at «På e-post» er på både under «Handling» og under «Til orientering».
9. Valgfritt: logg inn som Konto A i en annen nettleser og sjekk bilde, «Profilbildet ser bare vennene dine» og «Varslingsvalg» på samme måte. (Utseende gjelder bare den enheten du valgte det på, så der står det «Følg systemet».)
10. Sett innstillingene tilbake slik de var før testen.

**Testen er bestått når**

- Det nye profilbildet vises i «Konto» og øverst på skjermen etter ny innlogging.
- Valget «Bare vennene dine» står fortsatt (teksten «Profilbildet ser bare vennene dine» i «Konto») etter ny innlogging.
- Begge bryterne «På e-post» (under «Handling» og «Til orientering») er fortsatt på etter ny innlogging.
- «Utseende» viser «Mørkt» etter ny innlogging i samme nettleser.

### A06 – Send, godta, avslå og trekk tilbake venneforespørsler mellom to personer

**Prioritet:** O · **Fase:** 1

**Forventet resultat:** Begge ser til enhver tid om de er venner, har en ventende forespørsel eller ikke er venner. Det kommer bare varsel når en forespørsel kommer og når den blir godtatt, ikke ved avslag, tilbaketrekking eller fjernet vennskap.

**Før du starter**

- Konto A og Konto B, som ikke er venner og ikke har noen ventende forespørsel mellom seg. Ingen av dem må ha avslått en forespørsel fra den andre tidligere.
- To enheter, for eksempel A på mobil og B på PC, eller én vanlig og én privat nettleserfane.
- Forespørslene sendes med vennekoden (QR-koden skrevet inn som tekst). Det er den enkleste måten å finne hverandre på.

**Slik gjør du det**

1. Send: Som Konto B: Trykk på det runde profilbildet ditt (eller initialene dine) øverst på skjermen for å åpne «Konto», trykk «Venner» og så «Min QR-kode». Under QR-koden står en kode med bokstaver og tall.
2. Som Konto A: Trykk på det runde profilbildet ditt (eller initialene dine) øverst på skjermen for å åpne «Konto», trykk «Venner», så «Skann QR-kode». Trykk «Skriv inn koden i stedet» hvis kameraet åpnes. Skriv koden til B og trykk «Finn personen». Se navnet til B og «Dere er ikke venner». Trykk «Send venneforespørsel».
3. Som Konto A: gå til «Venner». Se B under «Du har spurt · 1» med knappen «Trekk».
4. Godta: Som Konto B: trykk på bjella «Varsler» og se varselet «[A] vil bli venn med deg». Gå til «Konto» › «Venner», se A under «Vil bli venn med deg · 1», og trykk «Godta».
5. Se at A står under «Dine venner» hos B, og at B står under «Dine venner» hos A (last siden på nytt). Se at A har fått varselet «[B] godtok venneforespørselen din».
6. Fjern vennskapet før neste del: Som Konto A, trykk på B under «Dine venner». Trykk «Flere valg», så «Fjern [B] som venn», og bekreft med «Fjern [B] som venn» i vinduet som kommer. Se at ingen av dem har den andre under «Dine venner», og at B ikke fikk noe varsel om dette.
7. Avslå: Konto B viser «Min QR-kode» på nytt (trykk «Vis ny kode» hvis den gamle er utløpt). Konto A sender en ny forespørsel slik som i steg 2.
8. Som Konto B: gå til «Konto» › «Venner» og trykk «Avslå» ved A. Se at A forsvinner fra «Vil bli venn med deg».
9. Som Konto A: last «Venner» på nytt. Se at B ikke lenger står under «Du har spurt» og heller ikke under «Dine venner». Åpne «Varsler» og se at det ikke har kommet noe varsel om avslaget, og at ingenting sier «avslått».
10. Trekk: Som Konto A: åpne «Min QR-kode». Som Konto B: åpne «Skann QR-kode», skriv koden til A, trykk «Finn personen» og «Send venneforespørsel».
11. Som Konto A: se varselet «[B] vil bli venn med deg» og B under «Vil bli venn med deg». Ikke svar.
12. Som Konto B: gå til «Venner» og trykk «Trekk» ved A under «Du har spurt». Se at A forsvinner fra listen.
13. Som Konto A: last «Venner» på nytt og se at B ikke lenger står under «Vil bli venn med deg». Åpne varselet fra B i «Varsler» og se at det står «Forespørselen gjelder ikke lenger.», uten knappene «Godta» eller «Avslå».

**Testen er bestått når**

- Etter «Send venneforespørsel» sto B under «Du har spurt» hos A, og A under «Vil bli venn med deg» hos B.
- Etter «Godta» sto de under «Dine venner» hos hverandre, og A fikk varselet «[B] godtok venneforespørselen din».
- Etter «Avslå» var forespørselen borte hos begge, uten varsel til A og uten noen tekst som sa at den ble avslått.
- Etter «Trekk» var forespørselen borte hos A, og A sitt varsel sa «Forespørselen gjelder ikke lenger.» uten svarknapper.
- Ingen av dem fikk varsel om avslag, tilbaketrekking eller fjernet vennskap.

### A07 – Spør et medlem om å bli venner via e-postadressen når mottakeren har slått av e-postvarsler

**Prioritet:** O · **Fase:** 2

**Forventet resultat:** Venneforespørselen dukker opp i appen hos mottakeren, men det kommer ingen e-post til mottakeren, fordi hen har slått av varsler på e-post.

**Før du starter**

- Konto A og Konto B, som ikke er venner og ikke har noen ventende forespørsel mellom seg. Konto A må ikke være Produkteierens konto (Produkteieren får et annet skjema).
- Konto A kjenner e-postadressen Konto B logger inn med, og testeren kan lese e-posten til Konto B.
- To enheter, eller én vanlig og én privat nettleserfane.

**Slik gjør du det**

1. Som Konto B: Trykk på det runde profilbildet ditt (eller initialene dine) øverst på skjermen for å åpne «Konto» og trykk «Varslingsvalg». Sjekk at «På e-post» er slått av under «Handling» og under «Til orientering». Slå dem av hvis de er på.
2. Som Konto A: Trykk på det runde profilbildet ditt (eller initialene dine) øverst på skjermen for å åpne «Konto», trykk «Venner», og under «Legg til venner» trykk «Venneforespørsel på e-post».
3. Skriv e-postadressen til Konto B i «E-postadresse» og trykk «Send forespørsel».
4. Se teksten som begynner med «Sendt til» og B sin adresse, og som sier «Har personen en konto med denne adressen, kan de godta eller avslå forespørselen i appen.» og hvor lenge den gjelder.
5. Som Konto A: gå tilbake til «Venner». Se adressen under «Sendt på e-post · 1» med teksten «Venneforespørsel · gjelder til» og en dato om 14 dager, og knappen «Trekk».
6. Som Konto B: trykk på bjella «Varsler» og se varselet «[A] vil bli venn med deg». Åpne «Hjem» og se at forespørselen står der. Gå til «Konto» › «Venner» og se A under «Vil bli venn med deg».
7. Vent 15 minutter. Se i innboksen og søppelposten til Konto B at det ikke har kommet noen e-post fra Lånbort om forespørselen (verken «Du har fått en venneforespørsel» eller en invitasjon).
8. Som Konto B: trykk «Godta».
9. Som Konto A: se varselet «[B] godtok venneforespørselen din», og at B nå står under «Dine venner» og ikke lenger under «Sendt på e-post».

**Testen er bestått når**

- Konto B fikk forespørselen i appen: i «Varsler», på «Hjem» og under «Vil bli venn med deg».
- Det kom ingen e-post fra Lånbort til Konto B om forespørselen i løpet av 15 minutter.
- Bekreftelsen hos Konto A sa ikke om adressen har konto eller ikke.
- Etter «Godta» står de under «Dine venner» hos hverandre.

### A08 – Produkteieren inviterer en ny person og spør samtidig om å bli venner

**Prioritet:** O · **Fase:** 2

**Forventet resultat:** Den nye personen kan logge inn og lage konto. Etterpå venter en venneforespørsel fra Produkteieren, som personen selv velger om hen vil godta eller avslå.

**Før du starter**

- Produkteierens konto, innlogget.
- En e-postadresse som aldri har vært brukt i Lånbort, og som du kan lese e-posten til («den nye adressen»).
- En annen enhet eller en privat nettleserfane der ingen er logget inn. Bruk et oppdiktet navn, for eksempel «Testperson Venn».

**Slik gjør du det**

1. Som Produkteier: Trykk på det runde profilbildet ditt (eller initialene dine) øverst på skjermen for å åpne «Konto», trykk «Venner» og så «Inviter en person».
2. Se at avkrysningen «Spør også om å bli venner» er tom fra start. Skriv den nye adressen i «E-postadresse», kryss av «Spør også om å bli venner» og trykk «Send invitasjon».
3. Se teksten som begynner med «Sendt til» og sier «Venneforespørselen venter på dem i appen når de er med.»
4. Gå tilbake til «Venner» og se adressen under «Sendt på e-post» med teksten «Venneforespørsel · gjelder til» og en dato.
5. Som den nye personen: åpne e-posten «[Produkteierens navn] inviterer deg til Lånbort». Se at den sier «[navn] vil også bli venner med deg i Lånbort. Du kan godta eller avslå når du har registrert deg.» Trykk «Registrer deg i Lånbort».
6. Skriv den nye adressen, trykk «Send kode», skriv koden fra e-posten «Din kode til Lånbort» og trykk «Bekreft».
7. På «Fullfør kontoen din»: skriv «Testperson Venn» i «Fullt navn», kryss av «Jeg bekrefter at jeg er 18 år eller eldre» og trykk «Fullfør».
8. Se at du kommer til Hjem, og at forespørselen fra Produkteieren står der («[navn] vil bli venn med deg»). Åpne bjella «Varsler» og se samme forespørsel.
9. Trykk på det runde profilbildet ditt (eller initialene dine) øverst på skjermen for å åpne «Konto», trykk «Venner». Se Produkteieren under «Vil bli venn med deg» med knappene «Godta» og «Avslå», og at Produkteieren ikke står under «Dine venner».
10. Vis at det er valgfritt: åpne «Finn» og «Mine ting» uten å svare, og se at appen virker som vanlig.
11. Gå tilbake til «Venner» og trykk «Godta».
12. Som Produkteier: se varselet «Testperson Venn godtok venneforespørselen din», og at Testperson Venn står under «Dine venner».

**Testen er bestått når**

- Den nye adressen fikk invitasjon på e-post med teksten om at Produkteieren også vil bli venner, og kunne logge inn med kode og fullføre kontoen.
- Etter registreringen ventet en forespørsel fra Produkteieren under «Vil bli venn med deg», med «Godta» og «Avslå».
- De var ikke venner før den nye personen selv trykket «Godta», og appen kunne brukes uten å svare.
- Etter «Godta» står de under «Dine venner» hos hverandre.

### A09 – Bli venner ved å skanne QR-koden, og ved å skrive inn koden for hånd

**Prioritet:** O · **Fase:** 2

**Forventet resultat:** Når du skanner eller skriver inn koden, blir det sendt en venneforespørsel. Dere blir ikke venner før den andre godtar den.

**Før du starter**

- Konto A på en mobil med kamera.
- Konto B og Konto C på en annen enhet (for eksempel PC), etter tur. Ingen av dem er venner med A eller har ventende forespørsler med A.

**Slik gjør du det**

1. Med QR-kode: Som Konto B: Trykk på det runde profilbildet ditt (eller initialene dine) øverst på skjermen for å åpne «Konto», trykk «Venner» og «Min QR-kode». Se QR-koden og nedtellingen («… igjen»).
2. Som Konto A på mobilen: åpne «Konto» › «Venner» › «Skann QR-kode». Gi tillatelse til kameraet hvis mobilen spør. Hold kameraet mot QR-koden på B sin skjerm.
3. Se at A får opp navnet til B og «Dere er ikke venner». Se at dere ikke er venner ennå: B står ikke under «Dine venner» hos A.
4. Trykk «Send venneforespørsel». Se at det står at venneforespørselen er sendt.
5. Som Konto B: gå til «Venner». Se A under «Vil bli venn med deg», ikke under «Dine venner». Trykk «Godta». Se at A nå står under «Dine venner».
6. Med kode for hånd: Som Konto C: åpne «Konto» › «Venner» › «Min QR-kode». Se koden under teksten «Kan ikke den andre skanne? Den kan skrives inn i stedet:».
7. Som Konto A: åpne «Skann QR-kode», trykk «Skriv inn koden i stedet», skriv koden til C i feltet «Kode» og trykk «Finn personen».
8. Se navnet til C og «Dere er ikke venner». Trykk «Send venneforespørsel».
9. Som Konto C: gå til «Venner». Se A under «Vil bli venn med deg» og ikke under «Dine venner». Trykk «Godta» og se at A kommer under «Dine venner».

**Testen er bestått når**

- Både skanning og innskrevet kode viste bare navnet og «Dere er ikke venner» før noe ble sendt.
- Ingen ble venner av å skanne eller skrive inn koden; det kom bare en forespørsel under «Vil bli venn med deg».
- Vennskapet kom først etter at B og C selv trykket «Godta».

### A10 – Prøv en utløpt eller erstattet QR-kode, din egen kode og en ny forespørsel etter et avslag

**Prioritet:** U · **Fase:** 4

**Forventet resultat:** Alle forsøkene blir stoppet med en nøytral melding. Meldingen sier ikke om koden er utløpt, er din egen eller om den andre har avslått deg.

**Før du starter**

- Egne testkontoer: Konto A og Konto B, som ikke er venner og ikke har ventende forespørsler. Konto A må ikke være Produkteierens konto. Alt som skjer i testen er fiktivt.
- To enheter, eller én vanlig og én privat nettleserfane. Konto A trenger også en ekstra fane.
- Ha penn og papir eller et notat for å skrive ned koder. Testen tar ca. 15 minutter fordi en kode varer i 5 minutter.

**Slik gjør du det**

1. Utløpt kode: Som Konto B: åpne «Konto» › «Venner» › «Min QR-kode». Skriv ned koden (kode 1). Vent til siden viser «Utløpt» og «Koden virker ikke lenger» (etter 5 minutter).
2. Som Konto A: åpne «Konto» › «Venner» › «Skann QR-kode», trykk «Skriv inn koden i stedet», skriv kode 1 og trykk «Finn personen». Se «Ingen treff» og «Fant ingen gyldig kode», og at navnet til B ikke vises.
3. Erstattet kode: Som Konto B: trykk «Vis ny kode» og skriv ned koden (kode 2). Trykk «Vis ny kode» en gang til og skriv ned den nye koden (kode 3).
4. Som Konto A: trykk «Skann eller skriv en annen kode», skriv kode 2 og trykk «Finn personen». Se den samme meldingen «Fant ingen gyldig kode».
5. Egen kode: Som Konto A: åpne en ny fane, gå til «Konto» › «Venner» › «Min QR-kode» og skriv ned din egen kode. I fanen med «Skann QR-kode»: trykk «Skann eller skriv en annen kode», skriv din egen kode og trykk «Finn personen». Se den samme meldingen.
6. Sammenlign: skriv en oppdiktet kode, for eksempel ABCDEFGHJK, og se at meldingen er nøyaktig den samme.
7. Ny forespørsel etter avslag: skriv kode 3 fra B (eller be B trykke «Vis ny kode» hvis den er utløpt) og trykk «Finn personen». Se navnet til B og trykk «Send venneforespørsel».
8. Som Konto B: gå til «Venner» og trykk «Avslå» ved A.
9. Som Konto B: trykk «Vis ny kode» i «Min QR-kode». Som Konto A: skriv den nye koden og trykk «Finn personen». Se navnet til B, «Dere er ikke venner» og «Du kan ikke sende [B] en venneforespørsel nå.», og at knappen «Send venneforespørsel» mangler.
10. Som Konto A: gå til «Venner» › «Venneforespørsel på e-post», skriv e-postadressen til Konto B og trykk «Send forespørsel». Se at bekreftelsen er den vanlige («Sendt til … Har personen en konto med denne adressen, kan de godta eller avslå forespørselen i appen. …»).
11. Som Konto B: vent et par minutter, og se at det ikke har kommet noen ny forespørsel under «Venner» og ikke noe nytt varsel i «Varsler».

**Testen er bestått når**

- Utløpt kode, erstattet kode, egen kode og oppdiktet kode ga alle nøyaktig samme melding: «Fant ingen gyldig kode», uten navn.
- Etter avslaget kunne ikke A sende en ny forespørsel med koden; siden sa bare «Du kan ikke sende [B] en venneforespørsel nå.»
- Ingen tekst hos A sa at B hadde avslått, blokkert eller hadde en bestemt relasjon.
- Forespørselen på e-post etter avslaget fikk vanlig bekreftelse hos A, men kom ikke fram til B.

### A11 – Blokker en person og opphev blokkeringen, og se at lån dere har avtalt, fortsetter

**Prioritet:** U · **Fase:** 4

**Forventet resultat:** Den du blokkerer, kan ikke lenger finne deg eller ta ny kontakt med deg, men lån dere allerede har avtalt, fortsetter som før. Når du opphever blokkeringen, blir dere ikke automatisk venner igjen.

**Før du starter**

- Egne testkontoer: Konto A og Konto B, som er venner. Alt som skjer i testen er fiktivt.
- Et avtalt lån der Konto B låner tingen «Lånetest stige» av Konto A, med status «Avtalt, ikke overlevert ennå» og overlevering i dag (lag det på samme måte som i lånetestene L). Knappen for overlevering vises først på overleveringsdagen.
- Konto A har i tillegg tingen «Testdrill», som venner kan se.
- To enheter, eller én vanlig og én privat nettleserfane.

**Slik gjør du det**

1. Som Konto B: åpne «Finn», søk etter «Testdrill», og se at tingen til A vises. (Dette viser at B ser A sine ting før blokkeringen.)
2. Som Konto A: Trykk på det runde profilbildet ditt (eller initialene dine) øverst på skjermen for å åpne «Konto», trykk «Venner» og trykk på B under «Dine venner». B sin side åpnes.
3. Trykk «Flere valg» og så «Blokker [B]». Les vinduet «Blokkere [B]?» og se at det står at «Lån dere allerede har avtalt.» består. Trykk «Blokker [B]» nederst i vinduet.
4. Se at kortet «Dere to» nå sier «Du har blokkert [B]». Gå til «Konto» › «Blokkerte» og se B i listen med «Blokkert [dato]» og knappen «Opphev».
5. Som Konto B: åpne «Varsler» og se at det ikke har kommet noe varsel om blokkeringen. Gå til «Konto» › «Venner» og se at A ikke lenger står under «Dine venner».
6. Som Konto B: åpne «Finn» og søk etter «Testdrill». Se at tingen til A ikke vises lenger.
7. Som Konto A: åpne «Min QR-kode». Som Konto B: åpne «Skann QR-kode», skriv koden til A og trykk «Finn personen». Se «Fant ingen gyldig kode».
8. Som Konto B: åpne «Venner» › «Venneforespørsel på e-post», skriv adressen til Konto A og trykk «Send forespørsel». Som Konto A: se at ingen forespørsel fra B kommer under «Venner» eller i «Varsler».
9. Som Konto B: åpne «Lån». Se at lånet av «Lånetest stige» står der, og åpne det. Trykk «Jeg har fått Lånetest stige». Se at lånet går videre (statusen endrer seg) uten feilmelding.
10. Som Konto A: åpne «Lån» og se at det samme lånet står der med den nye statusen.
11. Opphev: Som Konto A: gå til «Konto» › «Blokkerte» og trykk «Opphev» ved B. Les vinduet «Oppheve blokkeringen av [B]?» og trykk «Opphev blokkeringen». Se at det står «Du har ikke blokkert noen.»
12. Som Konto A og B: åpne «Venner» og se at de ikke står under «Dine venner» hos hverandre (vennskapet kommer ikke tilbake av seg selv), og at B ikke har fått noe varsel om at blokkeringen er opphevet.
13. Som Konto A: åpne «Min QR-kode». Som Konto B: skriv koden i «Skann QR-kode» og trykk «Finn personen». Se at navnet til A og knappen «Send venneforespørsel» vises igjen. Ikke send.

**Testen er bestått når**

- Mens blokkeringen gjaldt, så ikke B tingen «Testdrill» i «Finn», fikk «Fant ingen gyldig kode» på A sin kode, og forespørselen på e-post kom ikke fram til A.
- Blokkeringen avsluttet vennskapet, og B fikk ikke noe varsel om den.
- Lånet av «Lånetest stige» var synlig for begge og kunne gå videre mens blokkeringen gjaldt.
- Etter «Opphev blokkeringen» var B borte fra «Blokkerte», de var ikke venner igjen automatisk, og B kunne igjen se A sitt navn og «Send venneforespørsel» via koden.

## M – Miljøer og medlemskap (12)

| ID | Prioritet | Fase | Testhandling | Forventet resultat |
| --- | :---: | :---: | --- | --- |
| M01 | B | 1 | Opprett et åpent miljø og se at en annen kan finne det og bli med med en gang | Den andre personen finner miljøet i Finn og blir medlem med ett trykk, uten at noen må godkjenne. Administratoren har ingen innmelding å behandle. |
| M02 | O | 2 | Opprett et lukket miljø og send en søknad om å bli med | Den som ikke er medlem, ser bare en kort beskrivelse av miljøet og hva som kreves, ikke ting eller medlemmer. Søknaden blir liggende og vente til en administrator tar stilling til den. |
| M03 | O | 2 | Administratoren ber søkeren om mer informasjon, og søkeren svarer | Søkeren får beskjed, ser spørsmålet fra administratorene på søknaden sin og kan endre svarene og sende dem på nytt. Deretter venter søknaden igjen på administratorene. |
| M04 | O | 2 | Avslå en søknad, la søkeren søke igjen, og godkjenn den nye søknaden | Ved avslag får søkeren et nøytralt varsel og blir ikke medlem. Ved godkjenning får søkeren varsel, blir medlem og ser tingene og medlemmene i miljøet. |
| M05 | O | 2 | Inviter en bestemt person til et skjult miljø, og la personen avslå og så godta | Bare den inviterte personen får invitasjonen og kan selv velge å godta eller avslå. Andre ser verken invitasjonen eller miljøet. |
| M06 | B | 1 | Sjekk at en utenforstående ikke kan finne et skjult miljø, medlemmene eller tingene der | En utenforstående finner ikke det skjulte miljøet i søk, og får beskjed om at siden ikke finnes når de prøver å åpne miljøet, administrasjonen eller en ting som bare er publisert der. |
| M07 | O | 2 | Sjekk hva et vanlig medlem ser av regler, medlemmer, roller og ting i miljøet | Et vanlig medlem ser regler, medlemmer med roller og tingene i miljøet, men ikke administrasjonen eller andres svar på innmeldingskravene. Administratoren ser i tillegg det som hører til rollen. |
| M08 | O | 3 | Meld deg ut av et miljø og sjekk at et lån som allerede er godkjent, fortsatt gjelder | Etter utmelding ser personen ikke lenger tingene og medlemmene i miljøet, og egne ting forsvinner derfra. Et lån som var godkjent før utmeldingen, fortsetter som før. |
| M09 | O | 2 | Inviter et medlem til å bli administrator, og la medlemmet først avslå og så godta | Medlemmet får administratorrettigheter først når det selv har godtatt invitasjonen. En avslått eller tilbaketrukket invitasjon gir ingen rettigheter. |
| M10 | U | 4 | Fjern et medlem fra miljøet, og vurder en ny søknad fra samme person etterpå | Medlemmet fjernes med en lagret begrunnelse, mister tilgangen til miljøet og får en nøytral beskjed med mulighet til å be om ny vurdering. Personen kan søke på nytt, og administratoren kan behandle søknaden. |
| M11 | U | 4 | Endre kravene og typen på et testmiljø, og sjekk at medlemmene må svare innen fristen | Medlemmene får beskjed, ser hva endringen betyr og får en frist til å svare eller godta. Den som ikke svarer eller ikke godtar innen fristen, blir passivt medlem. |
| M12 | U | 4 | Avvikle et tomt testmiljø, og deretter et testmiljø som har medlemmer og lån | Etter avviklingen kan ingen gjøre noe nytt i miljøet. Bare de som var medlemmer, finner det igjen som et arkiv de bare kan lese, og lån som var avtalt, finnes fortsatt under «Lån». |

### M01 – Opprett et åpent miljø og se at en annen kan finne det og bli med med en gang

**Prioritet:** B · **Fase:** 1

**Forventet resultat:** Den andre personen finner miljøet i Finn og blir medlem med ett trykk, uten at noen må godkjenne. Administratoren har ingen innmelding å behandle.

**Før du starter**

- Konto A (blir eier av miljøet) og Konto B (blir med). De trenger ikke være venner.
- To enheter, eller én vanlig og én privat nettleserfane, så begge kan være logget inn samtidig.
- Ingen av kontoene har et miljø som heter «Lånetest Åpent» fra før.

**Slik gjør du det**

1. Logg inn som Konto A. Gå til «Hjem» og trykk «Opprett et miljø» under «Dine miljøer».
2. Skriv «Lånetest Åpent» i feltet «Navn». Under «Hvem kan finne og bli med?» velger du «Åpent miljø».
3. Skriv gjerne «Testmiljø for piloten» i «Beskrivelse (valgfritt)». La «Krav til nye medlemmer (valgfritt)» stå tomt.
4. Trykk «Opprett miljøet». Se at du kommer til miljøets side med «Lånetest Åpent» øverst, og merkene «Medlem» og «Du er eier».
5. Logg inn som Konto B på den andre enheten. Gå til «Finn», trykk «Miljøer», skriv «Lånetest Åpent» i søkefeltet og trykk «Søk».
6. Se at «Lånetest Åpent» står i treffene, med merket «Åpent · bli med med en gang» og «under 10 medlemmer».
7. Trykk på navnet. Se at kortet øverst sier «Du er ikke medlem. Du kan bli med med en gang.»
8. Trykk «Bli med».
9. Se at siden straks viser «Velkommen, …» med fornavnet til Konto B, og merket «Medlem» under tittelen.
10. Se at Konto B nå ser medlemslisten med Konto A under «Eier», og seg selv under «Medlemmer».
11. Gå til «Hjem» som Konto B og se at «Lånetest Åpent» står under «Dine miljøer».
12. Som Konto A: åpne «Lånetest Åpent», trykk «Administrer miljøet» og deretter «Innmeldinger og invitasjoner». Se at det står «Ingen innmeldinger venter.»
13. Gå tilbake og åpne «Medlemmer». Se at Konto B står under «Aktive».

**Testen er bestått når**

- Konto B fant «Lånetest Åpent» i «Finn» under «Miljøer» ved å søke på navnet.
- Konto B ble medlem straks etter «Bli med», uten å vente, og fikk «Velkommen, …» og merket «Medlem».
- Konto A fikk ingen innmelding å godkjenne: «Innmeldinger og invitasjoner» sier «Ingen innmeldinger venter.»
- Konto B står under «Aktive» på Konto As side «Medlemmer».

### M02 – Opprett et lukket miljø og send en søknad om å bli med

**Prioritet:** O · **Fase:** 2

**Forventet resultat:** Den som ikke er medlem, ser bare en kort beskrivelse av miljøet og hva som kreves, ikke ting eller medlemmer. Søknaden blir liggende og vente til en administrator tar stilling til den.

**Før du starter**

- Konto A (eier og administrator) og Konto B (søker). B skal ikke være medlem av miljøet fra før.
- To enheter, eller én vanlig og én privat nettleserfane.
- Miljøet og søknaden fra denne testen brukes videre i M03 og M04, så ikke avgjør søknaden her.

**Slik gjør du det**

1. Logg inn som Konto A. Gå til «Hjem» og trykk «Opprett et miljø».
2. Skriv «Lånetest Lukket» i «Navn» og velg «Lukket miljø» under «Hvem kan finne og bli med?». Skriv «Testmiljø for piloten» i «Beskrivelse (valgfritt)».
3. Under «Krav til nye medlemmer (valgfritt)»: trykk «Legg til et spørsmål» og skriv «Hvilken oppgang bor du i?». Trykk «Legg til en regel» og skriv «Jeg leverer tilbake det jeg låner i samme stand».
4. Trykk «Opprett miljøet». Trykk «Registrer en ny ting» på miljøets side og registrer tingen «Lånetest stige» med «Lånetest Lukket» valgt (la «Venner» være uten hake). Kopier adressen til tingens side fra nettleserens adressefelt.
5. Logg inn som Konto B. Gå til «Finn», trykk «Miljøer», søk etter «Lånetest Lukket» og se at treffet har merket «Lukket · du søker om å bli med».
6. Åpne miljøet. Se at kortet sier «Du er ikke medlem. En administrator ser på søknaden din før du blir med.»
7. Se at siden bare viser «Om miljøet» (type, beskrivelse og «under 10 medlemmer»), «For å bli med» (spørsmålet og regelen) og «Bare for medlemmer». Se at det ikke står noen medlemsliste, ingen «Ting i miljøet» og ikke noe søkefelt.
8. Lim inn adressen til «Lånetest stige» i nettleserens adressefelt som Konto B. Se at siden sier «Finnes ikke».
9. Gå tilbake til miljøet og trykk «Søk om å bli med». Svar «Oppgang B» på spørsmålet, sett hake ved regelen, og trykk «Send søknaden».
10. Se at kortet nå har merket «Venter på administratorene» og teksten «Søknaden din venter på svar fra administratorene. Du får varsel når de har svart.», og at «Søknaden din» viser svaret ditt.
11. Som Konto A: åpne «Varsler» og se varselet «En søknad om medlemskap i Lånetest Lukket venter på behandling».
12. Gå til «Hjem» og se «1 som administrator» med «Behandle 1 innmelding». Trykk på den, og se at Konto B står under «Venter på avgjørelse» med merket «Søker om å bli med».
13. Trykk «Svar til miljøets innmelding» og se at svaret «Oppgang B» og «Godtatt» for regelen vises. Ikke trykk på noen knapper.

**Testen er bestått når**

- Som ikke-medlem så Konto B bare «Om miljøet», «For å bli med» og «Bare for medlemmer», og ingen medlemmer eller ting.
- Adressen til tingen i miljøet ga «Finnes ikke» for Konto B før medlemskapet.
- Etter «Send søknaden» ble Konto B ikke medlem, men fikk «Venter på administratorene».
- Konto A fikk varselet og ser søknaden under «Venter på avgjørelse» med svarene.

### M03 – Administratoren ber søkeren om mer informasjon, og søkeren svarer

**Prioritet:** O · **Fase:** 2

**Forventet resultat:** Søkeren får beskjed, ser spørsmålet fra administratorene på søknaden sin og kan endre svarene og sende dem på nytt. Deretter venter søknaden igjen på administratorene.

**Før du starter**

- Bruk «Lånetest Lukket» og den ventende søknaden fra Konto B fra M02.
- Konto A er administrator. To enheter eller to nettleserfaner.

**Slik gjør du det**

1. Som Konto A: åpne «Lånetest Lukket», trykk «Administrer miljøet» og deretter «Innmeldinger» under «Venter på dere».
2. Ved Konto B: trykk «Be om mer informasjon».
3. Skriv «Hvilken etasje bor du i?» i feltet «Spørsmål til … (valgfritt)» og trykk «Be om mer informasjon» nederst i vinduet.
4. Se at Konto B nå har merket «Venter på mer informasjon fra søkeren», og at spørsmålet vises under «Spørsmålet dere sendte».
5. Som Konto B: åpne «Varsler» og se varselet «Administratorene i Lånetest Lukket ber om mer informasjon». Trykk på det.
6. Se at miljøets side har merket «Venter på deg», teksten «Administratorene ber om mer informasjon før de svarer.», og spørsmålet «Hvilken etasje bor du i?» under «Administratorene i Lånetest Lukket».
7. Trykk «Se over svarene». Se at siden «Svarene dine i Lånetest Lukket» viser spørsmålet øverst, og at det forrige svaret og haken ved regelen allerede er fylt inn.
8. Endre svaret til «Oppgang B, 3. etasje» og trykk «Send svarene».
9. Se at kortet igjen har merket «Venter på administratorene», og at «Søknaden din» viser det nye svaret.
10. Som Konto A: last «Innmeldinger og invitasjoner» på nytt. Se at Konto B står under «Venter på avgjørelse» med merket «Søker om å bli med», og at «Svar til miljøets innmelding» viser «Oppgang B, 3. etasje».
11. La søknaden stå. Den avgjøres i M04.

**Testen er bestått når**

- Konto B fikk varselet «Administratorene i Lånetest Lukket ber om mer informasjon».
- Konto B så spørsmålet ordrett på miljøets side, avsendt fra «Administratorene i Lånetest Lukket», ikke i en privat samtale.
- Konto B kunne endre svaret og sende det med «Send svarene».
- Konto A ser det nye svaret, og søknaden venter igjen på avgjørelse.

### M04 – Avslå en søknad, la søkeren søke igjen, og godkjenn den nye søknaden

**Prioritet:** O · **Fase:** 2

**Forventet resultat:** Ved avslag får søkeren et nøytralt varsel og blir ikke medlem. Ved godkjenning får søkeren varsel, blir medlem og ser tingene og medlemmene i miljøet.

**Før du starter**

- Bruk «Lånetest Lukket» og den ventende søknaden fra Konto B fra M03.
- Konto A er administrator. To enheter eller to nettleserfaner.
- «Lånetest stige» er publisert i miljøet (fra M02).

**Slik gjør du det**

1. Som Konto A: åpne «Lånetest Lukket» → «Administrer miljøet» → «Innmeldinger». Ved Konto B: trykk «Avvis».
2. Se at vinduet sier at søknaden avsluttes og at personen kan prøve igjen senere. Trykk «Avvis …» (knappen med navnet til Konto B).
3. Som Konto B: åpne «Varsler» og se varselet «Søknaden din til Lånetest Lukket ble ikke godkjent». Se at det ikke står noen begrunnelse eller hvem som avgjorde.
4. Åpne miljøet. Se merket «Ikke godkjent», teksten «Søknaden ble ikke godkjent.», og knappene «Finn andre miljøer» og «Søk på nytt». Se at det fortsatt ikke vises medlemmer eller ting.
5. Trykk «Søk på nytt», fyll inn svaret, sett hake ved regelen og trykk «Send søknaden». Se merket «Venter på administratorene».
6. Som Konto A: åpne «Innmeldinger» igjen og trykk «Godkjenn …» (knappen med navnet til Konto B).
7. Som Konto B: åpne «Varsler» og se varselet «Søknaden din til Lånetest Lukket er godkjent». Trykk på det.
8. Se at miljøets side viser «Velkommen, …» og merket «Medlem».
9. Se at Konto B nå ser medlemslisten og «Ting i miljøet» med «Lånetest stige», og kan åpne tingen.
10. Som Konto A: åpne «Medlemmer» under «Administrer miljøet» og se at Konto B står under «Aktive».

**Testen er bestått når**

- Etter avslaget fikk Konto B varselet «Søknaden din til Lånetest Lukket ble ikke godkjent», uten begrunnelse og uten navn på den som avgjorde.
- Etter avslaget så Konto B fortsatt ingen medlemmer eller ting, men kunne trykke «Søk på nytt».
- Etter godkjenningen fikk Konto B varselet «Søknaden din til Lånetest Lukket er godkjent», og så velkomsten og merket «Medlem».
- Etter godkjenningen så Konto B medlemslisten og «Lånetest stige», og står under «Aktive» hos Konto A.

### M05 – Inviter en bestemt person til et skjult miljø, og la personen avslå og så godta

**Prioritet:** O · **Fase:** 2

**Forventet resultat:** Bare den inviterte personen får invitasjonen og kan selv velge å godta eller avslå. Andre ser verken invitasjonen eller miljøet.

**Før du starter**

- Konto A (administrator) og Konto B (inviteres) er venner fra før (se testene for vennskap).
- Konto C er ikke venn med A eller B og ikke medlem av noe av As miljøer.
- To enheter eller to nettleserfaner. Miljøet fra denne testen brukes videre i M06.

**Slik gjør du det**

1. Som Konto A: gå til «Hjem» → «Opprett et miljø». Skriv «Lånetest Skjult» i «Navn», velg «Skjult miljø» og trykk «Opprett miljøet». Kopier adressen til miljøets side fra adressefeltet.
2. Trykk «Administrer miljøet» → «Innmeldinger og invitasjoner». Under «Inviter»: se at Konto C ikke står i listen «Venn». Velg Konto B og trykk «Send invitasjon».
3. Se at Konto B står under «Invitert» med merket «Invitert, har ikke svart ennå».
4. Som Konto B: åpne «Varsler» og se «Du er invitert til Lånetest Skjult». Trykk på det.
5. Se merket «Invitert», teksten «Du er invitert til miljøet. Les reglene og godta invitasjonen for å bli med.», og knappene «Godta invitasjonen til Lånetest Skjult» og «Avslå invitasjonen».
6. Trykk «Avslå invitasjonen». Last siden på nytt og se at den nå sier «Finnes ikke».
7. Som Konto A: last «Innmeldinger og invitasjoner» på nytt. Se at Konto B ikke lenger står under «Invitert», men kan velges i «Venn» igjen. Velg Konto B og trykk «Send invitasjon» en gang til.
8. Som Konto C: lim inn adressen til «Lånetest Skjult» i adressefeltet. Se at siden sier «Finnes ikke». Åpne «Varsler» og se at C ikke har fått noe varsel om miljøet.
9. Som Konto B: åpne det nye varselet «Du er invitert til Lånetest Skjult» og trykk «Godta invitasjonen til Lånetest Skjult».
10. Se at siden viser «Velkommen, …» og merket «Medlem», og at «Lånetest Skjult» står under «Dine miljøer» i «Hjem».
11. Som Konto A: åpne «Medlemmer» under «Administrer miljøet» og se Konto B under «Aktive».

**Testen er bestått når**

- Bare Konto B fikk varselet og kunne se miljøet mens invitasjonen ventet. Konto C fikk «Finnes ikke» og ingen varsel.
- Konto C kunne ikke velges som mottaker av invitasjon.
- Etter «Avslå invitasjonen» ble Konto B ikke medlem og så ikke lenger miljøet.
- Etter ny invitasjon og «Godta invitasjonen til Lånetest Skjult» ble Konto B medlem og står under «Aktive».

### M06 – Sjekk at en utenforstående ikke kan finne et skjult miljø, medlemmene eller tingene der

**Prioritet:** B · **Fase:** 1

**Forventet resultat:** En utenforstående finner ikke det skjulte miljøet i søk, og får beskjed om at siden ikke finnes når de prøver å åpne miljøet, administrasjonen eller en ting som bare er publisert der.

**Før du starter**

- Bruk «Lånetest Skjult» fra M05, der Konto A er eier og Konto B er medlem.
- Som Konto A: publiser tingen «Lånetest skjult drill» bare i «Lånetest Skjult» («Registrer en ny ting» fra miljøets side, la «Venner» være uten hake).
- Konto A kopierer tre adresser fra adressefeltet og sender dem til den som tester Konto C: miljøets side, siden «Administrer miljøet» og tingens side.
- Konto C har ingen relasjon til A eller B: ikke venn, ikke medlem, ikke invitert.

**Slik gjør du det**

1. Logg inn som Konto C. Gå til «Finn», trykk «Miljøer», skriv «Lånetest Skjult» og trykk «Søk».
2. Se at miljøet ikke står i treffene (siden sier «Ingen miljøer passer med søket. …» eller viser bare andre miljøer).
3. Trykk «Ting» i «Finn», søk etter «Lånetest skjult drill» og se at tingen ikke står i treffene.
4. Lim inn adressen til miljøets side i adressefeltet. Se at siden sier «Finnes ikke» og «Denne siden finnes ikke, eller du har ikke tilgang til den. …». Se at miljøets navn, medlemmer eller ting ikke vises noe sted.
5. Lim inn adressen til «Administrer miljøet». Se at også denne sier «Finnes ikke».
6. Lim inn adressen til tingen «Lånetest skjult drill». Se at også denne sier «Finnes ikke».
7. Endre ett tegn i midten av miljøadressen og åpne den. Se at siden ser helt lik ut som i steg 4, så man ikke kan skille et skjult miljø fra en adresse som ikke finnes.
8. Gå til «Hjem» og «Varsler» som Konto C og se at «Lånetest Skjult» ikke nevnes noe sted.

**Testen er bestått når**

- Søk i «Finn» etter miljøet og tingen ga ingen treff for Konto C.
- Miljøets side, «Administrer miljøet» og tingens side viste alle «Finnes ikke» for Konto C.
- Siden for det skjulte miljøet så helt lik ut som siden for en adresse som ikke finnes.
- Konto C så aldri miljøets navn, medlemsliste eller ting.

### M07 – Sjekk hva et vanlig medlem ser av regler, medlemmer, roller og ting i miljøet

**Prioritet:** O · **Fase:** 2

**Forventet resultat:** Et vanlig medlem ser regler, medlemmer med roller og tingene i miljøet, men ikke administrasjonen eller andres svar på innmeldingskravene. Administratoren ser i tillegg det som hører til rollen.

**Før du starter**

- Bruk «Lånetest Lukket» fra M02–M04: Konto A er eier, Konto B er vanlig medlem, og «Lånetest stige» er publisert der.
- Konto C er ikke medlem av miljøet.
- Konto A kopierer adressen til «Administrer miljøet» og gir den til den som tester Konto B.

**Slik gjør du det**

1. Logg inn som Konto B og åpne «Lånetest Lukket» fra «Dine miljøer» i «Hjem».
2. Se at medlemslisten har gruppene «Eier» (med Konto A) og «Medlemmer» (med Konto B), og at hver person vises med navn.
3. Se at «Ting i miljøet» viser «Lånetest stige» med eieren, og at søkefeltet «Søk i Lånetest Lukket» finnes.
4. Se at det ikke står noen «Som administrator» eller «Administrer miljøet» på siden, og at det bare står merket «Medlem» under tittelen.
5. Trykk «Om miljøet». Se at siden viser type og beskrivelse, og under «Regler og krav» spørsmålet og regelen. Se at ingen andres svar vises.
6. Gå tilbake og trykk «Mitt medlemskap». Se at det står «Kontakt administratorene» og «Forlat miljøet».
7. Lim inn adressen til «Administrer miljøet» som Konto B. Se at siden sier «Finnes ikke».
8. Logg inn som Konto A og åpne miljøet. Se merkene «Medlem» og «Du er eier», og seksjonen «Som administrator» med «Administrer miljøet».
9. Trykk «Administrer miljøet» og åpne «Medlemmer». Se at siden åpnes og viser medlemmene med roller, altså den siden Konto B fikk «Finnes ikke» på.
10. Logg inn som Konto C og åpne miljøet via «Finn» → «Miljøer». Se at C bare ser «Om miljøet», «For å bli med» og «Bare for medlemmer», uten medlemsliste og uten ting.

**Testen er bestått når**

- Konto B så medlemslisten med «Eier» og «Medlemmer», tingen «Lånetest stige» og reglene under «Om miljøet».
- Konto B så ingen administrasjon, og adressen til «Administrer miljøet» ga «Finnes ikke».
- Konto B så ikke andres svar på innmeldingskravene noe sted.
- Konto A så i tillegg «Som administrator» og kom inn på «Administrer miljøet».
- Konto C (ikke medlem) så verken medlemmer eller ting.

### M08 – Meld deg ut av et miljø og sjekk at et lån som allerede er godkjent, fortsatt gjelder

**Prioritet:** O · **Fase:** 3

**Forventet resultat:** Etter utmelding ser personen ikke lenger tingene og medlemmene i miljøet, og egne ting forsvinner derfra. Et lån som var godkjent før utmeldingen, fortsetter som før.

**Før du starter**

- Bruk «Lånetest Åpent» fra M01: Konto A er eier, Konto B er vanlig medlem (ikke administrator).
- Konto A har publisert «Lånetest stige» og «Testdrill» i miljøet, begge uten hake ved «Venner».
- Konto B har publisert «Lånetest sag» i miljøet.
- Et godkjent lån: Konto B har åpnet «Lånetest stige» fra miljøet, trykket «Be om å låne» og «Send forespørselen», og Konto A har trykket «Godkjenn lån …». Lånet er ikke avsluttet.
- Kopier adressen til «Testdrill» og gi den til den som tester Konto B. To enheter eller to nettleserfaner.

**Slik gjør du det**

1. Logg inn som Konto B. Åpne «Lån» og se at lånet av «Lånetest stige» står der.
2. Åpne «Lånetest Åpent» fra «Hjem». Trykk «Mitt medlemskap».
3. Trykk «Forlat miljøet». Les vinduet «Forlate Lånetest Åpent?» og se at det står at du ikke lenger ser tingene og medlemmene, at tingene dine ikke lenger vises, og at «Lån som allerede er avtalt, fortsetter som før.»
4. Trykk «Forlat Lånetest Åpent».
5. Se at miljøets side nå sier «Du er ikke medlem. Du kan bli med med en gang.», uten medlemsliste og uten «Ting i miljøet».
6. Gå til «Hjem» og se at «Lånetest Åpent» ikke lenger står under «Dine miljøer».
7. Lim inn adressen til «Testdrill» i adressefeltet. Se at siden sier «Finnes ikke», så Konto B ikke kan be om å låne den.
8. Åpne «Lån» og åpne lånet av «Lånetest stige». Se at lånet fortsatt står med samme periode og status som før.
9. Som Konto A: åpne «Lånetest Åpent». Se at Konto B ikke står i medlemslisten, og at «Lånetest sag» ikke står under «Ting i miljøet».
10. Som Konto A: åpne «Lån» og se at lånet til Konto B av «Lånetest stige» fortsatt står der.

**Testen er bestått når**

- Etter utmeldingen så Konto B ikke lenger medlemmer eller ting i miljøet, og miljøet var borte fra «Dine miljøer».
- Konto B fikk «Finnes ikke» på «Testdrill» og kunne ikke be om et nytt lån.
- Konto Bs ting «Lånetest sag» var borte fra miljøet for Konto A, og Konto B var borte fra medlemslisten.
- Det godkjente lånet av «Lånetest stige» sto uendret under «Lån» hos både Konto A og Konto B.

### M09 – Inviter et medlem til å bli administrator, og la medlemmet først avslå og så godta

**Prioritet:** O · **Fase:** 2

**Forventet resultat:** Medlemmet får administratorrettigheter først når det selv har godtatt invitasjonen. En avslått eller tilbaketrukket invitasjon gir ingen rettigheter.

**Før du starter**

- Bruk «Lånetest Lukket», der Konto A er eier og Konto B er aktivt, vanlig medlem (fra M04).
- Konto A kopierer adressen til «Administrer miljøet» og gir den til den som tester Konto B.
- To enheter eller to nettleserfaner.

**Slik gjør du det**

1. Som Konto A: åpne miljøet → «Administrer miljøet» → «Roller og eierskap». Under «Inviter en administrator»: velg Konto B i «Medlem» og trykk «Inviter som administrator».
2. Se at Konto B står under «Invitert til en rolle» med «Administrator, invitert … Har ikke svart ennå.»
3. Som Konto B: lim inn adressen til «Administrer miljøet». Se at siden sier «Finnes ikke», fordi invitasjonen ikke er godtatt.
4. Åpne «Varsler» og se «Du er spurt om å bli administrator i Lånetest Lukket». Åpne miljøet og se «Invitasjon til en rolle» med «Du er invitert til å bli administrator i miljøet.» og knappene «Bli administrator» og «Avslå».
5. Trykk «Avslå». Se at invitasjonen forsvinner, at det ikke står «Som administrator» på siden, og at adressen til «Administrer miljøet» fortsatt sier «Finnes ikke».
6. Som Konto A: last «Roller og eierskap» på nytt. Se at Konto B ikke står under «Administratorer». Inviter Konto B på nytt med «Inviter som administrator».
7. Som Konto B: åpne miljøet så invitasjonen vises, men ikke trykk ennå. Som Konto A: trykk «Trekk invitasjonen» ved Konto B.
8. Som Konto B: trykk «Bli administrator» på siden som fortsatt er åpen. Se at det kommer meldingen «Dette finnes ikke lenger, eller du har ikke tilgang til det.», og at B ikke blir administrator.
9. Som Konto A: inviter Konto B en tredje gang. Som Konto B: last miljøet på nytt og trykk «Bli administrator».
10. Se at Konto B nå har merket «Du er administrator» og seksjonen «Som administrator» med «Administrer miljøet», og at adressen til «Administrer miljøet» åpner siden.
11. Som Konto A: se at Konto B står under «Administratorer» på «Roller og eierskap».

**Testen er bestått når**

- Mens invitasjonen ventet, og etter «Avslå», fikk Konto B «Finnes ikke» på «Administrer miljøet» og så ingen «Som administrator».
- Et trykk på «Bli administrator» etter at invitasjonen var trukket, ga en feilmelding og ingen rolle.
- Først etter et gyldig trykk på «Bli administrator» fikk Konto B merket «Du er administrator» og tilgang til «Administrer miljøet».
- Konto A så Konto B under «Administratorer» bare etter godkjenningen.

### M10 – Fjern et medlem fra miljøet, og vurder en ny søknad fra samme person etterpå

**Prioritet:** U · **Fase:** 4

**Forventet resultat:** Medlemmet fjernes med en lagret begrunnelse, mister tilgangen til miljøet og får en nøytral beskjed med mulighet til å be om ny vurdering. Personen kan søke på nytt, og administratoren kan behandle søknaden.

**Før du starter**

- Bruk egne testkontoer: Konto A som administrator og Konto B som vanlig medlem. Hendelsen er fiktiv.
- Lag et lukket testmiljø «Lånetest Moderering» med Konto A som eier, og la Konto B bli med via søknad som i M02 og M04.
- Konto B har publisert tingen «Lånetest sag» i miljøet.
- Konto A og Konto B skal ikke ha noen åpen sak sammen i miljøet (da regnes A som inhabil og kan ikke fjerne B).
- To enheter eller to nettleserfaner.

**Slik gjør du det**

1. Som Konto A: åpne «Lånetest Moderering» → «Administrer miljøet» → «Medlemmer». Ved Konto B under «Aktive»: trykk «Fjern fra miljøet».
2. Les vinduet «Fjerne … fra miljøet?». Skriv «Testbegrunnelse: fiktivt brudd på reglene» i «Begrunnelse». La «Steng … også ute fra nye forsøk» stå uten hake. Trykk «Fjern … fra miljøet».
3. Se at Konto B ikke lenger står under «Aktive», og at «Lånetest sag» ikke lenger står under «Ting i miljøet».
4. Som Konto B: åpne «Varsler» og se «Medlemskapet ditt i et miljø er avsluttet». Trykk på det.
5. Se at siden har merket «Ikke lenger medlem», overskriften «Medlemskapet ditt i Lånetest Moderering er avsluttet», teksten om at tingene ikke lenger vises og at godkjente lån går som før, og «Begrunnelse: Testbegrunnelse: fiktivt brudd på reglene». Se at det ikke står hvem som avgjorde eller om noen rapporterte.
6. Trykk «Be om ny vurdering». Se at siden «Kontakt administratorene» åpnes. Skriv «Jeg ber om ny vurdering (test)» i «Melding» og trykk «Send til administratorene».
7. Åpne «Lånetest Moderering» fra «Finn» → «Miljøer». Se at medlemsliste og ting ikke vises, og at knappen «Søk om å bli med» finnes.
8. Som Konto A: gå til «Hjem» og se «Svar på 1 henvendelse» under «… som administrator». Åpne saken, trykk «Ta saken», skriv et kort svar og trykk «Send innlegget».
9. Som Konto B: trykk «Søk om å bli med», fyll inn eventuelle krav og trykk «Send søknaden». Se merket «Venter på administratorene».
10. Som Konto A: åpne «Innmeldinger» under «Venter på dere», se Konto B under «Venter på avgjørelse» og trykk «Godkjenn …».
11. Som Konto B: se varselet «Søknaden din til Lånetest Moderering er godkjent», og at miljøet igjen viser medlemmer og ting.

**Testen er bestått når**

- Konto B forsvant fra «Aktive», og Konto Bs ting forsvant fra miljøet, rett etter fjerningen.
- Konto B fikk varselet og så begrunnelsen som Konto A skrev, uten navn på hvem som avgjorde.
- Konto B kunne sende «Be om ny vurdering», og saken kom fram til Konto A.
- Konto B kunne søke på nytt, og Konto A kunne godkjenne søknaden slik at B ble medlem igjen.

### M11 – Endre kravene og typen på et testmiljø, og sjekk at medlemmene må svare innen fristen

**Prioritet:** U · **Fase:** 4

**Forventet resultat:** Medlemmene får beskjed, ser hva endringen betyr og får en frist til å svare eller godta. Den som ikke svarer eller ikke godtar innen fristen, blir passivt medlem.

**Før du starter**

- Bruk egne testkontoer: Konto A som eier og Konto B som aktivt, vanlig medlem. Hendelsene er fiktive.
- Lag et lukket testmiljø «Lånetest Typeendring», og la Konto B bli med via søknad (som i M02 og M04).
- Testen tar lang tid: kravfristen er 14 dager og fristen for typeendring 7 dager. Start testen tidlig, gjør steg 1–10 samme dag, og fullfør steg 11–13 når fristen for typeendringen er ute.
- To enheter eller to nettleserfaner.

**Slik gjør du det**

1. Som Konto A: åpne miljøet → «Administrer miljøet» → «Innstillinger og krav». Under «Nytt krav»: velg «Opplysning medlemmet gir» i «Hva slags krav», skriv «Hvilket telefonnummer kan vi nå deg på? (test)» i «Teksten medlemmet ser», trykk «Legg til kravet» og deretter «Lagre kravene».
2. Se meldingen «Kravene er lagret». Åpne «Medlemmer» og se at Konto B står under «Må svare på nytt krav» med «Frist …» 14 dager fram i tid.
3. Som Konto B: åpne «Varsler» og se «Kravene i Lånetest Typeendring er endret». Åpne miljøet og se merket «Nye krav», teksten «Miljøet har fått nye krav. Svar på dem for å fortsatt være aktivt medlem.» og «Frist …».
4. Trykk «Se de nye kravene», skriv et fiktivt svar og trykk «Send svarene». Se at kortet om nye krav forsvinner.
5. Som Konto A: svar også på det nye kravet på samme måte (eieren må også svare), slik at «Må svare på nytt krav» blir tom.
6. Som Konto A: åpne «Miljøtype». Trykk «Foreslå åpent miljø». Les konsekvensene: at hvert medlem får 7 dager til å godta, og at den som ikke godtar, blir passivt medlem. Trykk «Send forslaget til medlemmene».
7. Se kortet «Forslag om ny miljøtype» med «Foreslått: åpent miljø» og «Medlemmene svarer innen …». Trykk «Jeg godtar» for din egen del.
8. Som Konto B: se varselet «Det er foreslått å endre typen til Lånetest Typeendring», og på «Hjem» oppgaven «Svar på endringen».
9. Åpne miljøet. Se kortet «Administratorene foreslår å gjøre miljøet åpent», med forklaring om hva som blir synlig, fristen, og «Du har ikke svart ennå.»
10. Trykk «Ikke godta». Se at det nå står «Du har sagt nei til endringen.» Ikke endre svaret.
11. Etter fristen: som Konto A, åpne «Miljøtype» og se at miljøet nå er «Åpent miljø». Åpne «Medlemmer» og se Konto B under «Passive» med «Godtok ikke at miljøet ble åpent».
12. Som Konto B: åpne miljøet. Se merket «Passivt medlem» og teksten «Du er passivt medlem fordi du ikke godtok at miljøet ble åpent. …», og at medlemmer og ting ikke vises.
13. Trykk «Bli aktiv igjen» (og «Bli aktiv igjen» på neste side om den vises). Se at Konto B blir aktivt medlem igjen og ser medlemmer og ting.

**Testen er bestått når**

- Ved nytt krav fikk Konto B varsel, så fristen på 14 dager og kunne svare med «Send svarene»; Konto A så hvem som manglet svar.
- Ved forslaget om åpent miljø fikk Konto B varsel, så hva endringen betyr og fristen, og kunne velge «Ikke godta».
- Etter fristen var miljøet åpent, og Konto B, som ikke godtok, var passivt medlem og så ikke lenger medlemmer og ting.
- Konto B kunne selv bli aktiv igjen etterpå.

### M12 – Avvikle et tomt testmiljø, og deretter et testmiljø som har medlemmer og lån

**Prioritet:** U · **Fase:** 4

**Forventet resultat:** Etter avviklingen kan ingen gjøre noe nytt i miljøet. Bare de som var medlemmer, finner det igjen som et arkiv de bare kan lese, og lån som var avtalt, finnes fortsatt under «Lån».

**Før du starter**

- Bruk egne testkontoer: Konto A som eier, Konto B som medlem og Konto C som utenforstående. Alt er testdata.
- Tomt miljø: Konto A lager «Lånetest Avvikling tom» der A er eneste medlem.
- Miljø med historikk: Konto A lager «Lånetest Avvikling historikk» (åpent), Konto B blir med, og det finnes et godkjent lån der B låner As ting «Lånetest stige» fra miljøet.
- Konto A må kunne motta e-post, fordi avviklingen bekreftes med en kode. Kopier adressen til begge miljøene og gi dem til den som tester Konto C.
- Miljøet med historikk har 7 dagers angrefrist. Gjør steg 1–10 samme dag og fullfør steg 11–14 når fristen er ute.

**Slik gjør du det**

1. Som Konto A: åpne «Lånetest Avvikling tom» → «Administrer miljøet». Trykk «Flere valg» og «Avvikle miljøet».
2. Se at vinduet sier «Avviklingen er endelig og kan ikke angres.» og «Du er eneste medlem, så ingen andre merker noe.» Trykk «Send kode», skriv koden fra e-posten i «Kode fra e-posten» og trykk «Avvikle Lånetest Avvikling tom».
3. Se at miljøets side har merket «Avviklet» og teksten «Miljøet er avviklet. Det er ikke i bruk lenger, og ingenting her kan endres.», og at det ikke finnes knapper for å legge til ting, bli med eller administrere (bare lenken «Saker i miljøet»).
4. Gå til «Hjem». Se at miljøet ikke står under «Dine miljøer», men under lenken «Avviklede miljøer».
5. Som Konto C: lim inn adressen til «Lånetest Avvikling tom». Se at siden sier «Finnes ikke».
6. Som Konto A: åpne «Lånetest Avvikling historikk» → «Administrer miljøet» → «Flere valg» → «Avvikle miljøet». Se at vinduet nevner angrefristen på 7 dager og at «Lån som allerede er avtalt, fortsetter.» Bekreft med kode som i steg 2.
7. Se kortet «Miljøet avvikles» med «Eieren kan angre til …» og knappen «Fortsett miljøet». Ikke trykk på den.
8. Som Konto B: åpne miljøet. Se at det står «Miljøet avvikles …», og at «Registrer en ny ting» ikke finnes.
9. Som Konto C: lim inn adressen til «Lånetest Avvikling historikk». Se merket «Avvikles» og teksten «Miljøet avvikles og tar ikke inn nye medlemmer.», uten «Bli med».
10. Som Konto B: åpne «Lån» og se at lånet av «Lånetest stige» står som før.
11. Etter angrefristen: som Konto A og Konto B, gå til «Hjem». Se at miljøet er borte fra «Dine miljøer» og står under «Avviklede miljøer».
12. Åpne miljøet fra «Avviklede miljøer». Se merket «Avviklet», «Siden …» med datoen, og at siden bare kan leses (ingen knapper for å bli med, legge til ting, forlate eller kontakte administratorene).
13. Som Konto B: åpne «Lån» og se at lånet av «Lånetest stige» fortsatt finnes.
14. Som Konto C: lim inn adressen til «Lånetest Avvikling historikk» og søk etter navnet i «Finn» → «Miljøer». Se «Finnes ikke» og ingen treff.

**Testen er bestått når**

- Det tomme miljøet ble avviklet med en gang etter bekreftelse med kode, og ligger bare under «Avviklede miljøer» hos Konto A.
- Miljøet med historikk tok ikke inn nye medlemmer eller nye ting mens det ble avviklet, og eieren så «Fortsett miljøet» fram til fristen.
- Etter fristen fant Konto A og Konto B miljøet bare under «Avviklede miljøer», som en side de bare kan lese.
- Lånet av «Lånetest stige» fantes fortsatt under «Lån».
- Konto C fikk «Finnes ikke» på begge miljøene etter avviklingen og fant dem ikke i «Finn».

## T – Ting, bilder, søk og medeierskap (15)

| ID | Prioritet | Fase | Testhandling | Forventet resultat |
| --- | :---: | :---: | --- | --- |
| T01 | B | 1 | Registrer en ny ting med navn, kategori og beskrivelse | Tingen blir lagret med navnet, kategorien og beskrivelsen du skrev, og den står i «Mine ting». Den er bare synlig for deg til du selv velger hvor den skal vises. |
| T02 | B | 1 | Legg bilder på en ting og se at de vises for dem som kan se tingen, og bare for dem | En ting kan ha fra ett til fem bilder. Hovedbildet vises på kortet for tingen, alle bildene vises på tingens side for dem som kan se tingen, og den som ikke har tilgang til tingen, ser heller ikke bildene. |
| T03 | O | 2 | Bytt bilder på en testting, arkiver og slett den, og se hvilke bilder som blir igjen | Når bildene endres, viser kort, sider og forespørsler det nye hovedbildet med en gang. Etter arkivering og sletting er tingen borte for andre, men den som hadde en forespørsel, ser fortsatt et lite bilde av tingen ved forespørselen. |
| T04 | O | 2 | Endre når en ting kan lånes og vilkårene, og se at nye forespørsler følger endringene | Nye perioder og vilkår vises med en gang på tingens side, både for eieren og for den som vil låne. En ny forespørsel kan bare gjelde dager innenfor periodene, og den viser de nye vilkårene. |
| T05 | O | 2 | Publiser en ting i ett miljø, så i to, og for venner, og sjekk hvem som ser den | Tingen vises bare der eieren har valgt å publisere den: i hvert miljø som er valgt, og for venner bare når «Venner» er slått på. Den som ikke er med i noe av dette, ser den ikke. |
| T06 | O | 2 | Søk etter ting i «Finn», hos venner og i et miljø, og se at bare riktige treff kommer | Søket viser ting fra miljøene du er med i og fra venner som har gjort tingen synlig for venner. Ting fra miljøer du ikke er med i, og fra folk du ikke har noen relasjon til, kommer aldri med. |
| T07 | O | 3 | Se en ting som er utlånt, stanset eller ikke ledig, og sjekk at grunnen ikke vises | Den som vil låne, ser bare om tingen er ledig og fra når, for eksempel «Ikke ledig for nye lån nå» eller «Ledig fra …». Hvem som har lånt den, at den er stanset, eller andre grunner vises ikke. |
| T08 | O | 2 | Finn egne og medeide ting i «Mine ting», og sjekk at status og knapper er lette å forstå | Alle ting kontoen eier alene eller sammen med andre, står i «Mine ting» med bilde, hvor de vises og en kort status. Arkiverte ting ligger for seg, og på hver ting er det tydelig hva man kan gjøre. |
| T09 | O | 2 | Følg en ting i et miljø og få varsel når den blir ledig igjen, bare så lenge du ser den | Den som følger en ting i et miljø, får et varsel når tingen blir ledig for lån igjen. Har vedkommende mistet tilgangen til tingen, kommer det ikke noe varsel. |
| T10 | O | 3 | Arkiver en ting og gjenopprett den, og se at den forsvinner og kommer tilbake som før | En arkivert ting kan ikke finnes eller lånes av andre, men eieren ser den under «Arkiverte ting». Etter gjenoppretting vises den igjen på de samme stedene, med de samme opplysningene og bildene. |
| T11 | U | 4 | Slett en testting som ikke er i noe lån, og se at andres historikk blir stående | Tingen, bildene og versjonshistorikken slettes for godt og kan ikke lenger finnes eller åpnes av noen. En tidligere forespørsel om tingen blir stående for den som sendte den, med et lite bilde, men uten vei til tingen. |
| T12 | U | 4 | Prøv å slette en ting som har et godkjent eller pågående lån, og se at det stoppes | Så lenge tingen er med i et lån som er avtalt, pågår eller ikke er avklart, kan den ikke slettes. Eieren får en forklaring, og tingen og lånet er urørt; når lånet er avsluttet, går slettingen. |
| T13 | U | 4 | Inviter en medeier, la begge styre tingen, og se at historikken viser hvem som gjorde hva | Den inviterte blir medeier først når hen godtar, og begge eierne kan deretter endre tingen på samme måte. Versjonshistorikken viser hvem som gjorde hver endring, og ingen eier kan fjerne den andre. |
| T14 | U | 4 | La en medeier stanse nye lån, og se at stansen gjelder for alle til hen selv opphever den | Når én eier stanser nye lån i en periode eller helt, kan ingen be om eller få godkjent lån i den tiden, heller ikke den andre eieren. Bare den som satte stansen, kan oppheve den. |
| T15 | U | 4 | Rediger samme ting fra to steder samtidig, og se at ingen endring overskrives i stillhet | Har noen lagret tingen etter at du åpnet redigeringen, får du se hva som er lagret før du lagrer selv. Du velger om dine endringer skal legges over, og det den andre endret i andre felt, blir beholdt. |

### T01 – Registrer en ny ting med navn, kategori og beskrivelse

**Prioritet:** B · **Fase:** 1

**Forventet resultat:** Tingen blir lagret med navnet, kategorien og beskrivelsen du skrev, og den står i «Mine ting». Den er bare synlig for deg til du selv velger hvor den skal vises.

**Før du starter**

- Konto A er logget inn på mobil eller PC.
- Konto A er aktivt medlem av minst ett testmiljø, her kalt Testmiljø 1. Tingen skal ikke publiseres der i denne testen, men brukes videre i T02–T06.

**Slik gjør du det**

1. Logg inn som Konto A og trykk «Mine ting» i hovedmenyen.
2. Trykk «Registrer en ting». Se at overskriften er «Hva vil du låne bort?» og at det står «Steg 1 av 4».
3. Trykk «Videre» uten å fylle ut noe. Se at du blir stående på samme steg, og at nettleseren peker på et felt som må fylles ut.
4. Skriv «Lånetest drill» i feltet «Navn».
5. Åpne listen «Kategori» (der det står «Velg kategori») og velg «Verktøy».
6. Skriv «Slagdrill, 700 W, med koffert og tre bor.» i feltet «Beskrivelse». Ikke legg til bilder. Trykk «Videre».
7. På siden «Når kan den lånes?»: la «Når som helst» være valgt, la «Vilkår for lånet (valgfritt)» stå tomt, og trykk «Videre».
8. På siden «Hvem kan låne den?»: ikke kryss av for noe miljø og ikke for «Venner». Trykk «Videre».
9. På siden «Se over og publiser»: se at Navn er «Lånetest drill», Kategori «Verktøy», Bilder «Ingen», Beskrivelse er teksten fra steg 6, at «Ledig» begynner med «Når som helst», og at alle miljøene og «Venner» står som «Ikke valgt».
10. Trykk «Lagre uten å publisere».
11. Se at tingens side åpnes med overskriften «Lånetest drill» og «Verktøy» under navnet, og at det står «Bare synlig for deg. Ingen andre kan se den ennå.»
12. Bla ned til «Hvor den vises». Se at Testmiljø 1 står som «Ikke publisert» og Venner som «Ikke synlig».
13. Bla ned til «Om tingen». Se at Vilkår er «Ingen egne vilkår», Kategori er «Verktøy» og Beskrivelse er teksten fra steg 6.
14. Trykk «Mine ting» i hovedmenyen og last siden på nytt. Se at «Lånetest drill» står under overskriften «Verktøy», med linjen «Bare synlig for deg» og merket «Kan lånes ut».

**Testen er bestått når**

- Det gikk ikke å komme videre fra steg 1 uten å fylle ut navn, kategori og beskrivelse.
- Tingens side viser nøyaktig navnet «Lånetest drill», kategorien «Verktøy» og beskrivelsen fra steg 6.
- «Hvor den vises» viser «Ikke publisert» for miljøene og «Ikke synlig» for Venner.
- Tingen står i «Mine ting» under «Verktøy» med «Bare synlig for deg», også etter at siden er lastet på nytt.

### T02 – Legg bilder på en ting og se at de vises for dem som kan se tingen, og bare for dem

**Prioritet:** B · **Fase:** 1

**Forventet resultat:** En ting kan ha fra ett til fem bilder. Hovedbildet vises på kortet for tingen, alle bildene vises på tingens side for dem som kan se tingen, og den som ikke har tilgang til tingen, ser heller ikke bildene.

**Før du starter**

- Bruk «Lånetest drill» fra T01 (Konto A eier den).
- Konto B er aktivt medlem av Testmiljø 1. Konto C er ikke medlem av Testmiljø 1 og ikke venn med Konto A.
- Ha seks forskjellige bilder klare på enheten til Konto A, for eksempel bilder av en drill tatt fra ulike kanter.
- Bruk to enheter, eller én vanlig og én privat nettleserfane, så to kontoer kan være logget inn samtidig. Steg 12–13 må gjøres på PC.

**Slik gjør du det**

1. Logg inn som Konto A, trykk «Mine ting», åpne «Lånetest drill» og trykk «Rediger tingen».
2. Trykk «Legg til bilder» og velg alle seks bildene på én gang.
3. Se at det står «Bare 5 bilder er med.», at fem bilder vises, at det første er merket «Hovedbilde», og at knappen «Legg til» ikke lenger vises.
4. Under hovedbildet: trykk «Velg utsnitt», flytt og forstørr slik at utsnittet bare viser en tydelig del av bildet (for eksempel bare håndtaket), og trykk «Bruk utsnittet».
5. Trykk «Videre» og «Videre» igjen. På «Se over og lagre»: se at Bilder er «5» og at det står «Du endrer: bilder.» Trykk «Lagre endringene».
6. Se at hovedbildet vises øverst ved navnet på tingens side. Trykk «Mine ting» og se at kortet for «Lånetest drill» viser utsnittet fra steg 4.
7. Åpne tingen igjen og trykk «Rediger tingen». Se at alle fem bildene ligger der i samme rekkefølge. Trykk «Avbryt» uten å endre noe.
8. På tingens side under «Hvor den vises»: trykk «Publiser i Testmiljø 1». Se at raden for Testmiljø 1 nå viser «Synlig for medlemmene».
9. Logg inn som Konto B på den andre enheten. Trykk «Hjem» og åpne Testmiljø 1 under «Dine miljøer». Se at kortet for «Lånetest drill» under «Ting i miljøet» viser det samme utsnittet som i steg 6.
10. Trykk på kortet. Se at alle fem bildene vises i bildestripen øverst (sveip eller bla sidelengs), at hovedbildet kommer først, og at det her vises helt, uten utsnitt.
11. Bla gjennom bildestripen og se at hvert av de fem bildene kan ses i sin helhet.
12. Som Konto B på PC: kopier adressen til tingens side fra nettleserens adressefelt. Høyreklikk på bilde 2 og velg «Kopier bildeadresse». Lim begge inn i et notat.
13. Logg inn som Konto C i et annet nettleservindu. Lim inn adressen til tingens side i adressefeltet og se at siden sier «Finnes ikke». Lim så inn bildeadressen og se at bildet ikke vises.

**Testen er bestått når**

- Det gikk ikke å legge til mer enn fem bilder, og meldingen «Bare 5 bilder er med.» ble vist.
- Kortet i «Mine ting» og kortet i Testmiljø 1 viser utsnittet som ble valgt av hovedbildet.
- Konto B ser alle fem bildene på tingens side, med hovedbildet først og helt.
- Konto C får «Finnes ikke» for tingens side og ser ikke bildet når bildeadressen åpnes.

### T03 – Bytt bilder på en testting, arkiver og slett den, og se hvilke bilder som blir igjen

**Prioritet:** O · **Fase:** 2

**Forventet resultat:** Når bildene endres, viser kort, sider og forespørsler det nye hovedbildet med en gang. Etter arkivering og sletting er tingen borte for andre, men den som hadde en forespørsel, ser fortsatt et lite bilde av tingen ved forespørselen.

**Før du starter**

- Konto A registrerer en egen testting «Bildetest lykt» (kategori «Friluftsliv og tur», «Når som helst») med tre bilder, og publiserer den i Testmiljø 1. Tingen slettes til slutt i testen.
- Konto B er aktivt medlem av Testmiljø 1.
- Ha to nye bilder klare på enheten til Konto A som ser tydelig annerledes ut enn de tre første.
- Bruk to enheter, eller én vanlig og én privat nettleserfane.

**Slik gjør du det**

1. Som Konto B: trykk «Hjem», åpne Testmiljø 1, trykk «Bildetest lykt» og trykk «Be om å låne». Velg en første og siste dag neste uke, trykk «Videre» og så «Send forespørsel …». Se at forespørselens side åpnes med bildet av lykten øverst. Kopier adressen fra adressefeltet og lagre den i et notat.
2. Som Konto A: åpne «Bildetest lykt» fra «Mine ting» og trykk «Rediger tingen».
3. Trykk «Fjern bilde 1». Se at bildet som var nummer 2, nå er merket «Hovedbilde».
4. Trykk «Legg til» og velg de to nye bildene. Trykk «Velg utsnitt» under hovedbildet, velg et tydelig utsnitt og trykk «Bruk utsnittet».
5. Trykk «Videre» to ganger og så «Lagre endringene». Se at bildet ved navnet på tingens side og kortet i «Mine ting» viser det nye hovedbildet med utsnittet fra steg 4.
6. Som Konto B: last Testmiljø 1 på nytt og se at kortet viser det nye hovedbildet. Åpne tingen og se at bildestripen viser fire bilder, og at bildet som ble fjernet, ikke er med.
7. Som Konto B: åpne adressen til forespørselen fra steg 1. Se at bildet øverst nå er det nye hovedbildet.
8. Som Konto A: åpne «Versjonshistorikk» nederst på tingens side. Se linjer med «Bilde fjernet» og «Bilde lagt til».
9. Som Konto A: trykk «Flere valg» og så «Arkiver». Les dialogen «Arkivere Bildetest lykt?» og trykk «Arkiver Bildetest lykt». Se at status nå er «Arkivert».
10. Som Konto A: trykk «Mine ting», åpne «Arkiverte ting (1)» nederst, og se at kortet for lykten fortsatt viser hovedbildet.
11. Som Konto B: last Testmiljø 1 på nytt og se at lykten ikke lenger står der. Åpne adressen til forespørselen igjen og se at bildet av lykten fortsatt vises øverst.
12. Som Konto A: åpne lykten fra «Arkiverte ting», trykk «Flere valg» og så «Slett tingen». Les dialogen og trykk «Slett Bildetest lykt». Se at du havner i «Mine ting», og at lykten er borte, også fra de arkiverte.
13. Som Konto B: åpne adressen til forespørselen igjen. Se at siden fortsatt åpnes, at overskriften er «Tingen finnes ikke lenger», og at det står et lite, kvadratisk og noe grovt bilde av hovedbildet (utsnittet fra steg 4).

**Testen er bestått når**

- Etter bildeendringen viste tingens side, kortet i «Mine ting», kortet i Testmiljø 1 og Konto B sin forespørsel det nye hovedbildet, og bildet som ble fjernet, var borte overalt.
- Versjonshistorikken viste både «Bilde fjernet» og «Bilde lagt til».
- Etter arkivering lå lykten under «Arkiverte ting» med bilde, Konto B fant den ikke i Testmiljø 1, men så fortsatt bildet på forespørselen.
- Etter sletting var lykten borte fra «Mine ting», og Konto B sin forespørsel viste fortsatt et lite miniatyrbilde av hovedbildet.

### T04 – Endre når en ting kan lånes og vilkårene, og se at nye forespørsler følger endringene

**Prioritet:** O · **Fase:** 2

**Forventet resultat:** Nye perioder og vilkår vises med en gang på tingens side, både for eieren og for den som vil låne. En ny forespørsel kan bare gjelde dager innenfor periodene, og den viser de nye vilkårene.

**Før du starter**

- Bruk «Lånetest drill» fra T01–T02, publisert i Testmiljø 1, med «Når som helst», uten egne vilkår og uten åpne forespørsler.
- Konto B er aktivt medlem av Testmiljø 1.
- Regn ut datoene på forhånd: periode 1 er fra om 3 dager til om 10 dager, periode 2 er fra om 20 dager til om 25 dager.
- Bruk to enheter, eller én vanlig og én privat nettleserfane.

**Slik gjør du det**

1. Som Konto A: åpne «Lånetest drill» fra «Mine ting», trykk «Rediger tingen» og trykk «Videre» til siden «Når kan den lånes?».
2. Velg «Bare i bestemte perioder». Under «Periode 1»: sett «Fra» til datoen om 3 dager og «Til (valgfritt)» til datoen om 10 dager.
3. Trykk «Legg til periode». Under «Periode 2»: sett «Fra» til om 8 dager og «Til (valgfritt)» til om 22 dager. Se meldingen «Periodene 1 og 2 har dager felles. Slå dem sammen eller endre datoene.» Trykk «Videre» og se at du blir stående på samme side.
4. Endre «Periode 2» til fra om 20 dager og til om 25 dager. Se at meldingen forsvinner.
5. Skriv «Boret må rengjøres før retur.» i feltet «Vilkår for lånet (valgfritt)». Trykk «Videre».
6. På «Se over og lagre»: se at «Ledig» viser de to periodene, at «Vilkår» viser teksten fra steg 5, og at det står «Du endrer: vilkår for lånet, når den kan lånes.» Trykk «Lagre endringene».
7. Som Konto A: se at «Om tingen» på tingens side viser de to periodene under «Ledig» og den nye teksten under «Vilkår».
8. Som Konto B: åpne Testmiljø 1 fra «Hjem» og trykk «Lånetest drill». Se at status er «Ledig fra» og datoen om 3 dager, at boksen med vilkår viser «Boret må rengjøres før retur.», og at «Om tingen» viser begge periodene.
9. Som Konto B: trykk «Be om å låne». Sett «Første dag» til om 12 dager og «Siste dag» til om 14 dager (mellom periodene). Trykk «Videre» og så «Send forespørsel …».
10. Se meldingen «Tingen er ikke ledig i hele tiden du ba om, eller vilkårene er endret. …», og at du blir stående på siden uten at noe er sendt.
11. Trykk «Periode» øverst for å gå tilbake. Sett «Første dag» til om 4 dager og «Siste dag» til om 6 dager, og trykk «Videre».
12. På «Se over og send»: se at «Vilkår» viser «Boret må rengjøres før retur.» Trykk «Send forespørsel …» og se at forespørselens side åpnes.
13. Rydd opp: som Konto B, trykk «Trekk forespørselen» og bekreft med «Trekk forespørselen». Som Konto A: trykk «Rediger tingen», velg «Når som helst» igjen, tøm feltet for vilkår og lagre.

**Testen er bestått når**

- Overlappende perioder ble stoppet med meldingen om at periodene har dager felles.
- Etter lagring viste både eierens og Konto B sin visning av tingen de to periodene og vilkåret «Boret må rengjøres før retur.».
- Forespørselen for dager mellom periodene ble avvist med meldingen «Tingen er ikke ledig i hele tiden du ba om …», og ingen forespørsel ble opprettet.
- Forespørselen innenfor periode 1 viste det nye vilkåret på «Se over og send» og ble sendt.

### T05 – Publiser en ting i ett miljø, så i to, og for venner, og sjekk hvem som ser den

**Prioritet:** O · **Fase:** 2

**Forventet resultat:** Tingen vises bare der eieren har valgt å publisere den: i hvert miljø som er valgt, og for venner bare når «Venner» er slått på. Den som ikke er med i noe av dette, ser den ikke.

**Før du starter**

- Konto A er aktivt medlem av Testmiljø 1 og Testmiljø 2. Ingen av miljøene krever at administratorene godkjenner nye ting (ellers står publiseringen som «Venter på godkjenning»).
- Konto B er aktivt medlem av både Testmiljø 1 og Testmiljø 2 og er venn med Konto A.
- Konto C er ikke medlem av noen av miljøene og ikke venn med Konto A.
- Bruk to enheter, eller én vanlig og én privat nettleserfane.

**Slik gjør du det**

1. Som Konto A: trykk «Mine ting» og «Registrer en ting». Skriv Navn «Lånetest stige», velg Kategori «Verktøy», skriv Beskrivelse «Aluminiumsstige, 3 meter.» og trykk «Videre» to ganger.
2. På «Hvem kan låne den?»: kryss av bare for Testmiljø 1 (ikke Testmiljø 2, ikke «Venner») og trykk «Videre». Se at knappen heter «Publiser i Testmiljø 1». Trykk den.
3. Som Konto A: se under «Hvor den vises» at Testmiljø 1 står som «Synlig for medlemmene», Testmiljø 2 som «Ikke publisert» og Venner som «Ikke synlig».
4. Som Konto B: trykk «Hjem» og åpne Testmiljø 1. Se at «Lånetest stige» står under «Ting i miljøet». Åpne Testmiljø 2 og se at den ikke står der. Trykk «Konto», «Venner» og navnet til Konto A under «Dine venner», og se at stigen ikke står under «Ting du kan låne direkte fra …» (delen kan mangle helt).
5. Som Konto A: trykk «Publiser i Testmiljø 2» under «Hvor den vises». Se at raden viser «Synlig for medlemmene».
6. Som Konto B: se at stigen nå står i både Testmiljø 1 og Testmiljø 2, men fortsatt ikke på profilen til Konto A.
7. Som Konto A: trykk «Trekk tilbake» på raden for Testmiljø 1, og bekreft med «Trekk tilbake fra Testmiljø 1». Se at raden viser «Ikke publisert lenger» og «Trukket tilbake av en eier».
8. Som Konto A: trykk «Vis for venner» på raden «Venner». Se at raden viser «Synlig for venner».
9. Som Konto B: se at stigen ikke står i Testmiljø 1, at den står i Testmiljø 2, og at den står under «Ting du kan låne direkte fra …» på profilen til Konto A.
10. Som Konto A: trykk «Trekk tilbake» på raden for Testmiljø 2 og bekreft med «Trekk tilbake fra Testmiljø 2».
11. Som Konto B: se at stigen ikke står i Testmiljø 1 eller Testmiljø 2, men fortsatt på profilen til Konto A.
12. Som Konto A: trykk «Mine ting» og se at kortet for stigen bare nevner «Venner» og ikke noe miljø.
13. Som Konto B: åpne stigen fra profilen til Konto A og kopier adressen fra adressefeltet. Logg inn som Konto C, søk etter «stige» i «Finn» og se «Ingen treff». Lim inn adressen og se at siden sier «Finnes ikke».

**Testen er bestått når**

- Etter hvert valg så Konto B stigen nøyaktig der den var publisert: først bare Testmiljø 1, så begge miljøene, så Testmiljø 2 og venner, og til slutt bare venner.
- Raden for hvert miljø og for Venner under «Hvor den vises» viste til enhver tid det samme som Konto B faktisk så.
- Stigen var aldri synlig for venner før «Vis for venner» ble trykket.
- Konto C fant aldri stigen, verken i «Finn» eller via adressen.

### T06 – Søk etter ting i «Finn», hos venner og i et miljø, og se at bare riktige treff kommer

**Prioritet:** O · **Fase:** 2

**Forventet resultat:** Søket viser ting fra miljøene du er med i og fra venner som har gjort tingen synlig for venner. Ting fra miljøer du ikke er med i, og fra folk du ikke har noen relasjon til, kommer aldri med.

**Før du starter**

- Konto B er aktivt medlem av Testmiljø 1 (ikke Testmiljø 3), venn med Konto A og ikke venn med Konto C.
- Konto A har «Lånetest drill» (Verktøy, «Når som helst») publisert i Testmiljø 1, «Lånetest stige» (Verktøy) som bare er synlig for venner (slik T05 sluttet), og «Lånetest telt» (Friluftsliv og tur) publisert i Testmiljø 1 med bare én periode, fra om 10 dager uten sluttdato.
- Konto C er medlem av Testmiljø 3 (der verken A eller B er med) og har «Lånetest hammer» (Verktøy) publisert der.
- Bruk to enheter, eller én vanlig og én privat nettleserfane.

**Slik gjør du det**

1. Som Konto B: trykk «Finn». Se at «Ting» er valgt øverst. Skriv «lånetest» i feltet «Hva leter du etter?» og trykk «Søk».
2. Se at overskriften er «3 ting», og at drill, stige og telt vises under overskriftene «Verktøy» og «Friluftsliv og tur», med navnet til Konto A på kortene. Se at «Lånetest hammer» ikke vises.
3. Trykk på «Lånetest stige» og se at tingens side åpnes med knappen «Be om å låne». Gå tilbake til søket.
4. Trykk «Avgrens søket», velg «Verktøy» i «Kategori» og trykk «Søk». Se at bare drill og stige vises («2 ting»).
5. Sett «Kategori» tilbake til «Alle kategorier». Under «Ledig hele perioden (valgfritt)»: sett «Første dag» til i morgen og «Siste dag» til om 3 dager, og trykk «Søk». Se at drill og stige vises, men ikke telt.
6. Tøm begge datofeltene. Skriv «hammer» i søkefeltet og trykk «Søk». Se «Ingen treff» og teksten «Ingen ting i miljøene dine passer med søket.»
7. Skriv bare «a» i søkefeltet og trykk «Søk». Se meldingen «Skriv minst to tegn.»
8. Som Konto B: trykk «Konto», «Venner» og navnet til Konto A under «Dine venner». Se at delen «Ting du kan låne direkte fra …» viser bare «Lånetest stige», ikke drill eller telt.
9. Som Konto B: trykk «Hjem» og åpne Testmiljø 1. Skriv «lånetest» i feltet «Søk i Testmiljø 1» og trykk «Søk». Se overskriften «2 ting for «lånetest»» med drill og telt, men ikke stige eller hammer.
10. I det samme resultatet: trykk «Ledig nå» og se at bare drill står igjen. Trykk «Alle» for å få telt tilbake.
11. Logg inn som Konto C. Trykk «Finn», søk etter «lånetest» og se at bare «Lånetest hammer» vises, merket «Din ting», og ingen av tingene til Konto A.

**Testen er bestått når**

- Konto B sitt søk i «Finn» viste drill, stige og telt, og aldri hammer.
- Kategorifilteret «Verktøy» og datofilteret fjernet telt og ingenting annet.
- Profilen til Konto A viste bare stige, og søket i Testmiljø 1 viste bare drill og telt.
- Konto C fant bare sin egen hammer og ingen av tingene til Konto A.

### T07 – Se en ting som er utlånt, stanset eller ikke ledig, og sjekk at grunnen ikke vises

**Prioritet:** O · **Fase:** 3

**Forventet resultat:** Den som vil låne, ser bare om tingen er ledig og fra når, for eksempel «Ikke ledig for nye lån nå» eller «Ledig fra …». Hvem som har lånt den, at den er stanset, eller andre grunner vises ikke.

**Før du starter**

- Konto A eier tre testting publisert i Testmiljø 1: «Lånetest drill» og «Lånetest trillebår» med «Når som helst», og «Lånetest telt» med bare én periode, fra om 10 dager uten sluttdato.
- En fjerde testkonto, her kalt Konto D, er aktivt medlem av Testmiljø 1 og venn med Konto A. Konto B er aktivt medlem av Testmiljø 1 og er den som ser på tingene.
- Før testen: Konto D har bedt om å låne «Lånetest drill» fra i dag og til og med om 2 dager, og Konto A har godkjent lånet med «Godkjenn lån …». Overleveringen trenger ikke registreres.
- Før testen: Konto A har invitert Konto D som medeier av «Lånetest trillebår» og D har trykket «Bli medeier» (som i T13 steg 1–4). Deretter har D trykket «Stans alle nye lån» under «Stans av nye lån» og bekreftet med «Stans alle nye lån».
- Bruk to enheter, eller én vanlig og én privat nettleserfane.

**Slik gjør du det**

1. Som Konto B: trykk «Hjem» og åpne Testmiljø 1. Se merket på kortene under «Ting i miljøet»: drill skal vise «Ledig fra» og datoen om 3 dager, trillebår «Ikke ledig for nye lån nå», og telt «Ledig fra» og datoen om 10 dager.
2. Trykk på «Lånetest drill». Se at status er «Ledig fra» og datoen om 3 dager, og at dagene i dag og de to neste ikke er fylt i ukestripen. Les hele siden og se at ordene «utlånt», «lånt» eller «reservert» ikke står der, og at navnet til Konto D ikke står noe sted.
3. Gå tilbake og trykk på «Lånetest trillebår». Se at status er «Ikke ledig for nye lån nå», og at knappen «Be om å låne» ikke finnes. Les hele siden og se at det ikke står noe om at noen har stanset eller sperret den (at navnene til eierne står øverst, er i orden).
4. Gå tilbake og trykk på «Lånetest telt». Se at status er «Ledig fra» og datoen om 10 dager.
5. Som Konto B: trykk «Finn», søk etter «lånetest» og se at kortene for drill, trillebår og telt har de samme merkene som i steg 1.
6. Som Konto A: trykk «Mine ting» og åpne «Lånetest trillebår». Se at status er «Kan ikke lånes ut nå» med teksten «… har stanset alle nye lån.» og navnet til Konto D. Dette viser at eierne ser grunnen, mens Konto B ikke gjorde det.
7. Rydd opp: som Konto D, trykk «Opphev stansen» på trillebåren. Som Konto A, åpne lånet av drillen fra «Lån», trykk «Flere valg» og «Kanseller lånet», og bekreft med «Kanseller lånet».

**Testen er bestått når**

- Konto B så «Ledig fra …» for drill og telt og «Ikke ledig for nye lån nå» for trillebår, både i miljøet, på tingenes sider og i «Finn».
- Ingen av Konto B sine visninger sa hvem som hadde lånt drillen, at den var utlånt, eller at en eier hadde stanset trillebåren.
- Knappen «Be om å låne» manglet for trillebåren.
- Konto A så grunnen «… har stanset alle nye lån.» på trillebåren.

### T08 – Finn egne og medeide ting i «Mine ting», og sjekk at status og knapper er lette å forstå

**Prioritet:** O · **Fase:** 2

**Forventet resultat:** Alle ting kontoen eier alene eller sammen med andre, står i «Mine ting» med bilde, hvor de vises og en kort status. Arkiverte ting ligger for seg, og på hver ting er det tydelig hva man kan gjøre.

**Før du starter**

- Konto A har minst: én ting publisert i Testmiljø 1 («Lånetest drill»), én ting bare synlig for venner («Lånetest stige»), én ting som ikke er publisert noe sted, én arkivert ting og én ting som A og B eier sammen.
- Mangler den arkiverte eller den medeide tingen, gjør T10 steg 1–2 og T13 steg 1–4 først.
- Konto B er medeier av den felles tingen.

**Slik gjør du det**

1. Som Konto A: trykk «Mine ting». Se at knappen «Registrer en ting» står øverst.
2. Se at tingene står gruppert under kategorioverskrifter (for eksempel «Verktøy»), i alfabetisk rekkefølge innenfor hver gruppe.
3. Se på hvert kort: bilde (eller en tom plass uten bilde), navn, en linje om hvor tingen vises (miljøets navn, «Venner» eller «Bare synlig for deg»), «Dere er 2 eiere» på den felles tingen, og et statusmerke som «Kan lånes ut», «Ikke ledig nå», «Utlånt», «Sperret for nye lån» eller «Mangler ledig tid».
4. For hvert kort: sjekk at linjen og statusen stemmer med det du vet om tingen. Noter avvik.
5. Åpne «Arkiverte ting (1)» nederst. Se at den arkiverte tingen står der med merket «Arkivert», og at den ikke står i listen over.
6. Åpne den felles tingen. Se merket «Dere er 2 eiere» øverst, knappen «Rediger tingen», og delene «Lån og forespørsler», «Hvor den vises», «Om tingen», «Eiere» og «Stans av nye lån». Trykk «Flere valg» og se «Arkiver», «Samtykk til sletting» og «Versjonshistorikk». Ikke trykk på dem.
7. Åpne tingen som ikke er publisert. Se teksten «Bare synlig for deg. Ingen andre kan se den ennå. Velg hvor den skal vises når du er klar.» Trykk «Velg hvor den vises» og se at siden hopper til «Hvor den vises».
8. Åpne «Lånetest drill». Trykk «Flere valg» og se at det her står «Slett tingen» (ikke «Samtykk til sletting»), fordi Konto A eier den alene. Ikke trykk.
9. Gå til «Mine ting» og åpne «Hva kan lånes ut gjennom Lånbort?» nederst. Se at listen over hva som ikke kan lånes ut, vises.
10. Logg inn som Konto B, trykk «Mine ting» og se at den felles tingen står der med «Dere er 2 eiere» og samme statusmerke som Konto A ser.
11. Gå gjennom alle statusmerker og knapper du har sett, og skriv i kommentaren hvilke ord eller knapper som var uklare, om noen.

**Testen er bestått når**

- Alle tingene til Konto A, også den medeide, står i «Mine ting», og den arkiverte ligger bare under «Arkiverte ting».
- Hvert kort viser hvor tingen vises og et statusmerke som stemmer med virkeligheten.
- Den felles tingen står hos både Konto A og Konto B med «Dere er 2 eiere».
- Testeren kunne si hva hver status og hver knapp betyr uten hjelp, og eventuelle uklare ord er skrevet i kommentaren.

### T09 – Følg en ting i et miljø og få varsel når den blir ledig igjen, bare så lenge du ser den

**Prioritet:** O · **Fase:** 2

**Forventet resultat:** Den som følger en ting i et miljø, får et varsel når tingen blir ledig for lån igjen. Har vedkommende mistet tilgangen til tingen, kommer det ikke noe varsel.

**Før du starter**

- Konto A eier «Følgetest sykkelvogn» (kategori «Sykler og sykkelutstyr», «Når som helst»), publisert bare i Testmiljø 1 og ikke for venner.
- Konto B er aktivt medlem av Testmiljø 1 og venn med Konto A.
- Bruk to enheter, eller én vanlig og én privat nettleserfane. Varsler kan bruke opptil et par minutter på å komme fram.

**Slik gjør du det**

1. Som Konto B: trykk «Hjem», åpne Testmiljø 1 og trykk «Følgetest sykkelvogn». Se knappen «Følg tingen» og teksten «Følg tingen for å få beskjed når den blir ledig igjen eller endres.» Trykk «Følg tingen».
2. Se at knappen nå heter «Slutt å følge» og at teksten er «Du følger tingen og får beskjed når den blir ledig igjen eller endres.»
3. Som Konto A: åpne sykkelvogna, trykk «Rediger tingen» og «Videre». Velg «Bare i bestemte perioder», trykk «Fjern periode 1» til det står «Ingen perioder ennå. Den kan ikke lånes ut før du legger inn en.», trykk «Videre» og «Lagre endringene». Se at status er «Kan ikke lånes ut ennå».
4. Som Konto B: last tingens side på nytt. Se «Ikke ledig for nye lån nå» og at «Be om å låne» mangler. Vent to minutter, åpne «Varsler» og se at det ikke har kommet noe nytt varsel om tingen.
5. Som Konto A: trykk «Rediger tingen» og «Videre», velg «Når som helst», trykk «Videre» og «Lagre endringene».
6. Som Konto B: vent opptil to minutter og åpne «Varsler» (last siden på nytt). Se et nytt varsel «Et objekt du abonnerer på er tilgjengelig igjen».
7. Som Konto A: under «Hvor den vises», trykk «Trekk tilbake» på Testmiljø 1 og bekreft med «Trekk tilbake fra Testmiljø 1».
8. Som Konto B: last tingens side på nytt og se at den sier «Finnes ikke».
9. Som Konto A: gjør steg 3 og steg 5 en gang til (først ingen perioder, så «Når som helst»).
10. Som Konto B: vent to minutter, åpne «Varsler» og se at det ikke har kommet noe nytt varsel siden steg 6.
11. Som Konto A: trykk «Publiser i Testmiljø 1». Som Konto B: vent to minutter og se at det fortsatt ikke har kommet noe nytt varsel.
12. Som Konto A: trykk «Vis for venner». Som Konto B: trykk «Konto», «Venner», navnet til Konto A, og åpne sykkelvogna under «Ting du kan låne direkte fra …». Se at knappen «Følg tingen» ikke finnes her.
13. Rydd opp: som Konto B, åpne sykkelvogna fra Testmiljø 1 og trykk «Slutt å følge» hvis den knappen vises. Som Konto A, trykk «Skjul for venner» og bekreft med «Skjul for venner».

**Testen er bestått når**

- Etter «Følg tingen» viste knappen «Slutt å følge».
- Det kom nøyaktig ett varsel «Et objekt du abonnerer på er tilgjengelig igjen», etter steg 5, og ikke noe etter steg 3.
- Det kom ikke noe varsel mens Konto B ikke kunne se tingen (steg 7–11).
- «Følg tingen» ble ikke tilbudt når tingen ble åpnet fra vennens profil.

### T10 – Arkiver en ting og gjenopprett den, og se at den forsvinner og kommer tilbake som før

**Prioritet:** O · **Fase:** 3

**Forventet resultat:** En arkivert ting kan ikke finnes eller lånes av andre, men eieren ser den under «Arkiverte ting». Etter gjenoppretting vises den igjen på de samme stedene, med de samme opplysningene og bildene.

**Før du starter**

- Konto A eier «Arkivtest trillebår» (kategori «Hage og uteområde», «Når som helst», minst ett bilde), publisert i Testmiljø 1 og ikke for venner.
- Konto B er aktivt medlem av Testmiljø 1.
- Bruk to enheter, eller én vanlig og én privat nettleserfane.

**Slik gjør du det**

1. Som Konto B: trykk «Finn», søk etter «arkivtest» og se at trillebåren vises. Åpne den og kopier adressen fra adressefeltet til et notat.
2. Som Konto A: åpne trillebåren fra «Mine ting», trykk «Flere valg» og «Arkiver». Se at dialogen «Arkivere Arkivtest trillebår?» sier blant annet «Ingen kan be om å låne tingen før den er gjenopprettet.» og «Alt om tingen tas vare på, og den kan gjenopprettes når som helst.» Trykk «Arkiver Arkivtest trillebår».
3. Se at status er «Arkivert» med teksten «Tingen kan ikke lånes ut før den er gjenopprettet.», at knappen «Gjenopprett» vises, og at «Rediger tingen» er borte.
4. Som Konto A: trykk «Mine ting». Se at trillebåren ikke står i hovedlisten, men under «Arkiverte ting (1)» med merket «Arkivert».
5. Som Konto B: åpne Testmiljø 1 og se at trillebåren ikke står under «Ting i miljøet». Søk etter «arkivtest» i «Finn» og se «Ingen treff». Åpne adressen fra steg 1 og se «Finnes ikke».
6. Som Konto A: åpne trillebåren under «Arkiverte ting» og trykk «Gjenopprett». Se at status ikke lenger er «Arkivert», og at Testmiljø 1 under «Hvor den vises» står som «Synlig for medlemmene».
7. Som Konto A: trykk «Mine ting». Se at trillebåren står i hovedlisten under «Hage og uteområde» med merket «Kan lånes ut», med samme bilde, og at «Arkiverte ting» er borte.
8. Som Konto B: åpne Testmiljø 1 og se trillebåren med samme navn og bilde. Søk etter «arkivtest» i «Finn» og se den igjen. Åpne adressen fra steg 1 og se at siden åpnes med knappen «Be om å låne».
9. Som Konto A: åpne «Versjonshistorikk» nederst på trillebårens side. Se linjene «Arkivert» og «Gjenopprettet fra arkivet», begge med «Du» og tidspunkt.

**Testen er bestått når**

- Mens trillebåren var arkivert, fant ikke Konto B den i Testmiljø 1 eller i «Finn», og adressen ga «Finnes ikke».
- Konto A så trillebåren under «Arkiverte ting» med «Arkivert» og knappen «Gjenopprett».
- Etter gjenoppretting var trillebåren tilbake i Testmiljø 1 og i «Finn» med samme navn, bilde og «Be om å låne».
- Versjonshistorikken viste «Arkivert» og «Gjenopprettet fra arkivet».

### T11 – Slett en testting som ikke er i noe lån, og se at andres historikk blir stående

**Prioritet:** U · **Fase:** 4

**Forventet resultat:** Tingen, bildene og versjonshistorikken slettes for godt og kan ikke lenger finnes eller åpnes av noen. En tidligere forespørsel om tingen blir stående for den som sendte den, med et lite bilde, men uten vei til tingen.

**Før du starter**

- Dette er en utvidet test med egen testting og fiktive hendelser. Konto A registrerer «Slettetest lykt» (kategori «Friluftsliv og tur», «Når som helst», to bilder) og publiserer den i Testmiljø 1.
- Konto B er aktivt medlem av Testmiljø 1.
- Tingen skal ikke ha noe godkjent, pågående eller uavklart lån, og ingen medeiere.
- Bruk PC for Konto B (for å kopiere adresser), og en annen enhet eller privat fane for Konto A.

**Slik gjør du det**

1. Som Konto B: åpne Testmiljø 1 fra «Hjem» og trykk «Slettetest lykt». Kopier adressen fra adressefeltet. Høyreklikk på bilde 1 og velg «Kopier bildeadresse». Lim begge inn i et notat.
2. Som Konto B: trykk «Be om å låne», velg dager neste uke, trykk «Videre» og «Send forespørsel …». Kopier adressen til forespørselens side til notatet.
3. Som Konto A: trykk «Lån», åpne forespørselen om «Slettetest lykt», trykk «Avslå» og bekreft med «Avslå forespørselen».
4. Som Konto A: åpne lykten fra «Mine ting» og kopier adressen fra adressefeltet til et notat.
5. Som Konto A: trykk «Flere valg» og «Slett tingen». Se at dialogen «Slette Slettetest lykt?» sier «Tingen, bildene og versjonshistorikken slettes for godt.» og «Avsluttede lån beholder avtalen slik den var.» Trykk «Slett Slettetest lykt».
6. Se at du havner i «Mine ting», og at lykten ikke står der, heller ikke under «Arkiverte ting».
7. Som Konto A: lim inn adressen fra steg 4 i adressefeltet og se «Finnes ikke».
8. Som Konto B: åpne Testmiljø 1 og se at lykten ikke står der. Søk etter «slettetest» i «Finn» og se «Ingen treff».
9. Som Konto B: åpne adressen til tingens side fra steg 1 og se «Finnes ikke». Åpne bildeadressen og se at bildet ikke vises.
10. Som Konto B: åpne adressen til forespørselen fra steg 2. Se at siden åpnes, at overskriften er «Tingen finnes ikke lenger», at et lite, kvadratisk bilde av hovedbildet står ved overskriften, og at lenken «Se tingen» ikke finnes.

**Testen er bestått når**

- Slettingen skjedde først etter dialogen som forklarte at tingen, bildene og versjonshistorikken slettes for godt.
- Etter slettingen var lykten borte for både Konto A og Konto B: ikke i «Mine ting», ikke i Testmiljø 1, ikke i «Finn», og adressen ga «Finnes ikke».
- Bildeadressen viste ikke lenger bildet.
- Konto B sin forespørsel åpnet fortsatt, med «Tingen finnes ikke lenger», et lite miniatyrbilde og uten lenken «Se tingen».

### T12 – Prøv å slette en ting som har et godkjent eller pågående lån, og se at det stoppes

**Prioritet:** U · **Fase:** 4

**Forventet resultat:** Så lenge tingen er med i et lån som er avtalt, pågår eller ikke er avklart, kan den ikke slettes. Eieren får en forklaring, og tingen og lånet er urørt; når lånet er avsluttet, går slettingen.

**Før du starter**

- Dette er en utvidet test med egen testting og et fiktivt lån. Konto A registrerer «Slettetest stige» (kategori «Verktøy», «Når som helst») og publiserer den i Testmiljø 1.
- Konto B er aktivt medlem av Testmiljø 1.
- Bruk to enheter, eller én vanlig og én privat nettleserfane. Testen gjøres på én dag.

**Slik gjør du det**

1. Som Konto B: åpne «Slettetest stige» fra Testmiljø 1, trykk «Be om å låne», la «Første dag» være i dag, sett «Siste dag» til om 2 dager, trykk «Videre» og «Send forespørsel …».
2. Som Konto A: trykk «Lån», åpne forespørselen og trykk «Godkjenn lån …». Bekreft med knappen «Godkjenn lån …» i dialogen. Se at lånets side åpnes.
3. Variant godkjent lån: som Konto A, åpne stigen fra «Mine ting», trykk «Flere valg» og «Slett tingen», og trykk «Slett Slettetest stige» i dialogen.
4. Se meldingen «Tingen kan ikke slettes mens den er med i et lån som er avtalt, pågår eller ikke er avklart.» i dialogen. Trykk «Avbryt». Last siden på nytt og se at stigen og lånet under «Lån og forespørsler» fortsatt er der.
5. Som Konto B: trykk «Lån» og se at lånet av «Slettetest stige» står der som før.
6. Registrer overleveringen: som Konto A, åpne lånet fra «Lån» og trykk knappen «… har fått Slettetest stige». Som Konto B, åpne lånet og trykk «Jeg har fått Slettetest stige». Se at lånet nå er i gang.
7. Variant pågående lån: som Konto A, gjenta steg 3 og 4. Se samme melding, og at stigen og lånet fortsatt er der.
8. Avslutt lånet: som Konto B, trykk «Meld returnert» på lånets side. Som Konto A, trykk «Jeg har fått tilbake Slettetest stige» og vent minst 30 sekunder (angrefristen) uten å trykke «Angre».
9. Som Konto A: åpne stigen igjen, trykk «Flere valg» og «Slett tingen», og trykk «Slett Slettetest stige». Se at du havner i «Mine ting» og at stigen er borte.
10. Som Konto B: trykk «Lån» og «Avsluttede lån». Se at lånet av «Slettetest stige» fortsatt står der, og åpne det for å se at avtalen og navnet er bevart.

**Testen er bestått når**

- Slettingen ble stoppet med meldingen «Tingen kan ikke slettes mens den er med i et lån som er avtalt, pågår eller ikke er avklart.», både mens lånet var godkjent og mens det pågikk.
- Etter hvert stoppet forsøk var stigen og lånet uendret for både Konto A og Konto B.
- Da lånet var avsluttet, gikk slettingen.
- Det avsluttede lånet sto fortsatt under «Avsluttede lån» hos Konto B med tingens navn.

### T13 – Inviter en medeier, la begge styre tingen, og se at historikken viser hvem som gjorde hva

**Prioritet:** U · **Fase:** 4

**Forventet resultat:** Den inviterte blir medeier først når hen godtar, og begge eierne kan deretter endre tingen på samme måte. Versjonshistorikken viser hvem som gjorde hver endring, og ingen eier kan fjerne den andre.

**Før du starter**

- Dette er en utvidet test med egen testting. Konto A eier «Medeiertest partytelt» (kategori «Fest og selskap», «Når som helst»), publisert i Testmiljø 1.
- Konto A og Konto B er venner, og begge er aktive medlemmer av Testmiljø 1.
- Bruk to enheter, eller én vanlig og én privat nettleserfane.

**Slik gjør du det**

1. Som Konto A: åpne partyteltet fra «Mine ting». Under «Eiere», velg Konto B i listen «Inviter en venn som medeier» og trykk «Inviter som medeier».
2. Se at navnet til Konto B står under «Eiere» med «Invitert av deg, har ikke svart ennå» og knappen «Trekk invitasjonen».
3. Som Konto B: åpne «Varsler» og se varselet «Du er invitert til å bli medeier av Medeiertest partytelt».
4. Som Konto B: trykk «Mine ting». Under «Invitasjoner til medeierskap» står partyteltet med «Du er invitert til å bli medeier». Trykk «Bli medeier».
5. Som Konto B: se at partyteltet nå står i «Mine ting» med «Dere er 2 eiere». Åpne det og se at «Eiere» viser «Du» og navnet til Konto A.
6. Som Konto A: last tingens side på nytt. Se at «Eiere» viser «Du» og navnet til Konto B, og at invitasjonen ikke lenger står der.
7. Som Konto B: trykk «Rediger tingen», legg til «Med sidevegger.» på slutten av beskrivelsen, trykk «Videre» to ganger og «Lagre endringene».
8. Som Konto A: se at «Om tingen» viser den nye beskrivelsen. Åpne «Versjonshistorikk» nederst og se at øverste linje er «Endret», med «Endret beskrivelse» og navnet til Konto B og tidspunkt.
9. Som Konto A: trykk «Rediger tingen», trykk «Videre», skriv «Må tørkes før retur.» i «Vilkår for lånet (valgfritt)», trykk «Videre» og «Lagre endringene».
10. Som Konto B: åpne «Versjonshistorikk». Se at øverste linje sier «Endret vilkår» med navnet til Konto A, og at linjen under sier «Endret beskrivelse» med «Du».
11. Som Konto B: trykk «Hent tilbake» på en eldre versjon, og bekreft med «Hent tilbake versjon …». Se at en ny øverste linje sier «Tidligere versjon hentet tilbake (versjon …)» med «Du», og at de eldre linjene fortsatt står der.
12. Som Konto A og som Konto B: se under «Eiere» at det ikke finnes noen knapp for å fjerne den andre eieren, bare «Tre ut som eier» (som gjelder deg selv). Ikke trykk den.
13. Som Konto B: se under «Hvor den vises» at Testmiljø 1 står som «Synlig for medlemmene» med knappen «Trekk tilbake», slik Konto A også ser det. Ikke trykk.

**Testen er bestått når**

- Konto B ble medeier først etter å ha trykket «Bli medeier», og fram til da sto B som invitert hos Konto A.
- Begge eierne kunne endre tingen, og endringen var synlig for den andre.
- Versjonshistorikken viste hver endring med riktig person: «Du» for egne endringer og den andres navn for den andres.
- Å hente tilbake en eldre versjon la til en ny linje uten å fjerne de eldre, og ingen av eierne hadde en knapp for å fjerne den andre.

### T14 – La en medeier stanse nye lån, og se at stansen gjelder for alle til hen selv opphever den

**Prioritet:** U · **Fase:** 4

**Forventet resultat:** Når én eier stanser nye lån i en periode eller helt, kan ingen be om eller få godkjent lån i den tiden, heller ikke den andre eieren. Bare den som satte stansen, kan oppheve den.

**Før du starter**

- Bruk «Medeiertest partytelt» fra T13 (Konto A og Konto B eier den sammen), publisert i Testmiljø 1 med «Når som helst» og uten stans.
- En ekstra testkonto, her kalt Konto D, er aktivt medlem av Testmiljø 1 og ikke eier av tingen.
- Regn ut datoene på forhånd: stansen gjelder fra og med om 5 dager til og med om 7 dager.
- Bruk to eller tre enheter, eller vanlige og private nettleserfaner.

**Slik gjør du det**

1. Som Konto B: åpne partyteltet. Under «Stans av nye lån», i «Stans nye lån i en periode», sett «Fra og med» til om 5 dager og «Til og med» til om 7 dager, og trykk «Stans nye lån i perioden».
2. Som Konto B: se at det står «Du har stanset nye lån …» med datoene og knappen «Opphev stansen».
3. Som Konto A: last tingens side på nytt. Se linjen med navnet til Konto B og «har stanset nye lån …», og teksten «Bare … kan oppheve den.». Se at Konto A ikke har noen «Opphev stansen»-knapp.
4. Som Konto D: åpne partyteltet fra Testmiljø 1, trykk «Be om å låne», sett «Første dag» til om 6 dager og «Siste dag» til om 8 dager, trykk «Videre» og «Send forespørsel …». Se meldingen «Tingen er ikke ledig i hele tiden du ba om, eller vilkårene er endret. …» og at ingenting er sendt.
5. Som Konto D: trykk «Periode», sett «Første dag» til om 10 dager og «Siste dag» til om 11 dager, trykk «Videre» og «Send forespørsel …». Se at forespørselen blir sendt.
6. Som Konto B: trykk «Stans alle nye lån», les dialogen «Stanse alle nye lån av Medeiertest partytelt?» og trykk «Stans alle nye lån».
7. Som Konto A: se at status er «Kan ikke lånes ut nå» med teksten «… har stanset alle nye lån.», og at «Mine ting» viser merket «Sperret for nye lån».
8. Som Konto A: trykk «Lån» og åpne forespørselen fra Konto D. Se teksten «Tingen er ikke ledig i hele tiden som er ønsket. …» og at knappen «Godkjenn lån …» ikke finnes.
9. Som Konto D: åpne partyteltet. Se «Ikke ledig for nye lån nå», at «Be om å låne» mangler, og at det ikke står noe om stans.
10. Som Konto B: trykk «Opphev stansen» på linjen om at alle nye lån er stanset.
11. Som Konto A: last forespørselen fra Konto D på nytt og se at «Godkjenn lån …» nå vises. Ikke godkjenn; trykk «Avslå» og bekreft med «Avslå forespørselen».
12. Som Konto B: trykk «Opphev stansen» på stansen for perioden. Som Konto D: be om å låne fra om 6 dager til om 8 dager igjen, og se at forespørselen nå blir sendt. Trekk den med «Trekk forespørselen».

**Testen er bestått når**

- Forespørselen fra Konto D for dager i den stansede perioden ble avvist, mens en forespørsel utenfor perioden gikk.
- Mens alle nye lån var stanset, kunne Konto A ikke godkjenne forespørselen, og Konto D så bare «Ikke ledig for nye lån nå».
- Bare Konto B (som satte stansen) hadde knappen «Opphev stansen»; Konto A så «Bare … kan oppheve den.».
- Etter at Konto B opphevet stansene, gikk det igjen å godkjenne og sende forespørsler for de samme dagene.

### T15 – Rediger samme ting fra to steder samtidig, og se at ingen endring overskrives i stillhet

**Prioritet:** U · **Fase:** 4

**Forventet resultat:** Har noen lagret tingen etter at du åpnet redigeringen, får du se hva som er lagret før du lagrer selv. Du velger om dine endringer skal legges over, og det den andre endret i andre felt, blir beholdt.

**Før du starter**

- Bruk «Medeiertest partytelt» fra T13 (Konto A og Konto B eier den sammen).
- Variant 1 bruker Konto A på både PC og mobil. Variant 2 bruker Konto A på PC og Konto B på mobil (eller en privat fane).

**Slik gjør du det**

1. Variant 1, samme konto på to enheter: logg inn som Konto A på både PC og mobil. Åpne partyteltet og trykk «Rediger tingen» på begge før du lagrer noe.
2. På mobilen: legg til «Endret fra mobil.» på slutten av beskrivelsen, trykk «Videre» to ganger og «Lagre endringene». Se at tingens side viser den nye beskrivelsen.
3. På PC-en (skjemaet fra steg 1 er fortsatt åpent): endre «Navn» til «Medeiertest partytelt stort», trykk «Videre» to ganger og «Lagre endringene».
4. På PC-en: se boksen «Noen andre har lagret tingen» med teksten «En annen eier lagret endringer etter at du åpnet skjemaet. …», at «Beskrivelse» står oppført med teksten fra mobilen, og knappene «Lagre mine endringer over» og «Start fra det som er lagret». Last tingens side på mobilen og se at navnet ennå ikke er endret.
5. På PC-en: trykk «Lagre mine endringer over». Se at tingens side nå har navnet «Medeiertest partytelt stort» og fortsatt beskrivelsen med «Endret fra mobil.».
6. Variant 2, to medeiere og samme felt: Konto A på PC og Konto B på mobil åpner begge partyteltet og trykker «Rediger tingen» før noen lagrer.
7. Som Konto B: trykk «Videre», skriv «Må tørkes før retur. Ring først.» i «Vilkår for lånet (valgfritt)», trykk «Videre» og «Lagre endringene».
8. Som Konto A: trykk «Videre», skriv «Må tørkes og pakkes før retur.» i det samme feltet, trykk «Videre» og «Lagre endringene». Se boksen «Noen andre har lagret tingen» med «Vilkår for lånet» og teksten fra Konto B.
9. Som Konto A: trykk «Start fra det som er lagret». Se at skjemaet går tilbake til første steg. Trykk «Videre» og se at vilkårsfeltet nå inneholder teksten fra Konto B. Trykk «Avbryt».
10. Som Konto A: se at «Om tingen» viser vilkåret fra Konto B, ikke teksten fra steg 8.
11. Som Konto A: åpne «Versjonshistorikk». Se én linje per lagring fra stegene over (beskrivelse og tittel fra Konto A, vilkår fra Konto B), med riktig navn eller «Du», og at ingen mangler.
12. Rydd opp: som Konto A, endre navnet tilbake til «Medeiertest partytelt» og lagre.

**Testen er bestått når**

- Den andre lagringen ble aldri gjort i stillhet: boksen «Noen andre har lagret tingen» kom begge gangene og viste det som var lagret.
- «Lagre mine endringer over» beholdt endringen fra den andre enheten i det feltet du ikke hadde rørt.
- «Start fra det som er lagret» beholdt teksten til Konto B, og teksten til Konto A ble ikke lagret.
- Versjonshistorikken viste hver lagring med riktig person.

## L – Forespørsler, avtaler, overlevering og retur (20)

| ID | Prioritet | Fase | Testhandling | Forventet resultat |
| --- | :---: | :---: | --- | --- |
| L01 | B | 1 | Be en venn om å låne en ting direkte, og godta ansvarserklæringen | Forespørselen sendes som et lån direkte mellom venner. Låntakeren må godta ansvarserklæringen før den kan sendes, og eieren ser erklæringen og må også godta den før lånet kan godkjennes. |
| L02 | B | 1 | Be om å låne en ting gjennom et miljø, og sjekk at miljøet og eieren følger med | Forespørselen er merket med miljøet den ble sendt gjennom, og havner hos eieren. Miljøet og eieren er de samme også etter at lånet er godkjent. |
| L03 | O | 1 | Fyll ut en låneforespørsel og sjekk at oppsummeringen viser hva du ber om før du sender | Før forespørselen sendes viser appen en tydelig oppsummering av tingen, eieren, perioden, vilkårene og hvor forespørselen gjelder. Det står klart at ingenting er avtalt før eieren godkjenner. |
| L04 | B | 1 | Godkjenn en forespørsel og sjekk at det blir ett lån, også om du godkjenner to ganger | Når eieren godkjenner, blir det ett avtalt lån og tingen holdes av for perioden. Godkjenner eieren én gang til fra en gammel side, blir det ikke et nytt lån. |
| L05 | O | 3 | Avslå en forespørsel som eier, og trekk en forespørsel som låntaker | Begge ser at forespørselen er avsluttet og hvorfor, med nøytrale ord. Låntakeren får varsel når eieren avslår; når låntakeren trekker forespørselen, viser eierens varsel at den ikke gjelder lenger. |
| L06 | B | 1 | Send to forespørsler på samme dager og sjekk at én godkjenning stenger den andre | Når eieren godkjenner én forespørsel, avsluttes andre forespørsler som gjelder de samme dagene, og ingen kan få låne tingen de dagene. Forespørsler for andre dager består. |
| L07 | O | 3 | Endre vilkårene på en ting mens en forespørsel venter, og sjekk at låntakeren må godta dem | Når eieren endrer vilkårene mens en forespørsel venter, kan den ikke godkjennes før låntakeren har bekreftet de nye vilkårene. Låntakeren får varsel om endringen. |
| L08 | B | 1 | Se på «Lån» fra begge kontoene før og etter at eieren godkjenner | Begge ser hvor langt forespørselen eller lånet har kommet, hvem den andre parten er, og hva som er neste steg, både før og etter godkjenning. |
| L09 | B | 1 | Registrer at tingen er overlevert, og sjekk at lånet går fra reservert til utlånt | På overleveringsdagen kan utlåner eller låntaker bekrefte at tingen er overlevert. Det holder at én av dem gjør det, og da blir lånet utlånt. Før overleveringsdagen kan dette ikke registreres. |
| L10 | O | 3 | Foreslå ny periode eller lengre lån, og sjekk at endringen bare gjelder når begge er enige | En endring i lånet gjelder først når den andre parten godtar. Sier den andre nei, gjelder avtalen som før. En endring som krasjer med et annet lån, kan ikke sendes. |
| L11 | U | 4 | Kanseller et godkjent lån før overleveringen, både som utlåner og som låntaker | Både utlåner og låntaker kan kansellere et avtalt lån før tingen er overlevert, uten å oppgi grunn. Den andre får varsel, og dagene blir ledige igjen. |
| L12 | O | 3 | Meld tingen returnert som låntaker, og sjekk at utlåneren blir bedt om å bekrefte | Når låntakeren melder tingen returnert, blir lånet ikke avsluttet med en gang. Utlåneren ser at returen venter på hans eller hennes bekreftelse. |
| L13 | B | 1 | Bekreft at tingen er kommet tilbake, og sjekk at lånet avsluttes med hele historikken | Når utlåneren bekrefter at tingen er tilbake, blir lånet avsluttet for begge. Alt som skjedde i lånet står fortsatt i tidslinjen. |
| L14 | O | 3 | Angre en returbekreftelse innen 30 sekunder, og se at det ikke går når tiden er ute | En returbekreftelse kan angres i 30 sekunder. Etter det står den fast, og et senere problem må meldes som en ny hendelse som ikke sletter den første. |
| L15 | O | 3 | Lever tilbake før tiden og sjekk at resten av perioden blir ledig for andre | Når utlåneren bekrefter en tidlig retur, blir resten av perioden ledig igjen. Dager som er sperret av andre grunner, forblir sperret. |
| L16 | U | 4 | La overleveringsdagen og returdagen gå uten at noe registreres, og se hva som skjer | Når en frist går uten at noe er registrert, ber appen begge parter nøytralt om å avklare hva som skjedde, og sender varsel til begge. Ingen får skylden, og et ubesvart «overleveringen skjedde ikke» avslutter lånet som ikke gjennomført etter 72 timer. |
| L17 | U | 4 | La utlåner og låntaker si ulike ting om overleveringen og om returen | Når partene sier ulike ting, viser appen at de er uenige og hva hver av dem sa, uten å si hvem som har rett. Lånet blir ikke feilaktig satt tilbake til reservert eller avsluttet, og tingen blir ikke ledig for andre. |
| L18 | U | 4 | Meld en oppdiktet skade på en lånt ting, og la den andre svare | Begge partenes forklaringer blir lagret på lånet og vist for begge. Ingen av dem kan endre det den andre skrev, og meldingen hindrer ikke at lånet avsluttes. |
| L19 | U | 4 | Avslutt vennskapet eller medlemskapet etter at lånet er godkjent, og fullfør lånet likevel | Et lån som allerede er avtalt, fortsetter selv om vennskapet eller medlemskapet tar slutt. Begge kan fortsatt registrere overlevering og retur og avslutte lånet. |
| L20 | U | 4 | Gi ansvaret for et lån til en medeier, og sjekk at det flyttes bare når de rette sier ja | Ansvaret for lånet flyttes først når medeieren har sagt ja. Ble medeieren eier etter at lånet ble godkjent, må også låntakeren si ja. Sier noen nei, beholder den opprinnelige utlåneren ansvaret. |

### L01 – Be en venn om å låne en ting direkte, og godta ansvarserklæringen

**Prioritet:** B · **Fase:** 1

**Forventet resultat:** Forespørselen sendes som et lån direkte mellom venner. Låntakeren må godta ansvarserklæringen før den kan sendes, og eieren ser erklæringen og må også godta den før lånet kan godkjennes.

**Før du starter**

- Konto A og Konto B er venner i Lånbort (se A-testene om vennskap).
- Konto A eier tingen «Testdrill», og den er gjort synlig for venner («Vis for venner» på tingens side).
- Bruk to enheter (for eksempel mobil og PC), eller én vanlig og én privat nettleserfane, så Konto A og Konto B kan være innlogget samtidig.
- I tekstene under står [A] og [B] for navnene til Konto A og Konto B slik de vises i appen.

**Slik gjør du det**

1. Logg inn som Konto B. Trykk «Konto» øverst, og deretter «Venner».
2. Under «Dine venner», trykk på navnet til Konto A.
3. Under overskriften «Ting du kan låne direkte fra [A]», trykk på «Testdrill».
4. Trykk «Be om å låne».
5. Under «Start», velg «Velg dag» og velg en dag om tre dager i feltet «Første dag». Under «Slutt», velg «Dato» og velg dagen etter i feltet «Siste dag». Trykk «Videre».
6. På siden «Se over og send»: se at det står «Kontekst» og «Direkte mellom venner».
7. Se at det finnes en boks med overskriften «Ansvarserklæring» med fire punkter, og en avkrysningsboks «Jeg godtar ansvarserklæringen for dette lånet».
8. Ikke kryss av. Trykk den blå knappen som begynner med «Send forespørsel». Se at forespørselen ikke sendes, og at nettleseren ber deg krysse av i boksen.
9. Kryss av i «Jeg godtar ansvarserklæringen for dette lånet» og trykk «Send forespørsel …» igjen. Se at du kommer til forespørselen, og at det øverst står «Direkte mellom venner».
10. Se på forespørselen som Konto B: under «Ansvarserklæring» skal det stå «Låntakeren har godtatt. Eieren har ikke godtatt ennå.»
11. Logg inn som Konto A. Trykk «Varsler» øverst og åpne varselet «[B] vil låne Testdrill».
12. Se at statusen sier «[B] vil låne. Godta ansvarserklæringen før du svarer», at det står «Direkte mellom venner» øverst, og at knappen «Godta ansvarserklæringen» finnes, men ikke en knapp som begynner med «Godkjenn lån».
13. Trykk «Godta ansvarserklæringen». Se at teksten nå er «Låntakeren har godtatt. Eieren har godtatt.», og at en knapp som begynner med «Godkjenn lån» dukker opp. Ikke godkjenn ennå. Trekk forespørselen før du gjør L03 (L03 lager en ny som kan brukes i L04).

**Testen er bestått når**

- Forespørselen kunne ikke sendes før Konto B hadde krysset av for ansvarserklæringen.
- Både i oppsummeringen og på forespørselen står det «Direkte mellom venner».
- Konto A fikk varselet «[B] vil låne Testdrill», og forespørselen ligger hos Konto A.
- Konto A så ansvarserklæringen og fikk ikke godkjenne før A selv hadde trykket «Godta ansvarserklæringen».
- Etter at begge hadde godtatt, sto det «Låntakeren har godtatt. Eieren har godtatt.»

### L02 – Be om å låne en ting gjennom et miljø, og sjekk at miljøet og eieren følger med

**Prioritet:** B · **Fase:** 1

**Forventet resultat:** Forespørselen er merket med miljøet den ble sendt gjennom, og havner hos eieren. Miljøet og eieren er de samme også etter at lånet er godkjent.

**Før du starter**

- Konto A og Konto B er medlemmer i samme miljø, her kalt «Testmiljø Lånbort» (se M-testene).
- Konto A eier tingen «Lånetest stige», og den er publisert i «Testmiljø Lånbort». Tingen er ikke synlig for venner.
- Bruk to enheter (for eksempel mobil og PC), eller én vanlig og én privat nettleserfane, så Konto A og Konto B kan være innlogget samtidig.
- I tekstene under står [A] og [B] for navnene til Konto A og Konto B slik de vises i appen.

**Slik gjør du det**

1. Logg inn som Konto B. Trykk «Hjem» og trykk på «Testmiljø Lånbort» under «Dine miljøer».
2. Finn «Lånetest stige» i miljøet (bruk søkefeltet «Søk i Testmiljø Lånbort» om du ikke ser den) og åpne den.
3. Trykk «Be om å låne». Velg «Velg dag» med en dag om fire dager som «Første dag», og «Dato» med dagen etter som «Siste dag». Trykk «Videre».
4. På «Se over og send»: se at «Kontekst» er «Via Testmiljø Lånbort», at «Fra» viser navnet til Konto A, og at det ikke er noen boks om ansvarserklæring.
5. Trykk knappen som begynner med «Send forespørsel». Se at det øverst på forespørselen står «Via Testmiljø Lånbort».
6. Logg inn som Konto A. Trykk «Lån» i hovedmenyen. Se at forespørselen står under «Venter på deg» som «Lånetest stige til [B]», og åpne den.
7. Se at det øverst står «Via Testmiljø Lånbort», og at statusen er «[B] vil låne. Venter på svaret ditt».
8. Trykk knappen som begynner med «Godkjenn lån», og deretter knappen med samme tekst i vinduet som åpnes.
9. Se at du kommer til lånet, at det øverst står «Via Testmiljø Lånbort», og at Konto B står som «Låntaker».
10. Logg inn som Konto B, trykk «Lån» og åpne «Lånetest stige fra [A]». Se at det øverst står «Via Testmiljø Lånbort», og at Konto A står som «Ansvarlig utlåner».

**Testen er bestått når**

- Oppsummeringen før sending viste «Via Testmiljø Lånbort» og Konto A under «Fra», og ingen ansvarserklæring.
- Forespørselen kom fram til Konto A og var merket «Via Testmiljø Lånbort».
- Etter godkjenning viser lånet fortsatt «Via Testmiljø Lånbort» hos begge.
- Konto A står som «Ansvarlig utlåner» hos Konto B, og Konto B som «Låntaker» hos Konto A.

### L03 – Fyll ut en låneforespørsel og sjekk at oppsummeringen viser hva du ber om før du sender

**Prioritet:** O · **Fase:** 1

**Forventet resultat:** Før forespørselen sendes viser appen en tydelig oppsummering av tingen, eieren, perioden, vilkårene og hvor forespørselen gjelder. Det står klart at ingenting er avtalt før eieren godkjenner.

**Før du starter**

- Konto A og Konto B er venner. Konto A eier «Testdrill», synlig for venner.
- Konto A har skrevet vilkåret «Rengjør boret før retur.» i feltet «Vilkår for lånet (valgfritt)» på «Testdrill» («Rediger tingen» → «Videre» → «Når og vilkår» → «Videre» → «Lagre endringene»).
- Konto B har ingen åpen forespørsel på «Testdrill». Er forespørselen fra L01 fortsatt åpen, trekker Konto B den først («Lån» → forespørselen → «Flere valg» → «Trekk forespørselen»).
- I tekstene under står [A] og [B] for navnene til Konto A og Konto B slik de vises i appen.

**Slik gjør du det**

1. Logg inn som Konto B. Gå til «Testdrill» (Konto → Venner → [A] → «Testdrill») og trykk «Be om å låne».
2. Se at overskriften er «Når vil du låne Testdrill?», og at det under står når tingen er ledig.
3. Variant 1, bestemte datoer: Velg «Velg dag» og en dag om tre dager i «Første dag». Velg «Dato» og en dag to dager senere i «Siste dag». Se at det under feltene står «Valgt: Fra … til …» med de datoene du valgte.
4. Trykk «Videre». Se at siden heter «Se over og send», og at den viser «Ting: Testdrill», «Fra» med navnet til Konto A, «Periode» med datoene dine, «Vilkår: Rengjør boret før retur.» og «Kontekst: Direkte mellom venner».
5. Skriv «Hei, jeg trenger den til en hylle.» i feltet «Melding til [A] (valgfri)». Les hjelpeteksten under feltet og se at den sier at meldingen ikke er ende-til-ende-kryptert.
6. Se at det står «Ingenting er avtalt ennå.» og at lånet blir avtalt når eieren godkjenner.
7. Trykk «Periode» øverst for å gå tilbake. Se at datoene du valgte fortsatt står der. Trykk «Videre» igjen og se at meldingen din fortsatt står i feltet.
8. Se at sendeknappen nevner datoene, for eksempel «Send forespørsel 23.–25. oktober».
9. Variant 2, så snart som mulig: Trykk «Periode», velg «Så snart som mulig» og under «Slutt» velg «Varighet» og skriv 2 i «Antall dager». Trykk «Videre». Se at «Periode» nå er «Så snart som mulig i 2 dager», og at knappen heter «Send forespørselen».
10. Gå tilbake til variant 1 (bestemte datoer), kryss av for ansvarserklæringen og send. Se at meldingen står under «Din melding» på forespørselen, og at «Vilkår» er «Rengjør boret før retur.»

**Testen er bestått når**

- Oppsummeringen viste tingen, eieren, perioden, vilkåret «Rengjør boret før retur.» og «Direkte mellom venner» før sending.
- Siden sa tydelig «Ingenting er avtalt ennå.» før sending.
- Datoer og melding ble beholdt da du gikk tilbake til «Periode» og fram igjen.
- Perioden ble vist riktig både med bestemte datoer og med «Så snart som mulig i 2 dager».
- Den sendte forespørselen viser samme periode, melding og vilkår som oppsummeringen.

### L04 – Godkjenn en forespørsel og sjekk at det blir ett lån, også om du godkjenner to ganger

**Prioritet:** B · **Fase:** 1

**Forventet resultat:** Når eieren godkjenner, blir det ett avtalt lån og tingen holdes av for perioden. Godkjenner eieren én gang til fra en gammel side, blir det ikke et nytt lån.

**Før du starter**

- Bruk en forespørsel som venter på svar fra Konto A, for eksempel den fra L02 eller L03 (Konto B har sendt den, og for et vennelån har begge godtatt ansvarserklæringen).
- Konto A er innlogget på to faner eller enheter samtidig. Bruk to enheter (for eksempel mobil og PC), eller én vanlig og én privat nettleserfane, så Konto A og Konto B kan være innlogget samtidig.
- I tekstene under står [A] og [B] for navnene til Konto A og Konto B slik de vises i appen.

**Slik gjør du det**

1. Logg inn som Konto A. Åpne forespørselen i «Lån» under «Venter på deg» i fane 1.
2. Åpne samme forespørsel i fane 2 også, og la den stå uten å oppdatere.
3. I fane 1: les teksten «Godkjenner du, avtaler dere …» i statuskortet. Trykk knappen som begynner med «Godkjenn lån».
4. I vinduet «Godkjenn lånet av [tingen]?»: se at det under «Dette består» står at [B] låner tingen i perioden og at perioden holdes av, og hvilke vilkår som gjelder. Trykk knappen som begynner med «Godkjenn lån».
5. Se at du kommer til lånets side, at trinnlinjen står på «Reservert», og at statusen sier at tingen er reservert for [B].
6. Gå til fane 2 (den gamle siden). Trykk «Godkjenn lån …» og bekreft i vinduet.
7. Se at du havner på det samme lånet som i fane 1 (samme ting, samme periode), og ikke på et nytt lån.
8. Trykk «Lån» i hovedmenyen. Se at det står bare ett lån for denne tingen og [B].
9. Gå til tingen under «Mine ting». Under «Lån og forespørsler», se at det står ett lån med [B] og perioden, og ingen forespørsel fra [B] som venter.
10. Logg inn som Konto B. Se under «Varsler» at det har kommet «Lånet av [tingen] er godkjent». Åpne forespørselen og se «Godkjent. Lånet er avtalt» og knappen «Gå til lånet».

**Testen er bestått når**

- Godkjenningen førte til lånets side med trinnet «Reservert».
- Den andre godkjenningen fra den gamle siden laget ikke et nytt lån, men viste det samme lånet.
- «Lån» og tingens «Lån og forespørsler» viser nøyaktig ett lån for denne forespørselen.
- Konto B fikk varselet «Lånet av [tingen] er godkjent» og ser «Godkjent. Lånet er avtalt».

### L05 – Avslå en forespørsel som eier, og trekk en forespørsel som låntaker

**Prioritet:** O · **Fase:** 3

**Forventet resultat:** Begge ser at forespørselen er avsluttet og hvorfor, med nøytrale ord. Låntakeren får varsel når eieren avslår; når låntakeren trekker forespørselen, viser eierens varsel at den ikke gjelder lenger.

**Før du starter**

- Konto A eier en ting Konto B kan låne, for eksempel «Lånetest stige» i «Testmiljø Lånbort».
- Konto B sender to forespørsler på tingen, for to ulike perioder som ikke overlapper (for eksempel om 10 dager og om 20 dager). Kall dem «forespørsel 1» og «forespørsel 2».
- Bruk to enheter (for eksempel mobil og PC), eller én vanlig og én privat nettleserfane, så Konto A og Konto B kan være innlogget samtidig.
- I tekstene under står [A] og [B] for navnene til Konto A og Konto B slik de vises i appen.

**Slik gjør du det**

1. Avslå: Logg inn som Konto A. Gå til «Lån» og åpne forespørsel 1 under «Venter på deg».
2. Trykk «Avslå». I vinduet «Avslå forespørselen fra [B]?», trykk «Avslå forespørselen».
3. Se at statusen nå er «Avsluttet» med teksten «Forespørselen ble avslått», og at det ikke lenger finnes knapper for å godkjenne.
4. Logg inn som Konto B. Trykk «Varsler» og se varselet «Forespørselen om å låne Lånetest stige er avslått». Trykk på det.
5. Se at forespørselen viser «Avsluttet» og «Eieren sa nei denne gangen», uten noen begrunnelse.
6. Trekk: Fortsatt som Konto B, gå til «Lån» og åpne forespørsel 2 under «Venter på andre».
7. Trykk «Flere valg» og deretter «Trekk forespørselen». I vinduet «Trekk forespørselen om å låne Lånetest stige?», trykk «Trekk forespørselen».
8. Se at statusen er «Avsluttet» med teksten «Du trakk forespørselen».
9. Logg inn som Konto A. Trykk «Varsler» og finn varselet «[B] vil låne Lånetest stige» for forespørsel 2. Se at det nå står «Forespørselen gjelder ikke lenger.» under det.
10. Trykk på varselet og se at forespørselen viser «Avsluttet» med teksten «Låntakeren trakk forespørselen».
11. Trykk «Lån» som begge kontoer, og se at ingen av de to forespørslene står der lenger.

**Testen er bestått når**

- Etter avslag ser Konto A «Forespørselen ble avslått» og Konto B «Eieren sa nei denne gangen».
- Konto B fikk varselet «Forespørselen om å låne Lånetest stige er avslått».
- Etter tilbaketrekking ser Konto B «Du trakk forespørselen» og Konto A «Låntakeren trakk forespørselen».
- Konto As varsel om forespørsel 2 viser «Forespørselen gjelder ikke lenger.»
- Ingen av forespørslene står lenger i «Lån», og ingen av dem kan godkjennes.

### L06 – Send to forespørsler på samme dager og sjekk at én godkjenning stenger den andre

**Prioritet:** B · **Fase:** 1

**Forventet resultat:** Når eieren godkjenner én forespørsel, avsluttes andre forespørsler som gjelder de samme dagene, og ingen kan få låne tingen de dagene. Forespørsler for andre dager består.

**Før du starter**

- Konto A eier «Lånetest stige», publisert i «Testmiljø Lånbort».
- Konto B og en ekstra testkonto, Konto D, er begge medlemmer i «Testmiljø Lånbort».
- Tingen har ingen lån eller åpne forespørsler de neste tre ukene.
- Bruk tre enheter eller nettleserfaner (Konto A, Konto B og Konto D). I tekstene under står [A] og [B] for navnene til Konto A og Konto B slik de vises i appen. [D] er navnet til Konto D.

**Slik gjør du det**

1. Logg inn som Konto B. Be om å låne «Lånetest stige» (Hjem → «Testmiljø Lånbort» → tingen → «Be om å låne») fra om 5 dager til om 7 dager. Send forespørselen.
2. Logg inn som Konto D. Be om å låne samme ting fra om 6 dager til om 8 dager (overlapper med B). Send.
3. Fortsatt som Konto D: send en forespørsel til, fra om 15 dager til om 16 dager (overlapper ikke).
4. Logg inn som Konto A. Gå til «Lån» og åpne forespørselen fra [B].
5. Se at det i statuskortet står «Godkjenner du, avtaler dere …» og «Da avsluttes 1 annen forespørsel om samme tid.»
6. Trykk «Godkjenn lån …». Se at vinduet under «Dette forsvinner» sier «1 annen forespørsel om samme tid avsluttes». Trykk «Godkjenn lån …» i vinduet.
7. Logg inn som Konto D. Trykk «Varsler» og se «Forespørselen om å låne Lånetest stige er avsluttet». Åpne den og se «Avsluttet» og «Forespørselen gjelder ikke lenger, fordi tiden ble avtalt med et annet lån».
8. Fortsatt som Konto D: trykk «Lån» og se at forespørselen for om 15–16 dager fortsatt står der med «Venter på svar fra eieren».
9. Som Konto D: åpne «Lånetest stige» og trykk «Be om å låne». Prøv å be om om 6 dager til om 7 dager og trykk «Send forespørsel …».
10. Se at forespørselen ikke sendes, og at det står «Tingen er ikke ledig i hele tiden du ba om, eller vilkårene er endret. Siden viser nå det som gjelder. Se over og send igjen om det fortsatt passer.»
11. Rydd opp: Konto D trekker forespørselen for om 15–16 dager («Flere valg» → «Trekk forespørselen»).

**Testen er bestått når**

- Konto A ble vist at én annen forespørsel ville avsluttes, før godkjenningen.
- Etter godkjenningen var Konto Ds overlappende forespørsel avsluttet med teksten «Forespørselen gjelder ikke lenger, fordi tiden ble avtalt med et annet lån», og D fikk varsel.
- Konto Ds forespørsel for andre dager (om 15–16 dager) var fortsatt åpen.
- En ny forespørsel på dager som var avtalt med B ble stoppet med feilmeldingen om at tingen ikke er ledig.

### L07 – Endre vilkårene på en ting mens en forespørsel venter, og sjekk at låntakeren må godta dem

**Prioritet:** O · **Fase:** 3

**Forventet resultat:** Når eieren endrer vilkårene mens en forespørsel venter, kan den ikke godkjennes før låntakeren har bekreftet de nye vilkårene. Låntakeren får varsel om endringen.

**Før du starter**

- Konto A eier «Lånetest stige» i «Testmiljø Lånbort» med vilkåret «Tørk av stigen før retur.»
- Konto B har sendt en forespørsel på tingen som venter på svar (for eksempel om 10 til 11 dager).
- Bruk to enheter (for eksempel mobil og PC), eller én vanlig og én privat nettleserfane, så Konto A og Konto B kan være innlogget samtidig.
- I tekstene under står [A] og [B] for navnene til Konto A og Konto B slik de vises i appen.

**Slik gjør du det**

1. Logg inn som Konto A. Gå til «Mine ting» og åpne «Lånetest stige». Trykk «Rediger tingen».
2. Trykk «Videre» til du er på steget «Når og vilkår». Endre «Vilkår for lånet (valgfritt)» til «Tørk av stigen før retur. Maks 120 kg.»
3. Se at det under feltet dukker opp teksten «Når du endrer vilkårene, må de som har sendt en forespørsel som venter på svar, godta de nye vilkårene før forespørselen kan godkjennes.»
4. Trykk «Videre» og deretter «Lagre endringene».
5. Fortsatt som Konto A: gå til «Lån» og åpne forespørselen fra [B]. Se at statusen er «Venter på at [B] bekrefter de nye vilkårene», og at det ikke finnes noen knapp som begynner med «Godkjenn lån».
6. Logg inn som Konto B. Trykk «Varsler» og se «Vilkårene for Lånetest stige er endret og venter på deg». Trykk på det.
7. Se at statusen er «Vilkårene er endret. Bekreft de nye vilkårene før eieren kan svare», og at det står en boks «Nye vilkår» med «Tørk av stigen før retur. Maks 120 kg.»
8. Trykk «Bekreft de nye vilkårene». Se at boksen «Nye vilkår» forsvinner, at «Vilkår» nå viser den nye teksten, og at statusen er «Venter på svar fra eieren».
9. Logg inn som Konto A. Åpne forespørselen igjen (last siden på nytt). Se at knappen «Godkjenn lån …» nå finnes, og at vilkåret i godkjenningsvinduet er den nye teksten. Avslå eller godkjenn etter behov for videre tester.

**Testen er bestått når**

- Etter at vilkårene ble endret, kunne ikke Konto A godkjenne forespørselen (ingen «Godkjenn lån»-knapp).
- Konto B fikk varselet «Vilkårene for Lånetest stige er endret og venter på deg» og så de nye vilkårene på forespørselen.
- Først etter at Konto B trykket «Bekreft de nye vilkårene» kunne Konto A godkjenne.
- Godkjenningen gjelder de nye vilkårene, ikke de gamle.

### L08 – Se på «Lån» fra begge kontoene før og etter at eieren godkjenner

**Prioritet:** B · **Fase:** 1

**Forventet resultat:** Begge ser hvor langt forespørselen eller lånet har kommet, hvem den andre parten er, og hva som er neste steg, både før og etter godkjenning.

**Før du starter**

- Konto A eier «Lånetest stige» i «Testmiljø Lånbort», og Konto B er medlem der.
- Konto B har sendt en forespørsel med første dag om 3 dager, som ikke er besvart ennå.
- Bruk to enheter (for eksempel mobil og PC), eller én vanlig og én privat nettleserfane, så Konto A og Konto B kan være innlogget samtidig.
- I tekstene under står [A] og [B] for navnene til Konto A og Konto B slik de vises i appen.

**Slik gjør du det**

1. Før godkjenning, Konto B: trykk «Lån». Se at «Lånetest stige» står under «Venter på andre» med «Venter på svar fra eieren».
2. Konto B: åpne den. Se at trinnlinjen står på «Forespurt», at statusen er «Venter på eieren» og at det står «Du får varsel når eieren svarer. Ingenting er avtalt før eieren godkjenner.»
3. Før godkjenning, Konto A: trykk «Lån». Se at «Lånetest stige til [B]» står under «Venter på deg» med «[B] vil låne. Venter på svaret ditt».
4. Konto A: åpne den. Se at trinnlinjen står på «Forespurt», at [B] står som «Låntaker», og at knappene «Godkjenn lån …» og «Avslå» finnes.
5. Prøv filteret øverst i «Lån» som Konto A: under «Låner bort» står forespørselen, under «Låner» står den ikke.
6. Konto A: godkjenn forespørselen («Godkjenn lån …» og bekreft i vinduet).
7. Etter godkjenning, Konto A: trykk «Lån». Se at det nå står «Lånetest stige til [B]» under «Pågår og kommende» med «Lånetest stige er reservert for [B]». Åpne det og se trinnet «Reservert», [B] som «Låntaker», og teksten «[B] henter Lånetest stige [dag]. Hvor og når på dagen avtaler dere selv.»
8. Etter godkjenning, Konto B: trykk «Lån». Se at det står «Lånetest stige fra [A]» under «Pågår og kommende» med «Lånetest stige er reservert for deg». Åpne det og se trinnet «Reservert», [A] som «Ansvarlig utlåner», og teksten «Du henter Lånetest stige [dag]. …»
9. Konto B: se at «Lånetest stige fra [A]» står under filteret «Låner», og ikke under «Låner bort».

**Testen er bestått når**

- Før godkjenning: B ser «Venter på svar fra eieren» under «Venter på andre», og A ser «[B] vil låne. Venter på svaret ditt» under «Venter på deg».
- Etter godkjenning: begge ser lånet under «Pågår og kommende» med trinnet «Reservert».
- Hver konto ser den andre parten med riktig rolle: A ser [B] som «Låntaker», B ser [A] som «Ansvarlig utlåner».
- Neste steg er beskrevet med dagen for henting, og filtrene «Låner» og «Låner bort» plasserer lånet riktig for hver konto.

### L09 – Registrer at tingen er overlevert, og sjekk at lånet går fra reservert til utlånt

**Prioritet:** B · **Fase:** 1

**Forventet resultat:** På overleveringsdagen kan utlåner eller låntaker bekrefte at tingen er overlevert. Det holder at én av dem gjør det, og da blir lånet utlånt. Før overleveringsdagen kan dette ikke registreres.

**Før du starter**

- Et godkjent lån mellom Konto A (utlåner) og Konto B (låntaker) med første dag i dag. Lag det ved at B ber om lån fra i dag og A godkjenner.
- Et annet godkjent lån med første dag om noen dager (for eksempel fra L08), for å sjekke at det ikke kan overleveres for tidlig.
- Bruk to enheter (for eksempel mobil og PC), eller én vanlig og én privat nettleserfane, så Konto A og Konto B kan være innlogget samtidig.
- I tekstene under står [A] og [B] for navnene til Konto A og Konto B slik de vises i appen.

**Slik gjør du det**

1. Konto B: åpne lånet som starter om noen dager. Se at statusen er «Avtalt», og at det ikke finnes noen knapp «Jeg har fått …».
2. Konto B: åpne lånet som starter i dag. Se at det står «I dag» og «I dag henter du [tingen]», og teksten om at det holder at én av dere bekrefter.
3. Konto A: åpne samme lån. Se «I dag gir du [tingen] til [B]» og knappen «[B] har fått [tingen]».
4. Konto A: trykk «[B] har fått [tingen]».
5. Konto A: se at trinnlinjen nå står på «Utlånt», og at statusen er «Hos [B]» med «[Tingen] er hos [B] til [siste dag]».
6. Konto B: trykk «Varsler» og se «[A] sier at [tingen] er overlevert».
7. Konto B: åpne lånet (last siden på nytt). Se «Hos deg», «[Tingen] er hos deg til [siste dag]», trinnet «Utlånt», og knappen «Meld returnert». Se at B ikke måtte bekrefte noe selv.
8. Åpne «Tidslinje» nederst på lånet og se «[A] sa at [tingen] ble overlevert» og «[tingen] ble lånt ut».

**Testen er bestått når**

- Lånet med første dag fram i tid hadde ingen knapp for å registrere overlevering.
- Etter at Konto A trykket «[B] har fått [tingen]», står lånet på «Utlånt» for begge.
- Konto B fikk varselet «[A] sier at [tingen] er overlevert» og trengte ikke bekrefte noe selv.
- Tidslinjen viser hvem som registrerte overleveringen.

### L10 – Foreslå ny periode eller lengre lån, og sjekk at endringen bare gjelder når begge er enige

**Prioritet:** O · **Fase:** 3

**Forventet resultat:** En endring i lånet gjelder først når den andre parten godtar. Sier den andre nei, gjelder avtalen som før. En endring som krasjer med et annet lån, kan ikke sendes.

**Før du starter**

- Lån 1: et godkjent, ikke overlevert lån mellom Konto A og Konto B som starter om minst 3 dager.
- Lån 2: et utlånt lån (overlevert, se L09) mellom Konto A og Konto B på en annen ting.
- For Lån 2: et annet godkjent lån på samme ting som starter kort tid etter at Lån 2 slutter (for eksempel en ekstra forespørsel som A godkjenner), slik at en forlengelse vil krasje.
- Bruk to enheter (for eksempel mobil og PC), eller én vanlig og én privat nettleserfane, så Konto A og Konto B kan være innlogget samtidig.
- I tekstene under står [A] og [B] for navnene til Konto A og Konto B slik de vises i appen.

**Slik gjør du det**

1. Godta, Lån 1: Konto A åpner lånet, trykker «Flere valg» og «Foreslå ny periode».
2. Konto A: flytt «Overlevering» én dag senere. Se at «Leveres tilbake» flytter seg like mye. Trykk «Send forslaget».
3. Konto A: se at statusen er «Du har foreslått ny periode: …» og at det står at ingenting endres før [B] godtar. «Periode» under avtalen er fortsatt den gamle.
4. Konto B: se varselet «Det er foreslått en endring i lånet av [tingen]». Åpne lånet og se «[A] foreslår ny periode: …» og knappene «Godta ny periode …» og «Behold …».
5. Konto B: trykk «Godta ny periode …». Se at «Periode» under avtalen nå er den nye perioden hos både A og B.
6. Avslå, Lån 2: Konto B åpner lånet, trykker «Flere valg» og «Foreslå ny returdag». Velg en dag to dager etter dagens siste dag i «Leveres tilbake» (men før det andre lånet starter). Trykk «Send forslaget».
7. Konto A: åpne Lån 2. Se «[B] foreslår ny returdag: …». Trykk «Behold …».
8. Se at «Periode» er uendret hos både A og B, og at B fikk varselet «Den foreslåtte endringen i lånet av [tingen] er avslått».
9. Krasj, Lån 2: Konto B foreslår igjen ny returdag («Flere valg» → «Foreslå ny returdag»), nå en dag som er inne i det andre lånets periode. Trykk «Send forslaget».
10. Se at forslaget ikke sendes, og at det står «Tingen er ikke ledig hele den perioden, eller lånet har endret seg. Siden viser nå det som gjelder.»
11. Åpne «Tidslinje» på begge lånene og se at forslagene, godtakelsen og avslaget står der.

**Testen er bestått når**

- Lån 1 fikk ny periode først etter at Konto B trykket «Godta ny periode …».
- Lån 2 beholdt sin periode da Konto A trykket «Behold …».
- Et forslag som krasjet med det andre lånet ble avvist med meldingen om at tingen ikke er ledig, og ingenting ble endret.
- Ingen endring ble lagret uten at den andre parten hadde godtatt den.

### L11 – Kanseller et godkjent lån før overleveringen, både som utlåner og som låntaker

**Prioritet:** U · **Fase:** 4

**Forventet resultat:** Både utlåner og låntaker kan kansellere et avtalt lån før tingen er overlevert, uten å oppgi grunn. Den andre får varsel, og dagene blir ledige igjen.

**Før du starter**

- Bruk egne testkontoer og en egen testting, for eksempel «Kanselleringstest hammer», publisert i «Testmiljø Lånbort». Hendelsene er fiktive.
- To godkjente lån mellom Konto A (utlåner) og Konto B (låntaker) på tingen, i to ulike perioder fram i tid (for eksempel om 5–6 dager og om 10–11 dager). Ingen av dem er overlevert.
- Bruk to enheter (for eksempel mobil og PC), eller én vanlig og én privat nettleserfane, så Konto A og Konto B kan være innlogget samtidig.
- I tekstene under står [A] og [B] for navnene til Konto A og Konto B slik de vises i appen.

**Slik gjør du det**

1. Utlåner kansellerer: Konto A åpner lånet om 5–6 dager, trykker «Flere valg» og «Kanseller lånet».
2. Se at vinduet «Kansellere lånet?» sier at perioden blir ledig for andre lån, at [B] får varsel, at du ikke trenger oppgi grunn, og at det ikke kan angres. Trykk «Kanseller lånet».
3. Konto A: se merket «Kansellert», overskriften «Du kansellerte lånet» og teksten om at perioden er ledig igjen.
4. Konto B: se varselet «Lånet av [tingen] er kansellert». Åpne lånet og se «[A] kansellerte lånet».
5. Låntaker kansellerer: Konto B åpner lånet om 10–11 dager, trykker «Flere valg» → «Kanseller lånet» og bekrefter med «Kanseller lånet».
6. Konto A: se varselet «Lånet av [tingen] er kansellert», åpne lånet og se «[B] kansellerte lånet».
7. Sjekk at dagene er ledige: Konto B åpner tingen og trykker «Be om å låne». Be om om 5–6 dager og send. Se at forespørselen blir sendt uten feilmelding. Gjør det samme for om 10–11 dager.
8. Rydd opp: Konto B trekker de to nye forespørslene («Flere valg» → «Trekk forespørselen»).

**Testen er bestått når**

- Konto A kunne kansellere sitt lån, og Konto B kunne kansellere sitt, uten å oppgi grunn.
- Begge lånene viser «Kansellert» med hvem som kansellerte, hos begge parter.
- Den andre parten fikk varselet «Lånet av [tingen] er kansellert» begge gangene.
- Nye forespørsler på de kansellerte dagene ble sendt uten feilmelding, altså var dagene ledige igjen.

### L12 – Meld tingen returnert som låntaker, og sjekk at utlåneren blir bedt om å bekrefte

**Prioritet:** O · **Fase:** 3

**Forventet resultat:** Når låntakeren melder tingen returnert, blir lånet ikke avsluttet med en gang. Utlåneren ser at returen venter på hans eller hennes bekreftelse.

**Før du starter**

- Et utlånt lån mellom Konto A (utlåner) og Konto B (låntaker), for eksempel fra L09.
- Bruk to enheter (for eksempel mobil og PC), eller én vanlig og én privat nettleserfane, så Konto A og Konto B kan være innlogget samtidig.
- I tekstene under står [A] og [B] for navnene til Konto A og Konto B slik de vises i appen.

**Slik gjør du det**

1. Konto B: åpne lånet under «Lån». Se «Hos deg» og knappen «Meld returnert».
2. Konto B: trykk «Meld returnert». Se at det står «Du har meldt [tingen] returnert» og «Du kan angre til [klokkeslett]», og knappen «Angre». Ikke trykk «Angre».
3. Vent i minst ett minutt, og last siden på nytt. Se at «Angre» er borte, og at statusen er «Venter på [A]» med «Venter på at [A] bekrefter retur» og «Lånet er avsluttet når [A] har bekreftet mottaket.»
4. Konto A: trykk «Varsler» og se «[B] har meldt [tingen] returnert» (kan ta et par minutter).
5. Konto A: trykk «Lån». Se at lånet står under «Venter på deg» med «[B] har meldt [tingen] returnert».
6. Konto A: åpne lånet. Se trinnet «Retur», teksten «Bekreft når du har fått [tingen] tilbake. Returen er endelig først når du bekrefter.», og knappene «Jeg har fått tilbake [tingen]» og «Jeg har ikke fått tilbake [tingen]». Ikke trykk noe; lånet brukes videre i L13.

**Testen er bestått når**

- Etter «Meld returnert» er lånet ikke avsluttet; Konto B ser «Venter på at [A] bekrefter retur».
- Konto A fikk varselet «[B] har meldt [tingen] returnert».
- Konto A ser lånet under «Venter på deg» med knappen «Jeg har fått tilbake [tingen]».

### L13 – Bekreft at tingen er kommet tilbake, og sjekk at lånet avsluttes med hele historikken

**Prioritet:** B · **Fase:** 1

**Forventet resultat:** Når utlåneren bekrefter at tingen er tilbake, blir lånet avsluttet for begge. Alt som skjedde i lånet står fortsatt i tidslinjen.

**Før du starter**

- Lånet fra L12, der Konto B har meldt tingen returnert og Konto A ikke har bekreftet ennå.
- Bruk to enheter (for eksempel mobil og PC), eller én vanlig og én privat nettleserfane, så Konto A og Konto B kan være innlogget samtidig.
- I tekstene under står [A] og [B] for navnene til Konto A og Konto B slik de vises i appen.

**Slik gjør du det**

1. Konto A: åpne lånet og trykk «Tidslinje». Skriv ned eller ta skjermbilde av hendelsene som står der.
2. Konto A: trykk «Jeg har fått tilbake [tingen]». Se «Retur bekreftet», «Du har bekreftet at du har fått tilbake [tingen]», «Du kan angre til …», og knappene «Angre» og «Avslutt lånet nå».
3. Konto A: vent minst ett minutt og last siden på nytt (eller trykk «Avslutt lånet nå»).
4. Konto A: se merket «Avsluttet», overskriften «Lånet er avsluttet», teksten «Du bekreftet [tidspunkt] at [tingen] er tilbake», og at trinnlinjen står på «Gjennomført».
5. Konto A: åpne «Tidslinje». Se at alle hendelsene fra skjermbildet fortsatt står der uendret, og at det i tillegg står «Du bekreftet å ha fått tilbake [tingen]» og enten «[tingen] er levert tilbake, og lånet er avsluttet» eller «[tingen] kom tilbake før avtalt tid, og resten av perioden ble ledig».
6. Konto B: se varselet «[A] har bekreftet at [tingen] er levert tilbake». Åpne lånet og se «Lånet er avsluttet» og «[A] bekreftet … at [tingen] er tilbake».
7. Begge: trykk «Lån». Se at lånet ikke lenger står i listen, men under «Avsluttede lån» med «Avsluttet».

**Testen er bestått når**

- Lånet er avsluttet hos begge, med trinnet «Gjennomført».
- Tidslinjen inneholder alle tidligere hendelser uendret, pluss bekreftelsen av returen.
- Konto B fikk varselet «[A] har bekreftet at [tingen] er levert tilbake».
- Lånet ligger under «Avsluttede lån» for begge.

### L14 – Angre en returbekreftelse innen 30 sekunder, og se at det ikke går når tiden er ute

**Prioritet:** O · **Fase:** 3

**Forventet resultat:** En returbekreftelse kan angres i 30 sekunder. Etter det står den fast, og et senere problem må meldes som en ny hendelse som ikke sletter den første.

**Før du starter**

- Et utlånt lån mellom Konto A (utlåner) og Konto B (låntaker). Bruk gjerne en egen testting; hendelsene i siste del er fiktive.
- Ha en klokke med sekunder synlig.
- Bruk to enheter (for eksempel mobil og PC), eller én vanlig og én privat nettleserfane, så Konto A og Konto B kan være innlogget samtidig.
- I tekstene under står [A] og [B] for navnene til Konto A og Konto B slik de vises i appen.

**Slik gjør du det**

1. Innen fristen: Konto B åpner lånet og trykker «Meld returnert». Se «Du kan angre til [klokkeslett]» og knappen «Angre».
2. Konto B: trykk «Angre» innen 30 sekunder. Se at lånet er tilbake til «Hos deg» med knappen «Meld returnert».
3. Konto A: se at det ikke har kommet varsel om retur, og at lånet fortsatt viser «Hos [B]».
4. Etter fristen: Konto B trykker «Meld returnert» igjen og venter i minst ett minutt. Last siden på nytt. Se at knappen «Angre» er borte, og at det står «Venter på at [A] bekrefter retur».
5. Konto A: åpne lånet og trykk «Jeg har fått tilbake [tingen]». Se «Angre» og «Avslutt lånet nå». Ikke trykk noe. Vent minst ett minutt og last siden på nytt.
6. Konto A: se at «Angre» er borte og at lånet viser «Lånet er avsluttet».
7. Senere problem (fiktivt): Konto A trykker «Flere valg» og «Jeg har ikke fått tilbake [tingen]».
8. Konto A: se at lånet nå viser «Uenighet» og «Dere har sagt ulike ting om returen», og at det står «Lånbort tar ikke stilling til hvem som har rett.»
9. Konto A: åpne «Tidslinje». Se at «Du bekreftet å ha fått tilbake [tingen]» fortsatt står der, og at det i tillegg står «Du sa at [tingen] ikke er kommet tilbake» og «En bekreftet retur ble motsagt senere, så lånet er åpnet igjen».
10. Rydd opp: Konto A trykker «Jeg har fått tilbake [tingen]» igjen og venter til lånet er avsluttet.

**Testen er bestått når**

- «Angre» innen 30 sekunder satte lånet tilbake til «Hos deg», og Konto A fikk ikke varsel om retur.
- Etter at tiden var ute fantes ingen «Angre»-knapp, verken for B eller A.
- Problemet etter avsluttet lån ble registrert som en ny hendelse, og lånet gikk til «Uenighet».
- Den opprinnelige bekreftelsen «Du bekreftet å ha fått tilbake [tingen]» står fortsatt i tidslinjen.

### L15 – Lever tilbake før tiden og sjekk at resten av perioden blir ledig for andre

**Prioritet:** O · **Fase:** 3

**Forventet resultat:** Når utlåneren bekrefter en tidlig retur, blir resten av perioden ledig igjen. Dager som er sperret av andre grunner, forblir sperret.

**Før du starter**

- Et utlånt lån mellom Konto A og Konto B på «Lånetest stige» i «Testmiljø Lånbort», fra i dag til om 6 dager (overlevert i dag, se L09).
- Konto A har, mens lånet varer, endret når tingen kan lånes: «Mine ting» → «Lånetest stige» → «Rediger tingen» → «Videre» → «Bare i bestemte perioder», «Fra» i dag og «Til (valgfritt)» om 3 dager → «Videre» → «Lagre endringene». Da er dagene om 4–6 dager sperret av eieren.
- Bruk to enheter (for eksempel mobil og PC), eller én vanlig og én privat nettleserfane, så Konto A og Konto B kan være innlogget samtidig.
- I tekstene under står [A] og [B] for navnene til Konto A og Konto B slik de vises i appen.

**Slik gjør du det**

1. Konto B: åpne lånet og trykk «Meld returnert». Vent minst ett minutt.
2. Konto A: åpne lånet (last siden på nytt), trykk «Jeg har fått tilbake Lånetest stige», og deretter «Avslutt lånet nå».
3. Konto A: se «Lånet er avsluttet». Åpne «Tidslinje» og se «Lånetest stige kom tilbake før avtalt tid, og resten av perioden ble ledig».
4. Konto B: trykk «Finn», skriv «Lånetest» i «Hva leter du etter?», trykk «Avgrens søket» og sett «Første dag» til i morgen og «Siste dag» til om 2 dager. Trykk «Søk».
5. Se at «Lånetest stige» kommer opp i resultatet.
6. Konto B: endre søket til «Første dag» om 5 dager og «Siste dag» om 6 dager, og trykk «Søk». Se at «Lånetest stige» ikke kommer opp (dagene er sperret av eieren).
7. Konto B: åpne «Lånetest stige» og trykk «Be om å låne». Be om i morgen til om 2 dager og send. Se at forespørselen sendes uten feilmelding.
8. Rydd opp: Konto B trekker forespørselen, og Konto A setter tingen tilbake til «Når som helst».

**Testen er bestått når**

- Lånet ble avsluttet før avtalt slutt, og tidslinjen sier at resten av perioden ble ledig.
- Tingen ble funnet i søk for dager i den frigjorte resten av perioden, og en ny forespørsel for de dagene gikk gjennom.
- Tingen ble ikke funnet for dager som eieren hadde sperret, selv om de lå i den opprinnelige låneperioden.

### L16 – La overleveringsdagen og returdagen gå uten at noe registreres, og se hva som skjer

**Prioritet:** U · **Fase:** 4

**Forventet resultat:** Når en frist går uten at noe er registrert, ber appen begge parter nøytralt om å avklare hva som skjedde, og sender varsel til begge. Ingen får skylden, og et ubesvart «overleveringen skjedde ikke» avslutter lånet som ikke gjennomført etter 72 timer.

**Før du starter**

- Bruk egne testkontoer og to egne testting, «Fristtest overlevering» og «Fristtest retur». Hendelsene er fiktive.
- Testen tar minst fire dager. Start dag 1 tidlig på dagen.
- Dag 1: Lån X på «Fristtest overlevering» fra i dag til i morgen, godkjent av Konto A, ikke overlevert. Lån Y på «Fristtest retur» bare for i dag, godkjent og registrert som overlevert i dag (se L09).
- Bruk to enheter (for eksempel mobil og PC), eller én vanlig og én privat nettleserfane, så Konto A og Konto B kan være innlogget samtidig.
- I tekstene under står [A] og [B] for navnene til Konto A og Konto B slik de vises i appen.

**Slik gjør du det**

1. Dag 1: Ikke registrer noe mer på lånene. Konto B: se at «Varsler» i løpet av dagen viser «Siste dag for Fristtest retur er i dag».
2. Dag 2, Lån X: begge åpner lånet. Se merket «Avklares», overskriften «Ble Fristtest overlevering overlevert?», teksten «[dag] har passert, og ingen av dere har registrert overleveringen.» og trinnet «Overlevering avklares».
3. Dag 2, Lån X: se at begge har fått varselet «Overleveringsdagen for Fristtest overlevering er passert», at knappene «Overleveringen skjedde ikke», «Jeg har fått …» / «[B] har fått …» og «Foreslå ny overleveringsdag» finnes, og at «Kanseller lånet» ikke finnes under «Flere valg».
4. Dag 2, Lån Y: begge åpner lånet. Konto A ser «Avklares» og «Har du fått Fristtest retur tilbake?»; Konto B ser «Har du levert tilbake Fristtest retur?». Se at lånet ikke står som «Forsinket», og at begge har fått varselet «Siste dag for Fristtest retur er passert uten avklart retur».
5. Dag 2, Lån Y: Konto B trykker «Jeg har fortsatt Fristtest retur». Se at lånet nå viser «Forsinket» for begge, og at Konto A fikk varselet «[B] sier at de fortsatt har Fristtest retur».
6. Dag 2, Lån X: Konto A trykker «Overleveringen skjedde ikke». Konto B: se varselet «[A] sier at overleveringen av Fristtest overlevering ikke skjedde», og på lånet «[A] sier at overleveringen ikke skjedde» med «Svar innen [tidspunkt] på at overleveringen ikke skjedde. Uten svar avsluttes lånet som ikke gjennomført.» Skriv ned tidspunktet. Konto B svarer ikke.
7. Etter tidspunktet (72 timer senere, dag 5): begge åpner Lån X. Se «Ikke gjennomført» og «Lånet ble ikke gjennomført», og at begge har fått varselet «Lånet av Fristtest overlevering er registrert som ikke gjennomført».
8. Les alle statustekstene over og se at ingen av dem sier at noen har skylden, uteble eller gjorde noe galt.
9. Rydd opp: Konto B trykker «Meld returnert» på Lån Y, og Konto A bekrefter mottak.

**Testen er bestått når**

- Etter passert overleveringsdag viste Lån X «Avklares» for begge, og begge fikk varsel om at overleveringsdagen var passert.
- Etter passert returdag viste Lån Y «Avklares» (ikke «Forsinket»), og begge fikk varsel. «Forsinket» kom først da Konto B sa at han eller hun fortsatt hadde tingen.
- Etter at A sa at overleveringen ikke skjedde, ble B vist svarfristen, og når fristen var ute ble Lån X «Ikke gjennomført» med varsel til begge.
- Ingen tekst plasserte skyld på noen av partene.

### L17 – La utlåner og låntaker si ulike ting om overleveringen og om returen

**Prioritet:** U · **Fase:** 4

**Forventet resultat:** Når partene sier ulike ting, viser appen at de er uenige og hva hver av dem sa, uten å si hvem som har rett. Lånet blir ikke feilaktig satt tilbake til reservert eller avsluttet, og tingen blir ikke ledig for andre.

**Før du starter**

- Bruk egne testkontoer og to egne testting i «Testmiljø Lånbort», «Uenighetstest 1» og «Uenighetstest 2». Hendelsene er fiktive.
- Lån 1 på «Uenighetstest 1» fra i dag til om 3 dager, godkjent, ikke overlevert. Lån 2 på «Uenighetstest 2» fra i dag til om 3 dager, godkjent og overlevert i dag (se L09).
- Bruk to enheter (for eksempel mobil og PC), eller én vanlig og én privat nettleserfane, så Konto A og Konto B kan være innlogget samtidig.
- I tekstene under står [A] og [B] for navnene til Konto A og Konto B slik de vises i appen.

**Slik gjør du det**

1. Overlevering, Lån 1: Konto A trykker «[B] har fått Uenighetstest 1». Se at lånet blir «Utlånt».
2. Konto B åpner Lån 1, trykker «Flere valg» og «Overleveringen skjedde ikke».
3. Begge: se merket «Uenighet», overskriften «Dere har sagt ulike ting om overleveringen», én linje om hva hver av dere sa (for eksempel «Du sa at Uenighetstest 1 ble overlevert.» og «[B] sa at overleveringen ikke skjedde.»), og «Lånbort tar ikke stilling til hvem som har rett.»
4. Begge: se at trinnlinjen viser «Uenighet», ikke «Reservert» eller «Gjennomført», og at «Kanseller lånet» ikke finnes.
5. Konto B: åpne «Uenighetstest 1» (Hjem → «Testmiljø Lånbort» → tingen). Se at tingen ikke vises som ledig de neste tre dagene.
6. Se at det under statusen står «Be miljøet om hjelp til å avklare». Ikke bruk den i denne testen.
7. Retur, Lån 2: Konto B trykker «Meld returnert» og venter minst ett minutt.
8. Konto A åpner Lån 2 og trykker «Jeg har ikke fått tilbake Uenighetstest 2».
9. Begge: se «Uenighet», «Dere har sagt ulike ting om returen», hva hver sa, og «Lånbort tar ikke stilling til hvem som har rett.» Se at lånet ikke er avsluttet.
10. Begge: åpne «Tidslinje» på begge lånene og se at begge partenes utsagn står der, og ingen er fjernet.
11. Rydd opp: på Lån 1 trykker Konto B «Jeg har fått Uenighetstest 1»; på Lån 2 trykker Konto A «Jeg har fått tilbake Uenighetstest 2».

**Testen er bestått når**

- Begge lånene viste «Uenighet» med hva hver part sa, og teksten «Lånbort tar ikke stilling til hvem som har rett.»
- Ingen tekst sa hvem som har skylden eller hvem som har rett.
- Lån 1 gikk ikke tilbake til «Reservert» og ble ikke kansellerbart; Lån 2 ble ikke avsluttet.
- Tingen fra Lån 1 ble ikke vist som ledig for perioden mens uenigheten varte.
- Tidslinjen beholdt begge partenes utsagn.

### L18 – Meld en oppdiktet skade på en lånt ting, og la den andre svare

**Prioritet:** U · **Fase:** 4

**Forventet resultat:** Begge partenes forklaringer blir lagret på lånet og vist for begge. Ingen av dem kan endre det den andre skrev, og meldingen hindrer ikke at lånet avsluttes.

**Før du starter**

- Bruk egne testkontoer og en egen testting, for eksempel «Skadetest sykkel». Skaden er oppdiktet.
- Et utlånt lån mellom Konto A (utlåner) og Konto B (låntaker) på tingen (se L09).
- Bruk to enheter (for eksempel mobil og PC), eller én vanlig og én privat nettleserfane, så Konto A og Konto B kan være innlogget samtidig.
- I tekstene under står [A] og [B] for navnene til Konto A og Konto B slik de vises i appen.

**Slik gjør du det**

1. Konto A: åpne lånet, trykk «Flere valg» og «Meld skade, mangel eller tap».
2. Konto A: les punktene som forklarer hva en slik melding er (blant annet at den ikke endrer returen). Skriv «Testskade: ripe på venstre side.» i «Hva er skadet, mangler eller borte?» og trykk «Meld det».
3. Konto A: se en boks «Skade, mangel eller tap» med «Du opplyste» og teksten din, og at det ikke finnes noen knapp for å endre eller slette den.
4. Konto B: se varselet «[A] har meldt skade, mangel eller tap på Skadetest sykkel». Åpne lånet og se «[A] opplyste» med teksten.
5. Konto B: trykk «Jeg er uenig», skriv «Testsvar: ripen var der før lånet.» i «Hva er du uenig i?» og trykk «Send svaret».
6. Begge: se at begge tekstene står i boksen, A sin først og B sin under med «[B] er uenig» (hos B: «Du er uenig»), og at A sin tekst er uendret.
7. Konto B: se at knappene «Jeg er uenig» og «Legg til min forklaring» er borte for denne meldingen. Konto A: se at det ikke finnes noen knapp for å svare på eller endre B sitt svar.
8. Åpne «Tidslinje» og se «[A] meldte skade, mangel eller tap» og «[B] var uenig i meldingen om skade, mangel eller tap».
9. Konto B: trykk «Meld returnert»; Konto A: bekreft med «Jeg har fått tilbake Skadetest sykkel». Se at lånet avsluttes som vanlig, og at boksen «Skade, mangel eller tap» fortsatt står der.

**Testen er bestått når**

- Begge tekstene står på lånet, hver med navnet til den som skrev den.
- Ingen av partene fikk endre eller slette den andres tekst.
- Konto B fikk varsel om meldingen.
- Lånet ble avsluttet på vanlig måte etter retur, og meldingene står fortsatt på lånet.

### L19 – Avslutt vennskapet eller medlemskapet etter at lånet er godkjent, og fullfør lånet likevel

**Prioritet:** U · **Fase:** 4

**Forventet resultat:** Et lån som allerede er avtalt, fortsetter selv om vennskapet eller medlemskapet tar slutt. Begge kan fortsatt registrere overlevering og retur og avslutte lånet.

**Før du starter**

- Bruk egne testkontoer og egne testting. Hendelsene er fiktive.
- Vennskapsvariant: Konto A og Konto B er venner, og et direkte vennelån på «Brudd-test venn» fra i dag til i morgen er godkjent (se L01 og L04).
- Medlemskapsvariant: Konto A og Konto B er medlemmer i «Testmiljø Lånbort» (B er vanlig medlem, ikke administrator), og et lån på «Brudd-test miljø» fra i dag til i morgen er godkjent (se L02).
- Bruk to enheter (for eksempel mobil og PC), eller én vanlig og én privat nettleserfane, så Konto A og Konto B kan være innlogget samtidig.
- I tekstene under står [A] og [B] for navnene til Konto A og Konto B slik de vises i appen.

**Slik gjør du det**

1. Vennskap: Konto B trykker «Konto» → «Venner» → [A] under «Dine venner». Trykk «Flere valg» og «Fjern [A] som venn».
2. Se at vinduet under «Dette består» sier «Lån dere allerede har avtalt, fortsetter som før.» Trykk «Fjern [A] som venn».
3. Konto B: trykk «Lån» og se at lånet «Brudd-test venn fra [A]» fortsatt står der. Åpne det og trykk «Jeg har fått Brudd-test venn».
4. Konto B: trykk «Meld returnert» og vent minst ett minutt. Konto A: åpne lånet i «Lån», trykk «Jeg har fått tilbake Brudd-test venn» og «Avslutt lånet nå». Se «Lånet er avsluttet» hos begge.
5. Medlemskap: Konto B trykker «Hjem» → «Testmiljø Lånbort» → «Mitt medlemskap» → «Forlat miljøet».
6. Se at vinduet under «Dette består» sier «Lån som allerede er avtalt, fortsetter som før.» Trykk «Forlat Testmiljø Lånbort».
7. Konto B: trykk «Lån» og åpne «Brudd-test miljø fra [A]». Se at det fortsatt står «Via Testmiljø Lånbort» eller «Via et miljø». Trykk «Jeg har fått Brudd-test miljø».
8. Konto B: trykk «Meld returnert» og vent minst ett minutt. Konto A: trykk «Jeg har fått tilbake Brudd-test miljø» og «Avslutt lånet nå». Se «Lånet er avsluttet» hos begge.
9. Rydd opp: bli venner igjen og meld Konto B inn i miljøet igjen om kontoene skal brukes videre.

**Testen er bestått når**

- Etter at vennskapet var fjernet, kunne begge fortsatt åpne lånet og registrere overlevering, retur og mottak.
- Etter at Konto B forlot miljøet, kunne begge fortsatt åpne lånet og registrere overlevering, retur og mottak.
- Begge lånene ble avsluttet med «Lånet er avsluttet».
- Bekreftelsesvinduene sa på forhånd at avtalte lån fortsetter som før.

### L20 – Gi ansvaret for et lån til en medeier, og sjekk at det flyttes bare når de rette sier ja

**Prioritet:** U · **Fase:** 4

**Forventet resultat:** Ansvaret for lånet flyttes først når medeieren har sagt ja. Ble medeieren eier etter at lånet ble godkjent, må også låntakeren si ja. Sier noen nei, beholder den opprinnelige utlåneren ansvaret.

**Før du starter**

- Bruk egne testkontoer og en egen testting, «Medeiertest sag», publisert i «Testmiljø Lånbort». Hendelsene er fiktive.
- Konto D er en ekstra testkonto og venn med Konto A. Konto A og Konto B er medlemmer i «Testmiljø Lånbort».
- Variant 1: Konto D er medeier av tingen før lånet godkjennes (A: tingens side → «Inviter en venn som medeier» → velg D → «Inviter som medeier»; D: «Mine ting» → «Bli medeier»). Deretter godkjenner A en forespørsel fra B.
- Variant 2: en ny testting, «Medeiertest sag 2», som bare Konto A eier. Konto B ber om å låne den, og A godkjenner. Først etterpå inviteres D som medeier og sier ja («Bli medeier»).
- Bruk tre enheter eller nettleserfaner (Konto A, B og D). I tekstene under står [A] og [B] for navnene til Konto A og Konto B slik de vises i appen. [D] er navnet til Konto D.

**Slik gjør du det**

1. Variant 1, D sier nei: Konto A åpner lånet, trykker «Flere valg» → «Gi ansvaret til en medeier», velger D under «Medeier» og trykker «Tilby ansvaret».
2. Konto A: se «Venter på medeieren» og «Du har spurt en medeier om å bli ansvarlig utlåner».
3. Konto D: åpne varselet «Du er spurt om å bli ansvarlig utlåner for et lån». Se «[A] spør om du vil bli ansvarlig utlåner» og knappene «Bli ansvarlig utlåner» og «Si nei». Trykk «Si nei».
4. Konto B: åpne lånet og se at [A] fortsatt står som «Ansvarlig utlåner».
5. Variant 1, D sier ja: Konto A tilbyr ansvaret til D på nytt. Konto D trykker «Bli ansvarlig utlåner».
6. Konto B: se varselet «Et lån har fått ny ansvarlig utlåner». Åpne lånet og se at [D] nå står som «Ansvarlig utlåner». Se at B ikke ble spurt.
7. Variant 2, lånet på «Medeiertest sag 2»: Konto A tilbyr ansvaret til D som over. Konto D trykker «Bli ansvarlig utlåner».
8. Konto D: se «Venter på at [B] godtar deg som ansvarlig utlåner». Konto A: se «Venter på at [B] godtar den nye ansvarlige utlåneren». Konto B: se at [A] fortsatt er «Ansvarlig utlåner».
9. Konto B: åpne varselet «Et lån venter på ditt samtykke til ny ansvarlig utlåner». Se «[A] vil gi ansvaret for lånet til en medeier» og knappene «Godta ny ansvarlig utlåner» og «Ikke godta». Trykk «Ikke godta».
10. Se at [A] fortsatt er «Ansvarlig utlåner» hos B. Gjenta tilbudet (A tilbyr, D sier ja), og la Konto B trykke «Godta ny ansvarlig utlåner». Se at [D] nå står som «Ansvarlig utlåner» hos B.
11. Åpne «Tidslinje» på lånene og se hendelsene om hvem som foreslo, godtok eller sa nei, og at periode og vilkår under avtalen er uendret.

**Testen er bestått når**

- Når D sa nei, beholdt A ansvaret.
- I variant 1 ble D ansvarlig utlåner straks D sa ja, uten at B ble spurt, og B fikk varsel.
- I variant 2 ble ansvaret ikke flyttet før B hadde trykket «Godta ny ansvarlig utlåner»; da B sa «Ikke godta», beholdt A ansvaret.
- Periode og vilkår i avtalen var de samme etter byttet.

## K – Varsler, chat og enheter (14)

| ID | Prioritet | Fase | Testhandling | Forventet resultat |
| --- | :---: | :---: | --- | --- |
| K01 | B | 1 | Sjekk at en låneforespørsel og en godkjenning gir ett varsel hver, til riktig person | Den som får en forespørsel eller et svar, får nøyaktig ett varsel om det, og oppgaven står på Hjem. Den som gjorde handlingen, og utenforstående, får ikke noe varsel. |
| K02 | O | 2 | Trykk på varsler på mobil, PC og i e-post og se at de åpner riktig side | Et varsel åpner alltid akkurat det det handler om: riktig lån, forespørsel, ting eller samtale. Det gjelder i appen på mobil og PC og fra lenken i e-posten. |
| K03 | O | 2 | Gjør én oppgave på Hjem og se at bare den forsvinner, mens de andre står igjen | Når du har gjort en oppgave, forsvinner den fra «venter på deg» på Hjem. De andre oppgavene står fortsatt der til du har gjort dem. |
| K04 | O | 2 | Sjekk at tallene på bjella og i hovedmenyen går ned når du har lest det nye | Bjella øverst viser hvor mange uleste varsler du har, og menyknappene viser hvor mye nytt det er der. Tallene går ned eller forsvinner når du har lest det eller åpnet området. |
| K05 | O | 2 | Slå e-post- og chatvarsler av og på, og sjekk at sikkerhetsvarsler kommer uansett | Varslene kommer slik du har valgt: på e-post bare når det er slått på, og chatvarsler bare når de er på. Sikkerhetsvarsler om en ny enhet kommer alltid, i appen og på e-post. |
| K06 | B | 1 | Slå på privat chat og se at det bare går etter at du har krysset av for merknaden | Privat chat slås ikke på før du har lest merknaden og krysset av for at du har forstått den. Velger du «Ikke nå», er chat fortsatt av. |
| K07 | B | 1 | Send en privat melding mellom to inviterte og sjekk at ingen andre kan lese den | Meldingen kommer fram til mottakeren og kan bare leses av de to i samtalen. En utenforstående kan ikke åpne samtalen, og varselet viser ikke hva som står i meldingen. |
| K08 | O | 2 | Demp en samtale og fjern den fra listen, og sjekk at det bare gjelder deg | Når du demper en samtale, får du ikke varsler om nye meldinger fra den, men den andre merker ingen forskjell. Når du fjerner den fra listen, forsvinner den bare hos deg og kommer tilbake hvis noen skriver igjen. |
| K09 | O | 2 | Koble en ny mobil eller PC til privat chat, og sjekk at den må godkjennes først | En ny enhet kan bare lese og skrive i privat chat etter at du har godkjent den fra en enhet som allerede har chat. Feil kode, utløpt kode eller avvisning gir ingen tilgang. |
| K10 | O | 2 | Sjekk at enhetene får et forslag til navn og type, og gi en av dem et eget navn | Hver enhet vises med et navn og et ikon som gjør det lett å skille dem fra hverandre. Du kan selv endre navn og type, og endringen vises likt på alle enhetene dine. |
| K11 | O | 2 | Godkjenn en ny chat-enhet og fjern den igjen, og sjekk varsel og at den stenges ute | Når en ny enhet godkjennes, får du et sikkerhetsvarsel i appen og på e-post. Når du fjerner enheten, blir den logget ut med en gang og kan ikke lese nye meldinger. |
| K12 | U | 4 | Hent tilbake privat chat med gjenopprettingsnøkkel og tilbakestill chat på en testkonto | Med riktig gjenopprettingsnøkkel kommer bare de sikkerhetskopierte meldingene tilbake. Uten nøkkel må chat tilbakestilles, og da sier appen tydelig at gamle meldinger ikke kan leses. Appen later aldri som om noe er hentet tilbake når det ikke er det. |
| K13 | U | 4 | Sjekk at chat ikke viser om en melding er lest, og at administratorer ikke kan lese den | Den som sender en melding, kan ikke se om mottakeren har lest den. En administrator i et miljø kan ikke se eller åpne private samtaler mellom medlemmene. |
| K14 | U | 4 | Blokker motparten under et lån og se at vanlig chat stenges, men lånechat fortsatt går | Når en av partene blokkerer den andre, stenges den vanlige samtalen for begge. De kan fortsatt skrive korte meldinger om overlevering og retur i en egen samtale om lånet, som ingen av dem kan stenge mens lånet pågår. |

### K01 – Sjekk at en låneforespørsel og en godkjenning gir ett varsel hver, til riktig person

**Prioritet:** B · **Fase:** 1

**Forventet resultat:** Den som får en forespørsel eller et svar, får nøyaktig ett varsel om det, og oppgaven står på Hjem. Den som gjorde handlingen, og utenforstående, får ikke noe varsel.

**Før du starter**

- Konto A og Konto B er venner (se A06/A09). Konto C finnes, men har ingen forbindelse til A eller B.
- Konto A har en ting som vises for venner, for eksempel «Testdrill» (se T01 og T05). Ingen ventende forespørsler på den.
- Bruk to enheter: Konto A på mobilen og Konto B på PC-en (eller én vanlig og én privat nettleserfane). Konto C trengs bare kort på slutten.
- Før start: logg inn som A, B og C, åpne «Varsler» (bjella øverst) og trykk «Marker alle som lest» hvis knappen finnes, slik at alle starter uten uleste varsler.

**Slik gjør du det**

1. Konto B (PC): Gå til «Finn», søk etter «Testdrill» og åpne tingen.
2. Konto B: Trykk «Be om å låne», velg en første og siste dag noen dager fram i tid, og trykk «Videre».
3. Konto B: Kryss av for «Jeg godtar ansvarserklæringen for dette lånet» hvis den vises, og trykk «Send forespørsel …» (knappen viser perioden). Se at det står «Forespørselen er sendt».
4. Konto B: Last siden på nytt og se på bjella øverst. Se at B ikke har fått noe nytt varsel om sin egen forespørsel.
5. Konto A (mobil): Vent 1–2 minutter og last siden på nytt. Se at bjella øverst viser tallet 1.
6. Konto A: Åpne «Varsler». Se at det under «Uleste · 1» står nøyaktig én rad: «Konto B vil låne Testdrill» (med B sitt navn), merket «Lån».
7. Konto A: Gå til «Hjem». Se at det under «1 venter på deg» står en oppgave om å svare på forespørselen fra B.
8. Konto A: Last siden på nytt to ganger og åpne «Varsler» igjen. Se at det fortsatt bare er ett varsel om forespørselen, ikke to.
9. Konto A: Åpne varselet. På forespørselen trykker du «Godta ansvarserklæringen» hvis den vises, deretter «Godkjenn lån …» og bekrefter med samme knapp i vinduet som kommer opp.
10. Konto A: Last siden på nytt og se at A ikke har fått noe nytt varsel om sin egen godkjenning.
11. Konto B: Vent 1–2 minutter, last siden på nytt og åpne «Varsler». Se at det står nøyaktig ett nytt varsel: «Lånet av Testdrill er godkjent», merket «Påkrevd».
12. Konto C: Logg inn og åpne «Varsler». Se at C ikke har fått noen varsler om forespørselen eller lånet.

**Testen er bestått når**

- Konto A fikk nøyaktig ett varsel «… vil låne Testdrill», også etter flere omlastinger, og oppgaven stod på Hjem.
- Konto B fikk nøyaktig ett varsel «Lånet av Testdrill er godkjent» med merket «Påkrevd».
- Verken A eller B fikk varsel om noe de selv gjorde.
- Konto C fikk ingen varsler om forespørselen eller lånet.

### K02 – Trykk på varsler på mobil, PC og i e-post og se at de åpner riktig side

**Prioritet:** O · **Fase:** 2

**Forventet resultat:** Et varsel åpner alltid akkurat det det handler om: riktig lån, forespørsel, ting eller samtale. Det gjelder i appen på mobil og PC og fra lenken i e-posten.

**Før du starter**

- Konto A og Konto B er venner, og begge har slått på privat chat (se K06).
- Konto A har tingen «Testdrill», og Konto B har en egen testting, for eksempel «Lånetest stige». Begge vises for venner.
- Konto A har slått på e-post for handlingsvarsler: «Konto» › «Varslingsvalg» › under «Handling» krysser du av «På e-post». Slå det av igjen etter testen.
- Konto A bruker både mobil og PC. Konto B kan bruke en tredje nettleser eller en privat nettleserfane.
- Du kan bruke forespørselen og lånet fra K01 i stedet for å lage nye.

**Slik gjør du det**

1. Konto B: Be om å låne «Testdrill» av A (som i K01).
2. Konto B: Åpne «Lånetest stige», gå ned til «Eiere», velg Konto A under «Inviter en venn som medeier» og trykk «Inviter som medeier».
3. Konto B: Gå til «Samtaler», start eller åpne samtalen med A, skriv «Testmelding K02» og send.
4. Konto A: Ikke åpne «Varsler» ennå. Vent til det har kommet to e-poster til A: «Du har fått en låneforespørsel» og «Du er invitert til å bli medeier av et objekt» (kan ta opptil 5 minutter). En e-post sendes ikke hvis varselet allerede er åpnet i appen.
5. Konto A (PC): Last siden på nytt og åpne «Varsler». Se at det ligger tre uleste varsler: forespørselen, medeier-invitasjonen og «Ny melding fra …».
6. Konto A (PC): Trykk på varselet «… vil låne Testdrill». Se at forespørselen om Testdrill fra B åpnes (siden heter «Forespørsel»).
7. Konto A (mobil): Åpne «Varsler» og trykk på «Du er invitert til å bli medeier av Lånetest stige». Se at «Mine ting» åpnes ved «Invitasjoner til medeierskap» med Lånetest stige.
8. Konto A (mobil): Gå tilbake til «Varsler» og trykk på «Ny melding fra …». Se at samtalen med B åpnes og at «Testmelding K02» vises.
9. Konto A: Godkjenn forespørselen om Testdrill (som i K01). Konto B åpner så «Varsler» og trykker på «Lånet av Testdrill er godkjent». Se at lånet av Testdrill åpnes under «Lån».
10. Konto A (PC, innlogget): Trykk på lenken «Åpne Lånbort for å se hva det gjelder» i e-posten om låneforespørselen. Se at siden «Åpner varselet» vises kort, og deretter forespørselen om Testdrill.
11. Konto A: Åpne lenken i e-posten om medeier-invitasjonen i en privat nettleserfane der du ikke er logget inn. Logg inn med e-postkoden. Se at du etter innloggingen havner i «Mine ting» ved invitasjonen, ikke bare på «Hjem».
12. Rydd opp: Konto A trykker «Avslå» på medeier-invitasjonen og slår av «På e-post» under «Handling» igjen.

**Testen er bestått når**

- Varselet om forespørselen åpnet forespørselen om Testdrill, både fra appen og fra e-postlenken.
- Varselet om medeier-invitasjonen åpnet «Mine ting» ved invitasjonen til Lånetest stige, også via e-postlenken etter innlogging.
- Varselet om ny melding åpnet samtalen med Konto B.
- Varselet om godkjent lån åpnet lånet av Testdrill hos Konto B.
- Ingen varsel åpnet feil side, en tom side eller en side som sier at den ikke finnes.

### K03 – Gjør én oppgave på Hjem og se at bare den forsvinner, mens de andre står igjen

**Prioritet:** O · **Fase:** 2

**Forventet resultat:** Når du har gjort en oppgave, forsvinner den fra «venter på deg» på Hjem. De andre oppgavene står fortsatt der til du har gjort dem.

**Før du starter**

- Konto A og Konto B er venner. Konto A har «Testdrill», og Konto B har «Lånetest stige», begge synlige for venner.
- Ingen andre oppgaver venter på Konto A (Hjem viser «Ingenting venter på deg»), eller du noterer hvilke som står der fra før.
- Konto A på mobilen, Konto B på PC-en.

**Slik gjør du det**

1. Konto B: Be om å låne «Testdrill» av A (som i K01).
2. Konto B: Inviter Konto A som medeier av «Lånetest stige» («Eiere» › «Inviter en venn som medeier» › «Inviter som medeier»).
3. Konto A: Gå til «Hjem» og last siden på nytt. Se at overskriften er «2 venter på deg», og at én oppgave gjelder forespørselen om Testdrill og én gjelder invitasjonen til Lånetest stige. Skriv ned hva som står.
4. Konto A: Trykk på oppgaven om forespørselen. Trykk «Godta ansvarserklæringen» hvis den vises, deretter «Godkjenn lån …», og bekreft.
5. Konto A: Gå tilbake til «Hjem» og last siden på nytt. Se at overskriften nå er «1 venter på deg», at forespørselen er borte derfra, og at invitasjonen til Lånetest stige står der fortsatt.
6. Konto A: Se også at Hjem kan vise lånet av Testdrill under «Kommer». Det er ikke en feil.
7. Konto A: Åpne «Varsler». Se at varselet om forespørselen fortsatt står der, nå med teksten «Forespørselen er godtatt.».
8. Konto A: Trykk på oppgaven om invitasjonen på Hjem. I «Mine ting» under «Invitasjoner til medeierskap» trykker du «Avslå».
9. Konto A: Gå tilbake til «Hjem» og last siden på nytt. Se at invitasjonen er borte, og at «venter på deg» er tom (eller bare viser oppgaver som stod der før testen).

**Testen er bestått når**

- Etter godkjenningen forsvant bare oppgaven om forespørselen; invitasjonen stod fortsatt på Hjem.
- Tallet i overskriften gikk fra «2 venter på deg» til «1 venter på deg».
- Etter at invitasjonen var avslått, forsvant også den oppgaven.
- Ingen oppgave forsvant før den var gjort, og ingen gjort oppgave ble stående.

### K04 – Sjekk at tallene på bjella og i hovedmenyen går ned når du har lest det nye

**Prioritet:** O · **Fase:** 2

**Forventet resultat:** Bjella øverst viser hvor mange uleste varsler du har, og menyknappene viser hvor mye nytt det er der. Tallene går ned eller forsvinner når du har lest det eller åpnet området.

**Før du starter**

- Konto A og Konto B er venner, og begge har slått på privat chat (se K06). Samtalen mellom dem er ikke dempet (se K08).
- Konto A har «Testdrill» synlig for venner, uten ventende forespørsler.
- Konto A logger inn på både mobil og PC. Konto B bruker en tredje nettleser eller en privat fane.
- Før start: Konto A åpner «Varsler» og trykker «Marker alle som lest» hvis knappen finnes, og åpner deretter «Hjem», «Lån», «Mine ting» og «Samtaler» én gang hver.

**Slik gjør du det**

1. Konto A (PC): Se at bjella øverst ikke viser noe tall, og at ingen av «Hjem», «Lån», «Mine ting» og «Samtaler» i hovedmenyen har noe tall.
2. Konto B: Be om å låne «Testdrill» av A (som i K01).
3. Konto B: Gå til «Samtaler», åpne samtalen med A og send «Testmelding K04».
4. Konto A (PC): Vent 1–2 minutter og gå til siden «Finn» (en side som ikke er et av områdene med tall). Se at bjella viser 2, og at «Hjem», «Lån» og «Samtaler» har tallet 1 hver, mens «Mine ting» ikke har noe tall.
5. Konto A (mobil): Last siden på nytt. Se at mobilen viser de samme tallene.
6. Konto A (PC): Åpne «Varsler». Se overskriften «Uleste · 2». Trykk på varselet om forespørselen.
7. Konto A (PC): Gå til «Finn» igjen. Se at bjella nå viser 1, og at tallene på «Hjem» og «Lån» er borte, mens «Samtaler» fortsatt har 1.
8. Konto A (PC): Trykk på «Samtaler» i hovedmenyen. Se at tallet på «Samtaler» forsvinner, men at bjella fortsatt viser 1, fordi meldingen ikke er lest ennå.
9. Konto A (PC): Åpne samtalen med B og bla ned til «Testmelding K04». Gå deretter til «Finn». Se at bjella ikke lenger viser noe tall.
10. Konto A (mobil): Last siden på nytt. Se at mobilen heller ikke viser tall på bjella eller i hovedmenyen.

**Testen er bestått når**

- Etter B sine to handlinger viste bjella 2, og «Hjem», «Lån» og «Samtaler» viste 1 hver, likt på mobil og PC.
- Etter at forespørselen var åpnet, viste bjella 1, og tallene på «Hjem» og «Lån» var borte.
- Tallet på «Samtaler» forsvant da området ble åpnet, og bjella gikk til null først da meldingen var lest.
- Til slutt viste verken mobil eller PC noen tall.

### K05 – Slå e-post- og chatvarsler av og på, og sjekk at sikkerhetsvarsler kommer uansett

**Prioritet:** O · **Fase:** 2

**Forventet resultat:** Varslene kommer slik du har valgt: på e-post bare når det er slått på, og chatvarsler bare når de er på. Sikkerhetsvarsler om en ny enhet kommer alltid, i appen og på e-post.

**Før du starter**

- Konto A og Konto B er venner, og begge har slått på privat chat (se K06).
- Konto A har «Testdrill» synlig for venner, uten ventende forespørsler.
- Konto A har tilgang til sin egen e-post under testen.
- Konto A trenger en ekstra nettleser eller privat fane senere i testen, for å koble til en ny enhet (som i K09).
- Testen tar omtrent 40 minutter, fordi e-post om chatmeldinger først sendes etter 10 minutter.

**Slik gjør du det**

1. Konto A: Trykk «Konto» øverst og velg «Varslingsvalg». Se at «Påkrevd» viser «I appen: alltid på», at «Handling» viser «I appen: alltid på» og et valg «På e-post», og at «Privat chat» har «Nye meldinger i appen» og «Nye meldinger på e-post», samt teksten om at varsler om ny enhet og tilbakestilling ikke kan slås av.
2. Konto A: Kryss av «På e-post» under «Handling». Last siden på nytt og se at krysset står.
3. Konto B: Be om å låne «Testdrill» av A (som i K01). Konto A skal ikke åpne varselet i appen ennå.
4. Konto A: Vent opptil 5 minutter. Se at det kommer en e-post med emnet «Du har fått en låneforespørsel», uten navn eller ting i teksten.
5. Konto A: Trykk «Avslå» på forespørselen og bekreft med «Avslå forespørselen». Fjern så krysset for «På e-post» under «Handling».
6. Konto B: Be om å låne «Testdrill» på nytt. Konto A venter 10 minutter og ser at det ikke kommer noen e-post, men at forespørselen står i «Varsler» i appen. Avslå den etterpå.
7. Konto A: Kryss av «Nye meldinger på e-post» under «Privat chat». Konto B sender «Testmelding K05-1» til A. Konto A åpner ikke samtalen, venter 12 minutter og ser at det kommer en e-post med emnet «Du har en ny melding i Lånbort», uten navn og meldingstekst.
8. Konto A: Fjern krysset for «Nye meldinger på e-post» og fjern også krysset for «Nye meldinger i appen». Åpne samtalen med B én gang, slik at det gamle meldingsvarselet blir lest.
9. Konto B: Send «Testmelding K05-2». Konto A venter 2 minutter, går til en annen side og ser at bjella ikke viser noe nytt varsel om meldingen, men at samtalen med B i «Samtaler» er merket «Ny melding».
10. Konto A: Kryss av «Nye meldinger i appen» igjen. Konto B sender «Testmelding K05-3». Se at A nå får varselet «Ny melding fra …» i «Varsler».
11. Konto A: Koble til en ny enhet (gjør stegene i K09 med en privat nettleserfane). Ikke åpne varselet om enheten i appen før e-posten har kommet.
12. Konto A: Se at det kommer en e-post med emnet «En ny enhet er koblet til privat chat», med teksten om at sikkerhetsvarsler alltid sendes på e-post. Se også at «Varsler» viser «En ny enhet er koblet til privat chat» merket «Påkrevd».
13. Rydd opp: Fjern den nye enheten i «Mine enheter» (se K11).

**Testen er bestått når**

- Med «På e-post» på under «Handling» kom e-post om låneforespørselen; med valget av kom ingen e-post, men varselet stod i appen.
- Med «Nye meldinger på e-post» på kom én e-post uten navn og meldingstekst; med «Nye meldinger i appen» av kom det ikke noe varsel i bjella, men samtalen var merket «Ny melding».
- Valgene stod lagret etter omlasting av siden.
- Varselet og e-posten om ny enhet kom selv om e-post for chatmeldinger var slått av, og varselet var merket «Påkrevd».

### K06 – Slå på privat chat og se at det bare går etter at du har krysset av for merknaden

**Prioritet:** B · **Fase:** 1

**Forventet resultat:** Privat chat slås ikke på før du har lest merknaden og krysset av for at du har forstått den. Velger du «Ikke nå», er chat fortsatt av.

**Før du starter**

- Konto A er en invitert pilotdeltaker som ikke har slått på privat chat ennå. Sjekk det i «Konto»: raden «Mine enheter» skal vise «Privat chat er ikke slått på».
- Bruk én enhet, for eksempel mobilen.

**Slik gjør du det**

1. Konto A: Trykk «Samtaler» i hovedmenyen. Se kortet «Skriv privat med dem du låner av og til», med punktene under «Før du slår på» (blant annet at krypteringen ikke er gjennomgått av uavhengige sikkerhetseksperter, og at du ikke skal skrive sensitive opplysninger).
2. Konto A: Ikke kryss av. Prøv å trykke «Slå på privat chat». Se at ingenting skjer, fordi knappen ikke kan trykkes.
3. Konto A: Trykk lenken «Ikke nå». Se at du havner i «Lån».
4. Konto A: Trykk «Konto» øverst. Se at «Mine enheter» fortsatt viser «Privat chat er ikke slått på».
5. Konto A: Gå til «Samtaler» igjen. Se at det samme kortet vises igjen.
6. Konto A: Kryss av «Jeg har lest og forstått dette» og trykk «Slå på privat chat».
7. Konto A: Se at kortet «Lag en gjenopprettingsnøkkel» kommer. Trykk «Ikke nå» (nøkkelen testes i K12).
8. Konto A: Se at samtalelisten vises med meldingen «På» – «Privat chat er slått på for denne enheten.».
9. Konto A: Trykk «Konto» øverst. Se at «Mine enheter» nå viser «1 enhet kan lese samtalene dine».

**Testen er bestått når**

- «Slå på privat chat» kunne ikke trykkes før det var krysset av for «Jeg har lest og forstått dette».
- Etter «Ikke nå» var chat fortsatt av («Privat chat er ikke slått på» i «Konto»).
- Etter avkrysning og «Slå på privat chat» kom meldingen «Privat chat er slått på for denne enheten.».
- «Mine enheter» viste til slutt «1 enhet kan lese samtalene dine».

### K07 – Send en privat melding mellom to inviterte og sjekk at ingen andre kan lese den

**Prioritet:** B · **Fase:** 1

**Forventet resultat:** Meldingen kommer fram til mottakeren og kan bare leses av de to i samtalen. En utenforstående kan ikke åpne samtalen, og varselet viser ikke hva som står i meldingen.

**Før du starter**

- Konto A og Konto B er venner, og begge har slått på privat chat (se K06). De har ingen samtale fra før, eller du bruker den de har.
- Konto C har slått på privat chat, men har ingen forbindelse til A eller B.
- Konto A på mobilen, Konto B på PC-en, Konto C i en privat nettleserfane.

**Slik gjør du det**

1. Konto A: Gå til «Samtaler». Under «Skriv til en venn» trykker du «Start samtale» ved Konto B. (Har de allerede en samtale, åpner du den fra listen.)
2. Konto A: Skriv «Hei, dette er testmelding K07» i feltet «Skriv en melding» og trykk send-knappen (pilen).
3. Konto A: Se at meldingen står i samtalen med klokkeslett under.
4. Konto B: Vent 1–2 minutter, last siden på nytt og åpne «Varsler». Se at varselet sier «Ny melding fra …» med A sitt navn, men ikke hva som står i meldingen.
5. Konto B: Gå til «Samtaler». Se at samtalen med A er merket «Ny melding». Åpne den og se at «Hei, dette er testmelding K07» vises.
6. Konto B: Svar «Mottatt, svar fra B». Konto A ser svaret i samtalen.
7. Konto A: Kopier adressen i nettleserens adressefelt mens samtalen er åpen, og send den til den som tester Konto C på en annen måte (for eksempel SMS).
8. Konto C: Lim adressen inn i adressefeltet og åpne den. Se at samtalen ikke vises, og at det står «Samtalen eller personen finnes ikke, eller er ikke tilgjengelig.».
9. Konto C: Gå til «Samtaler» og se at det ikke finnes noen samtale med A eller B.

**Testen er bestått når**

- Meldingen fra A og svaret fra B kom fram og kunne leses av begge.
- Varselet til B viste bare avsenderens navn og at det var en ny melding, ikke meldingsteksten.
- Konto C fikk ikke se samtalen, verken via adressen eller i «Samtaler», og så ingen meldingstekst.

### K08 – Demp en samtale og fjern den fra listen, og sjekk at det bare gjelder deg

**Prioritet:** O · **Fase:** 2

**Forventet resultat:** Når du demper en samtale, får du ikke varsler om nye meldinger fra den, men den andre merker ingen forskjell. Når du fjerner den fra listen, forsvinner den bare hos deg og kommer tilbake hvis noen skriver igjen.

**Før du starter**

- Konto A og Konto B har en privat samtale med minst én melding (se K07).
- Konto A på mobilen, Konto B på PC-en.
- Begge har «Nye meldinger i appen» slått på i «Varslingsvalg».

**Slik gjør du det**

1. Konto A: Åpne samtalen med B og trykk på «Om samtalen» (knappen med tre prikker øverst til høyre).
2. Konto A: Trykk «Demp samtalen». Se at knappen nå heter «Slå på varsler igjen», og at teksten sier «Du får ikke varsler om nye meldinger her.».
3. Konto B: Send «Testmelding K08-1» til A.
4. Konto A: Vent 2 minutter og gå til en annen side, for eksempel «Finn». Se at bjella ikke har fått noe nytt varsel om meldingen. Gå til «Samtaler» og se at samtalen likevel er merket «Ny melding», og at meldingen kan leses.
5. Konto A: Send «Svar K08» til B.
6. Konto B: Vent 1–2 minutter og åpne «Varsler». Se at B får varselet «Ny melding fra …» som vanlig, altså at A sin demping ikke påvirker B.
7. Konto A: Gå til «Om samtalen» igjen og trykk «Slå på varsler igjen». Se at knappen igjen heter «Demp samtalen».
8. Konto A: Trykk «Fjern fra mine samtaler». Se at du kommer til «Samtaler», og at samtalen med B ikke står i listen.
9. Konto B: Gå til «Samtaler». Se at samtalen med A fortsatt står der med alle meldingene.
10. Konto B: Send «Testmelding K08-2».
11. Konto A: Vent 1–2 minutter og last «Samtaler» på nytt. Se at samtalen med B er tilbake i listen, med den nye meldingen.

**Testen er bestått når**

- Mens samtalen var dempet, fikk A ikke varsel i bjella om nye meldinger fra B, men meldingen kom fram og samtalen ble merket «Ny melding».
- B fikk varsler som vanlig hele tiden.
- «Fjern fra mine samtaler» fjernet samtalen bare fra A sin liste; B beholdt den med alle meldingene.
- Samtalen kom tilbake hos A da B skrev igjen.

### K09 – Koble en ny mobil eller PC til privat chat, og sjekk at den må godkjennes først

**Prioritet:** O · **Fase:** 2

**Forventet resultat:** En ny enhet kan bare lese og skrive i privat chat etter at du har godkjent den fra en enhet som allerede har chat. Feil kode, utløpt kode eller avvisning gir ingen tilgang.

**Før du starter**

- Konto A har slått på privat chat på mobilen (se K06) og har minst én samtale.
- Konto A trenger en ny enhet: en PC, eller en privat nettleserfane. Hver ny innlogging regnes som en ny enhet.
- Testen tar omtrent 20 minutter, fordi en kode skal få utløpe (koden gjelder i 10 minutter).

**Slik gjør du det**

1. Konto A (PC): Logg inn og trykk «Samtaler». Se kortet «Koble til denne enheten», og at ingen samtaler vises.
2. Konto A (PC): Trykk «Koble til denne enheten». Se siden «Skann koden med en enhet som har privat chat», med en QR-kode, «Venter på godkjenning», «Koden gjelder til kl. …» og en kode å skrive inn.
3. Feil kode: Konto A (mobil) går til «Konto» › «Mine enheter». Se kortet «En enhet vil koble til privat chat». Trykk «Skriv inn koden i stedet» (eller «Skriv inn koden»), skriv en kode som er feil på ett tegn, og trykk «Fortsett». Se «Ingen treff» – «Fant ingen enhet med denne koden …». Trykk «Skann eller skriv på nytt».
4. Utløpt kode: La PC-siden stå åpen uten å godkjenne i mer enn 10 minutter. Se at PC-en viser «Utløpt» og «Koden gjaldt i 10 minutter og ble ikke godkjent i tide.».
5. Avvist: Konto A (PC) trykker «Lag ny kode». På mobilen, i «Mine enheter», trykker du «Avvis» ved den ventende enheten og bekrefter med «Avvis enheten». Se at PC-en viser «Koblingen ble avvist».
6. Godkjent: Konto A (PC) trykker «Lag ny kode». På mobilen trykker du «Skann koden» i «Mine enheter» og holder kameraet mot QR-koden på PC-en (eller skriver inn koden).
7. Konto A (mobil): Se siden «Gi denne enheten tilgang til privat chat?». Velg «Bare nye meldinger» under «Tidligere meldinger» og trykk «Godkjenn enheten». Se «Ny enhet godkjent».
8. Konto A (PC): Se at PC-en går til «Samtaler» av seg selv og viser «Koblet til». Åpne en samtale og send «Testmelding fra PC».
9. Konto A (mobil): Se at «Testmelding fra PC» også vises på mobilen i samme samtale.

**Testen er bestått når**

- PC-en viste ingen samtaler og kunne ikke sende meldinger før den var godkjent.
- Feil kode ga «Ingen treff», utløpt kode ga «Utløpt», og avvisning ga «Koblingen ble avvist», uten at PC-en fikk tilgang.
- Etter «Godkjenn enheten» kunne PC-en lese nye meldinger og sende, og meldingen kom fram på mobilen.

### K10 – Sjekk at enhetene får et forslag til navn og type, og gi en av dem et eget navn

**Prioritet:** O · **Fase:** 2

**Forventet resultat:** Hver enhet vises med et navn og et ikon som gjør det lett å skille dem fra hverandre. Du kan selv endre navn og type, og endringen vises likt på alle enhetene dine.

**Før du starter**

- Konto A har privat chat på minst to enheter av ulik type, for eksempel mobil og PC (se K09).
- Hvis mulig: koble også til en ekstra nettleser på samme PC, for å se hvordan to registreringer på én PC skilles.

**Slik gjør du det**

1. Konto A (PC): Gå til «Konto» › «Mine enheter». Se overskriften «Disse kan lese samtalene dine».
2. Konto A: Se at enheten du sitter på, står øverst og er merket «Denne enheten».
3. Konto A: Se at hver enhet har et navn som passer, for eksempel «iPhone · Safari» eller «Windows-PC · Edge», et ikon for mobil, nettbrett eller PC, og en linje med system og nettleser og «Lagt til …».
4. Konto A: Har du to enheter med samme navn, se at de skilles med noen tegn i parentes etter navnet.
5. Konto A: Trykk «Endre» ved mobilen. I vinduet «Endre enheten» skriver du «Testmobil K10» i feltet «Navn», velger «Nettbrett» under «Type» og trykker «Lagre».
6. Konto A: Se at mobilen nå heter «Testmobil K10» og har nettbrett-ikonet.
7. Konto A (mobil): Åpne «Konto» › «Mine enheter» og se at mobilen også her heter «Testmobil K10» med nettbrett-ikonet.
8. Konto A: Trykk «Endre» ved den samme enheten, tøm feltet «Navn», velg «Mobil» under «Type» og trykk «Lagre». Se at navnet går tilbake til forslaget (for eksempel «iPhone · Safari») og at mobil-ikonet kommer tilbake.

**Testen er bestått når**

- Hver enhet hadde et forståelig navn, et ikon for typen og merket «Denne enheten» på den du brukte.
- Ingen to enheter i listen hadde nøyaktig samme navn.
- Navnet «Testmobil K10» og den nye typen ble vist likt på både PC og mobil.
- Med tomt navn gikk enheten tilbake til det foreslåtte navnet.

### K11 – Godkjenn en ny chat-enhet og fjern den igjen, og sjekk varsel og at den stenges ute

**Prioritet:** O · **Fase:** 2

**Forventet resultat:** Når en ny enhet godkjennes, får du et sikkerhetsvarsel i appen og på e-post. Når du fjerner enheten, blir den logget ut med en gang og kan ikke lese nye meldinger.

**Før du starter**

- Konto A har privat chat på mobilen (se K06) og en samtale med Konto B (se K07).
- Konto A trenger en ekstra enhet: en PC eller en privat nettleserfane.
- Konto A har tilgang til sin egen e-post under testen.

**Slik gjør du det**

1. Konto A: Koble til PC-en som ny enhet og godkjenn den fra mobilen, som i K09.
2. Konto A: Ikke åpne varselet i appen ennå. Vent opptil 5 minutter og se at det kommer en e-post med emnet «En ny enhet er koblet til privat chat» og teksten om at sikkerhetsvarsler om kontoen alltid sendes på e-post.
3. Konto A (mobil): Åpne «Varsler». Se varselet «En ny enhet er koblet til privat chat», merket «Påkrevd», med teksten «Var det ikke deg, fjern den i Mine enheter.». Trykk på det og se at «Mine enheter» åpnes.
4. Konto A (mobil): I «Mine enheter» trykker du «Fjern» ved PC-en. Les punktene i vinduet («Enheten stenges ute med en gang og logges ut.» med flere) og trykk «Fjern enheten».
5. Konto A (mobil): Se meldingen «Fjernet» – «… er logget ut og kan ikke lese nye meldinger.», og at PC-en ikke lenger står i listen.
6. Konto A (PC): Last siden på nytt. Se at PC-en er logget ut av Lånbort.
7. Konto B: Send «Testmelding K11» til A.
8. Konto A (mobil): Se at «Testmelding K11» kommer fram på mobilen.
9. Konto A (PC): Logg inn igjen og gå til «Samtaler». Se at PC-en viser «Koble til denne enheten», ikke samtalene, og at «Testmelding K11» ikke kan leses der uten ny godkjenning.

**Testen er bestått når**

- Etter godkjenningen kom varselet «En ny enhet er koblet til privat chat» merket «Påkrevd» i appen, og en e-post med samme emne.
- Etter «Fjern enheten» ble PC-en logget ut og forsvant fra «Mine enheter».
- Meldingen som ble sendt etter fjerningen, kom fram på mobilen, men kunne ikke leses på PC-en.
- PC-en måtte godkjennes på nytt for å få tilgang igjen.

### K12 – Hent tilbake privat chat med gjenopprettingsnøkkel og tilbakestill chat på en testkonto

**Prioritet:** U · **Fase:** 4

**Forventet resultat:** Med riktig gjenopprettingsnøkkel kommer bare de sikkerhetskopierte meldingene tilbake. Uten nøkkel må chat tilbakestilles, og da sier appen tydelig at gamle meldinger ikke kan leses. Appen later aldri som om noe er hentet tilbake når det ikke er det.

**Før du starter**

- Bruk en egen testkonto som Konto A, ikke din vanlige konto. Alt i testen er fiktivt, og gamle chatmeldinger på testkontoen går tapt.
- Konto B (helst også en testkonto) er venn av Konto A og har privat chat slått på.
- Konto A bruker en PC med en vanlig nettleser, og senere to nye private nettleserfaner (eller andre nettlesere). Hver ny innlogging regnes som en ny enhet.
- Konto A har tilgang til e-posten sin. Ha penn og papir klar til nøkkelen.
- Testen tar omtrent 30 minutter, fordi sikkerhetskopien oppdateres høyst hvert 10. minutt.

**Slik gjør du det**

1. Konto A (PC): Slå på privat chat (som i K06). Når kortet «Lag en gjenopprettingsnøkkel» kommer, trykk «Lag gjenopprettingsnøkkel», skriv ned de 52 tegnene, kryss av «Jeg har skrevet ned eller lagret nøkkelen» og trykk «Ferdig». (Er chat allerede på: «Konto» › «Mine enheter» › «Lag gjenopprettingsnøkkel» eller «Lag en ny nøkkel».)
2. Konto A og Konto B: Send tre meldinger mellom dere: «K12 melding 1», «K12 melding 2» og «K12 melding 3».
3. Konto A (PC): La «Samtaler» stå åpen i minst 11 minutter etter siste melding, slik at meldingene blir sikkerhetskopiert.
4. Konto A (PC): Send «K12 melding 4 – ikke kopiert», og lukk nettleservinduet innen ett minutt.
5. Konto A: Åpne en ny privat nettleserfane, logg inn og gå til «Samtaler». Se kortet «Koble til denne enheten», og trykk lenken «Mistet alle enhetene? Bruk gjenopprettingsnøkkelen».
6. Feil nøkkel: Skriv nøkkelen med ett tegn endret i feltet «Gjenopprettingsnøkkel» og trykk «Hent tilbake». Se «Stemmer ikke» – «Nøkkelen stemmer ikke. Sjekk at alle 52 tegnene er riktige.».
7. Riktig nøkkel: Rett tegnet og trykk «Hent tilbake». Se meldingen «Hentet tilbake» og at det ikke står noe om at alle meldinger er hentet.
8. Konto A: Åpne samtalen med B. Se at «K12 melding 1–3» vises. «K12 melding 4» skal ikke vises, og det skal ikke stå tomme eller uleselige meldinger i stedet.
9. Konto A: Åpne den vanlige nettleseren på PC-en igjen og last Lånbort på nytt. Se at den er logget ut, fordi andre enheter stenges ute.
10. Konto B: Åpne samtalen med A. Se at det ikke står noe varsel om at sikkerhetskoden er endret.
11. Konto A: Åpne enda en ny privat nettleserfane, logg inn og gå til «Samtaler». Trykk «Har du ingen annen enhet med privat chat?» og deretter «Tilbakestill privat chat». Les punktene og trykk «Tilbakestill privat chat».
12. Konto A: På siden «Bekreft at det er deg» skriver du koden fra e-posten i feltet «Kode fra e-posten» og trykker «Tilbakestill privat chat». Se meldingen «Tilbakestilt» – «Privat chat er startet på nytt på denne enheten. Meldinger fra før kan ikke leses her.».
13. Konto A: Åpne samtalen med B og se at ingen av de gamle meldingene vises. Se også at det har kommet en e-post med emnet «Privat chat på kontoen din er tilbakestilt, og tidligere enheter er stengt ute», og varselet med samme tekst merket «Påkrevd» i «Varsler».
14. Konto B: Åpne samtalen med A. Se varselet «Sikkerhetskoden til … er endret», og at feltet sier «Godta først for å skrive». Trykk «Godta og fortsett», send «K12 etter tilbakestilling», og se at A mottar den.

**Testen er bestått når**

- Feil nøkkel ga «Nøkkelen stemmer ikke …», og ingenting ble hentet.
- Med riktig nøkkel kom de sikkerhetskopierte meldingene 1–3 tilbake; meldingen som ikke var kopiert, ble ikke vist som om den var hentet.
- Etter gjenoppretting ble den gamle enheten logget ut, og Konto B fikk ikke beskjed om endret sikkerhetskode.
- Etter tilbakestilling sa appen tydelig at meldinger fra før ikke kan leses, ingen gamle meldinger ble vist, og e-post og varsel «Påkrevd» om tilbakestillingen kom.
- Konto B måtte godta den nye sikkerhetskoden før B kunne skrive igjen, og meldinger etter det kom fram.

### K13 – Sjekk at chat ikke viser om en melding er lest, og at administratorer ikke kan lese den

**Prioritet:** U · **Fase:** 4

**Forventet resultat:** Den som sender en melding, kan ikke se om mottakeren har lest den. En administrator i et miljø kan ikke se eller åpne private samtaler mellom medlemmene.

**Før du starter**

- Egne testkontoer og fiktive meldinger. Konto A og Konto B er venner og har en privat samtale (se K07).
- Konto A er administrator i et testmiljø, for eksempel «Testmiljø K13», der Konto B er medlem.
- Konto B har også en privat samtale med en fjerde testkonto, kalt Konto D (venn av B, ikke av A).
- Konto A og Konto B bruker hver sin enhet, slik at begge skjermene kan ses samtidig.

**Slik gjør du det**

1. Konto A: Send «Lesetest 1» til B. Se hva som står under meldingen: bare klokkeslettet.
2. Konto B: Åpne samtalen og les «Lesetest 1». Vent ett minutt.
3. Konto A: Last samtalen på nytt. Se at det fortsatt bare står klokkeslett under meldingen, og ingen ord som «Lest», «Sett» eller «Levert», ingen ekstra hake og ikke B sitt bilde ved meldingen.
4. Konto A: Send «Lesetest 2». Konto B åpner ikke samtalen. Se at «Lesetest 2» ser helt lik ut som «Lesetest 1» hos A.
5. Konto A: Åpne «Om samtalen» (tre prikker øverst) og se at heller ikke der står noe om hva B har lest.
6. Konto A: Gå til «Testmiljø K13» og trykk «Administrer miljøet». Åpne «Medlemmer» og se på Konto B. Åpne også «Saker». Se at det ingen steder finnes samtaler, meldinger eller noe som viser at B chatter med noen.
7. Konto A: Gå til «Samtaler» og se at bare A sine egne samtaler står der, ikke samtalen mellom B og D.
8. Konto B: Åpne samtalen med D, kopier adressen i nettleserens adressefelt og send den til A på en annen måte (for eksempel SMS).
9. Konto A: Lim adressen inn i adressefeltet og åpne den. Se at det står «Samtalen eller personen finnes ikke, eller er ikke tilgjengelig.», og at ingen meldinger vises.

**Testen er bestått når**

- Hos avsenderen så en lest og en ulest melding helt like ut; det stod aldri «Lest», «Sett» eller noe lignende.
- Administrator-sidene i miljøet viste ingen private samtaler eller meldinger for medlemmet.
- Administratoren kunne ikke åpne samtalen mellom B og D via adressen, og så ingen meldingstekst.

### K14 – Blokker motparten under et lån og se at vanlig chat stenges, men lånechat fortsatt går

**Prioritet:** U · **Fase:** 4

**Forventet resultat:** Når en av partene blokkerer den andre, stenges den vanlige samtalen for begge. De kan fortsatt skrive korte meldinger om overlevering og retur i en egen samtale om lånet, som ingen av dem kan stenge mens lånet pågår.

**Før du starter**

- Bruk egne testkontoer og testting; alt er fiktivt. Konto A (utlåner) og Konto B (låntaker) er venner, og begge har slått på privat chat (se K06).
- Konto A og Konto B har en privat samtale med minst én melding (se K07).
- Det finnes et godkjent lån av en testting, for eksempel «Lånetest stige», fra A til B (se L01 og L04). Lånet kan være før eller etter overlevering, men ikke avsluttet.
- Konto A på mobilen, Konto B på PC-en.

**Slik gjør du det**

1. Konto A: Gå til «Lån», åpne lånet av «Lånetest stige» og trykk på navnet til Konto B for å åpne profilen.
2. Konto A: Trykk «Flere valg» og deretter «Blokker …». Se at vinduet sier at «Lån dere allerede har avtalt.» består. Trykk «Blokker …» i vinduet.
3. Konto A: Gå til «Samtaler» og åpne samtalen med B. Se merket «Stengt» og teksten «Samtalen er stengt. Ingen av dere kan sende nye meldinger her.», og at det ikke finnes noe felt å skrive i.
4. Konto B: Åpne samtalen med A. Se det samme: «Stengt» og ikke noe skrivefelt.
5. Konto A: Gå til «Lån» og åpne lånet. Se avsnittet «Samtale om lånet» med teksten om at vanlig chat er stengt. Trykk «Skriv om lånet».
6. Konto A: Se at samtalen om lånet åpnes med merket «Bare for å avslutte lånet», og at det står «Omtrent … tegn igjen» under skrivefeltet. Skriv «Kan du levere stigen lørdag kl. 12 ved porten?» og send.
7. Konto A: Lim inn en lang tekst (for eksempel fem–seks lange setninger). Se at det står «Meldingen er for lang. Her kan du bare sende korte meldinger om lånet.», og at den ikke blir sendt.
8. Konto B: Gå til «Lån», åpne lånet og trykk «Gå til samtalen om lånet». Se meldingen fra A, og svar «Ok, lørdag kl. 12.».
9. Konto B: Trykk «Om samtalen» (tre prikker). Se at det bare finnes «Demp samtalen» og «Fjern fra mine samtaler», og ingen knapp for å stenge samtalen.
10. Konto A: Se at svaret fra B kom fram i samtalen om lånet.
11. Rydd opp etter testen: Konto A går til «Konto» › «Blokkerte» og trykker «Opphev blokkeringen», og bekrefter. Avslutt eller kanseller testlånet slik L-testene beskriver.

**Testen er bestått når**

- Etter blokkeringen var den vanlige samtalen merket «Stengt» hos både A og B, uten skrivefelt.
- Lånet stod fortsatt på «Lån» hos begge.
- Samtalen om lånet kunne startes, og korte meldinger kom fram begge veier.
- Lange meldinger ble stoppet med «Meldingen er for lang …», og ingen av partene hadde en knapp for å stenge samtalen om lånet.

## R – Anmeldelser og tillit (7)

| ID | Prioritet | Fase | Testhandling | Forventet resultat |
| --- | :---: | :---: | --- | --- |
| R01 | O | 3 | Begge parter anmelder hverandre etter et lån som er levert tilbake | Utlåner og låntaker får hvert sitt skjema med de punktene som passer for sin rolle, med skala fra 1 til 5. Bare de to partene kan anmelde, og hver av dem bare én gang. |
| R02 | O | 3 | Bare den ene parten anmelder, og anmeldelsen blir synlig først når 14-dagersfristen er ute | Anmeldelsen holdes skjult for den andre parten så lenge fristen løper. Når de 14 dagene har gått, blir den synlig, og den som ikke anmeldte, kan ikke anmelde lenger. |
| R03 | O | 3 | Gi lav vurdering (1 eller 2) og sjekk at skjemaet krever en kort begrunnelse | Skjemaet slipper ikke gjennom en anmeldelse med 1 eller 2 uten en kort tekst, og sier tydelig hva som mangler. Med tekst går den gjennom, og uten lave vurderinger er teksten valgfri. |
| R04 | O | 3 | Svar én gang på en anmeldelse av deg, og sjekk at selve anmeldelsen ikke endres | Den som er anmeldt, kan skrive ett tilsvar som vises under anmeldelsen. Anmeldelsen står uendret, og det går ikke an å svare en gang til. |
| R05 | O | 3 | Se en persons erfaringer fra lån fra egen konto, som venn, fra et lån og som utenforstående | Erfaringene vises hver for seg som låntaker og som utlåner, med snitt, antall og fordeling som stemmer med anmeldelsene som er gitt. Den som ikke kjenner personen, får ikke se siden. |
| R06 | U | 4 | Sjekk at en anmeldelse fra et skjult miljø ikke viser miljø, navn eller tekst til andre | Den som ikke er med i det skjulte miljøet, ser verken miljøets navn, hvem som skrev anmeldelsen eller teksten i den. Poengene kan bare inngå i de samlede tallene. |
| R07 | U | 4 | Blokker den andre parten etter et avsluttet lån, og sjekk at begge fortsatt kan anmelde | Blokkeringen stopper ny kontakt, men begge parter kan fortsatt anmelde lånet, se hverandres anmeldelse og gi tilsvar. |

### R01 – Begge parter anmelder hverandre etter et lån som er levert tilbake

**Prioritet:** O · **Fase:** 3

**Forventet resultat:** Utlåner og låntaker får hvert sitt skjema med de punktene som passer for sin rolle, med skala fra 1 til 5. Bare de to partene kan anmelde, og hver av dem bare én gang.

**Før du starter**

- Konto A (utlåner) og Konto B (låntaker), innlogget på hver sin enhet eller i én vanlig og én privat nettleserfane.
- Et lån mellom A og B av en testting, f.eks. «Lånetest stige», som er levert tilbake og bekreftet mottatt (som i L12–L13), slik at lånet ligger under «Lån» → «Avsluttede lån». Ingen av dem har anmeldt lånet ennå.
- Konto C (ingen relasjon til A eller B), innlogget i en tredje nettleser eller på en tredje enhet.

**Slik gjør du det**

1. Logg inn som Konto A og gå til «Hjem». Se at det står en oppgave «Skriv anmeldelse» med teksten «Lånet av Lånetest stige er avsluttet».
2. Gå til «Lån» → «Avsluttede lån» og åpne lånet av «Lånetest stige».
3. Se at statuskortet har knappen «Anmeld [navnet til B]», og at seksjonen «Anmeldelser» har teksten «Anmeldelsen din er skjult til [B] også har anmeldt deg, eller til fristen …. Da vises begge samtidig.»
4. Se at skjemaet under «Anmeld [B]» har nøyaktig fire punkter: «Hentet til avtalt tid», «Leverte tilbake til avtalt tid», «Rimelig tilstand ved retur» og «Kommunikasjon». Hvert punkt har valgene 1, 2, 3, 4 og 5, og under står «1 er svært dårlig, 5 er svært bra.»
5. Velg 4 eller 5 på alle fire punktene, skriv «Ryddig lån, testtekst R01» i feltet «Beskriv kort» og trykk «Send anmeldelsen». Se meldingen «Anmeldelsen er sendt».
6. Se at skjemaet er byttet ut med «Din anmeldelse av [B]» med poengene du ga, at det bare finnes valget «Endre anmeldelsen» (ikke et nytt, tomt skjema), og at ingen anmeldelse fra B vises ennå.
7. Kopier adressen til lånesiden fra nettleserens adressefelt.
8. Logg inn som Konto B og åpne samme lån via «Lån» → «Avsluttede lån». Se at A sin anmeldelse ikke vises.
9. Se at skjemaet under «Anmeld [navnet til A]» har nøyaktig fire punkter: «Gjorde tingen tilgjengelig til avtalt tid», «Var tilgjengelig for tilbakeleveringen», «Tingen stemte med beskrivelsen» og «Kommunikasjon», hvert med valgene 1–5.
10. Som Konto B: velg 3, 4 eller 5 på alle punktene, la «Beskriv kort» stå tom og trykk «Send anmeldelsen». Se at den sendes uten feilmelding.
11. Se at seksjonen «Anmeldelser» nå viser både «Din anmeldelse av [A]» og «[A] sin anmeldelse av deg» med poengene og teksten «Ryddig lån, testtekst R01».
12. Bytt til Konto A og last lånesiden på nytt. Se at «[B] sin anmeldelse av deg» nå vises, og at «Endre anmeldelsen» er borte.
13. I nettleseren til Konto C: lim inn adressen fra steg 7 i adressefeltet og åpne den. Se at siden viser «Finnes ikke».

**Testen er bestått når**

- Skjemaet til A hadde nøyaktig de fire utlånerpunktene fra steg 4, og skjemaet til B nøyaktig de fire låntakerpunktene fra steg 9, alle med valgene 1–5.
- Anmeldelsen til B med bare 3 eller høyere ble sendt uten tekst og uten feilmelding.
- Hver part fikk sende bare én anmeldelse; etterpå fantes bare «Endre anmeldelsen» så lenge anmeldelsen var skjult.
- Ingen av partene så den andres anmeldelse før begge hadde sendt sin; da ble begge synlige for begge.
- Konto C fikk «Finnes ikke» på lånesiden og fikk aldri noe anmeldelsesskjema.

### R02 – Bare den ene parten anmelder, og anmeldelsen blir synlig først når 14-dagersfristen er ute

**Prioritet:** O · **Fase:** 3

**Forventet resultat:** Anmeldelsen holdes skjult for den andre parten så lenge fristen løper. Når de 14 dagene har gått, blir den synlig, og den som ikke anmeldte, kan ikke anmelde lenger.

**Før du starter**

- Konto A (utlåner) og Konto B (låntaker), på hver sin enhet eller i én vanlig og én privat nettleserfane.
- Et nytt lån mellom A og B som akkurat er levert tilbake og bekreftet mottatt (som i L13), og som ingen av dem har anmeldt.
- Start testen tidlig i piloten: den tar minst 14 dager. Skriv ned dato og klokkeslett for når lånet ble avsluttet.
- Avtal med Konto B at B ikke skal anmelde dette lånet i løpet av testen.

**Slik gjør du det**

1. Som Konto A: gå til «Lån» → «Avsluttede lån» og åpne lånet.
2. Les teksten under «Anmeldelser»: «Anmeldelsen din er skjult til [B] også har anmeldt deg, eller til fristen [dato og klokkeslett]. Da vises begge samtidig.» Skriv ned fristen og sjekk at den er 14 dager etter at lånet ble avsluttet.
3. Som Konto A: velg 4 på alle punktene, skriv «Testtekst R02» i «Beskriv kort» og trykk «Send anmeldelsen».
4. Som Konto B: åpne samme lån. Se at knappen «Anmeld [A]» og skjemaet fortsatt vises, og at det ikke står noen «[A] sin anmeldelse av deg». Ikke send noe.
5. Som Konto A, samme dag: trykk «Endre anmeldelsen», endre ett punkt fra 4 til 5 og trykk «Lagre endringene». Se meldingen «Anmeldelsen er endret».
6. Vent til fristen du skrev ned i steg 2 er passert. Ikke gjør noe mer med anmeldelsene i mellomtiden.
7. Etter fristen, som Konto B: åpne lånet. Se at «[A] sin anmeldelse av deg» vises med teksten «Testtekst R02» og med 5 på punktet A endret i steg 5.
8. Som Konto B: se at skjemaet «Anmeld [A]» og knappen «Anmeld [A]» er borte, og at oppgaven «Skriv anmeldelse» for dette lånet ikke lenger står på «Hjem».
9. Som Konto A: åpne lånet. Se at «Din anmeldelse av [B]» vises uten valget «Endre anmeldelsen».

**Testen er bestått når**

- Fristen som ble vist, var 14 dager etter at lånet ble avsluttet.
- Før fristen så B ikke A sin anmeldelse, mens A kunne endre den.
- Etter fristen så B A sin anmeldelse med endringen fra steg 5, selv om B aldri anmeldte.
- Etter fristen kunne verken B anmelde eller A endre anmeldelsen.

### R03 – Gi lav vurdering (1 eller 2) og sjekk at skjemaet krever en kort begrunnelse

**Prioritet:** O · **Fase:** 3

**Forventet resultat:** Skjemaet slipper ikke gjennom en anmeldelse med 1 eller 2 uten en kort tekst, og sier tydelig hva som mangler. Med tekst går den gjennom, og uten lave vurderinger er teksten valgfri.

**Før du starter**

- Konto A og Konto B, på hver sin enhet eller i én vanlig og én privat nettleserfane.
- Et lån mellom A og B som er levert tilbake og avsluttet, og som ingen av dem har anmeldt (ikke bruk lånet fra R02).
- Det som skrives, er fiktivt.

**Slik gjør du det**

1. Som Konto A: gå til «Lån» → «Avsluttede lån», åpne lånet og finn skjemaet «Anmeld [B]». Les hjelpeteksten under «Beskriv kort»: «Kreves hvis du gir 1 eller 2 på noe. Ellers er det valgfritt. Beskriv det du opplevde.»
2. Trykk «Send anmeldelsen» uten å velge noen poeng. Se at nettleseren stopper innsendingen og viser at et punkt mangler valg.
3. Velg 2 på «Kommunikasjon» og 4 på de andre punktene. La «Beskriv kort» stå tom og trykk «Send anmeldelsen».
4. Se feilmeldingen «Gi en vurdering på hvert punkt, og beskriv kort hva som skjedde hvis du gir 1 eller 2.», og at skjemaet fortsatt står der (det står ikke «Din anmeldelse av [B]»).
5. Skriv bare noen mellomrom i «Beskriv kort» og trykk «Send anmeldelsen». Se den samme feilmeldingen.
6. Skriv «Svarte sent på meldinger (fiktiv testtekst R03)» i «Beskriv kort» og trykk «Send anmeldelsen». Se meldingen «Anmeldelsen er sendt».
7. Se at «Din anmeldelse av [B]» viser «2 av 5» på «Kommunikasjon» og teksten du skrev.
8. Som Konto B: åpne samme lån, velg 3 på alle punktene, la «Beskriv kort» stå tom og trykk «Send anmeldelsen». Se at den sendes uten feilmelding.

**Testen er bestått når**

- Innsending med en 2-er og tom tekst, og med bare mellomrom, ble stoppet med feilmeldingen fra steg 4.
- Innsending der et punkt manglet valg, ble stoppet.
- Med begrunnelse ble anmeldelsen sendt og viser 2 på «Kommunikasjon» og teksten.
- Anmeldelsen med bare 3-ere ble sendt uten tekst.

### R04 – Svar én gang på en anmeldelse av deg, og sjekk at selve anmeldelsen ikke endres

**Prioritet:** O · **Fase:** 3

**Forventet resultat:** Den som er anmeldt, kan skrive ett tilsvar som vises under anmeldelsen. Anmeldelsen står uendret, og det går ikke an å svare en gang til.

**Før du starter**

- Bruk lånet fra R03, der begge anmeldelsene er publisert og B har fått A sin anmeldelse med 2 på «Kommunikasjon».
- Konto A og Konto B, på hver sin enhet eller i én vanlig og én privat nettleserfane.

**Slik gjør du det**

1. Som Konto B: gå til «Lån» → «Avsluttede lån» og åpne lånet. Under «[A] sin anmeldelse av deg»: skriv ned eller ta skjermbilde av poengene og teksten.
2. Trykk «Gi et tilsvar». Les hjelpeteksten: «Du kan svare én gang. Tilsvaret vises sammen med anmeldelsen og endrer ikke vurderingen.»
3. Trykk «Send tilsvaret» med tomt felt. Se at nettleseren krever at feltet «Tilsvar» fylles ut.
4. Skriv «Beklager, var bortreist (fiktivt tilsvar R04)» i «Tilsvar» og trykk «Send tilsvaret».
5. Se at overskriften «Tilsvar» med teksten din nå står under anmeldelsen, og at «Gi et tilsvar» er borte.
6. Last siden på nytt og sammenlign poengene og teksten i A sin anmeldelse med det du skrev ned i steg 1.
7. Som Konto A: åpne samme lån. Se at «Din anmeldelse av [B]» har «Tilsvar» med B sin tekst under, at poengene og teksten er de A sendte, og at A verken har «Endre anmeldelsen» eller noen knapp for å svare på tilsvaret.
8. Som Konto A: trykk på navnet til B på lånesiden, så «Som låntaker» under «Erfaringer fra lån». Se at anmeldelsen fra A viser «Svar fra [B]» med tilsvaret.

**Testen er bestått når**

- B kunne sende nøyaktig ett tilsvar; etterpå fantes ikke «Gi et tilsvar».
- Poengene og teksten i A sin anmeldelse var de samme før og etter tilsvaret.
- Tilsvaret vises både på lånesiden under «Tilsvar» og på B sin side som «Svar fra [B]».
- A kunne verken endre anmeldelsen eller svare på tilsvaret.

### R05 – Se en persons erfaringer fra lån fra egen konto, som venn, fra et lån og som utenforstående

**Prioritet:** O · **Fase:** 3

**Forventet resultat:** Erfaringene vises hver for seg som låntaker og som utlåner, med snitt, antall og fordeling som stemmer med anmeldelsene som er gitt. Den som ikke kjenner personen, får ikke se siden.

**Før du starter**

- Konto B som har fått minst én publisert anmeldelse, f.eks. fra R01–R04. Skriv ned hvilke poeng B har fått på hvert punkt, og om B var låntaker eller utlåner.
- Konto A, som er venn av B og part i lånet.
- En ting som B eier og som A kan se (synlig for venner eller i et felles miljø).
- Konto C uten relasjon til B. Tre enheter eller nettlesere.

**Slik gjør du det**

1. Som Konto B: gå til «Konto» og trykk «Se din egen side». Finn «Erfaringer fra lån» og se to kort: «Som låntaker» og «Som utlåner».
2. Se at kortet for rollen B er anmeldt i, viser antallet, f.eks. «1 anmeldelse fra utlånere» for låntaker, og at en rolle uten anmeldelser viser «Ingen anmeldelser ennå». Med færre enn 5 anmeldelser har kortet merket «Få vurderinger».
3. Trykk «Som låntaker». Se overskriften «[B] som låntaker» og teksten «[antall] anmeldelse(r) fra dem som har lånt ut til [B]. Hver vurdering er fra 1 til 5.»
4. For hvert punkt: se teksten «[snitt] av 5 fra [antall] vurdering(er)», og sjekk at tallene stemmer med poengene du skrev ned. Se at det ikke finnes ett samlet tall for hele personen.
5. Under «Anmeldelser»: se at hver anmeldelse viser «Fra [navn]», hvordan lånet endte (f.eks. «Levert tilbake»), dato, poengene, teksten og eventuelt «Svar fra [B]».
6. Gå tilbake til B sin side og kopier adressen fra nettleserens adressefelt.
7. Som Konto A: gå til «Lån» → «Avsluttede lån», åpne lånet med B og trykk på navnet til B. Se at «Som låntaker» står først, og at tallene er de samme som B så.
8. Som Konto A: åpne tingen til B og trykk på eierens navn (B). Se at «Som utlåner» nå står først.
9. Som Konto C: lim adressen fra steg 6 inn i adressefeltet og åpne den. Se at siden viser «Finnes ikke».

**Testen er bestått når**

- Rollene låntaker og utlåner vises hver for seg, uten ett samlet tall for personen.
- Snitt og antall på hvert punkt stemmer med anmeldelsene B faktisk har fått.
- Merket «Få vurderinger» vises når rollen har færre enn 5 anmeldelser.
- Rollen siden ble åpnet fra, står først: låntaker fra lånet, utlåner fra tingen.
- Konto C fikk «Finnes ikke».

### R06 – Sjekk at en anmeldelse fra et skjult miljø ikke viser miljø, navn eller tekst til andre

**Prioritet:** U · **Fase:** 4

**Forventet resultat:** Den som ikke er med i det skjulte miljøet, ser verken miljøets navn, hvem som skrev anmeldelsen eller teksten i den. Poengene kan bare inngå i de samlede tallene.

**Før du starter**

- Egne testkontoer og testting; alt som skrives, er fiktivt.
- Konto A oppretter et skjult testmiljø «Testmiljø skjult R06» og inviterer Konto B (som i M05). Konto C er ikke medlem og ikke venn av B.
- B publiserer testtingen «Lånetest skjult R06» i miljøet. A låner den fra miljøets side (som i L02), og lånet gjennomføres og avsluttes (som i L09, L12 og L13).
- A anmelder B med teksten «Hemmelig testtekst R06», og B anmelder A, slik at begge anmeldelsene er publisert.
- Tre enheter eller nettlesere for A, B og C.

**Slik gjør du det**

1. Som Konto B: gå til «Konto» → «Se din egen side» → «Som utlåner». Se at anmeldelsen fra A har merket «Via Testmiljø skjult R06», «Fra [A]» og teksten «Hemmelig testtekst R06».
2. Gå tilbake til B sin side og kopier adressen fra nettleserens adressefelt.
3. Som Konto C: lim adressen inn i adressefeltet og åpne den. Se at siden viser «Finnes ikke».
4. Som Konto C: gå til «Finn» og søk på «Testmiljø skjult R06» og på «Lånetest skjult R06». Se at det ikke kommer treff.
5. La B og C bli venner (som i A06 eller A09).
6. Som Konto C: gå til «Konto» → «Venner» og åpne B. Se at det øverst på siden ikke står noe merke med «Testmiljø skjult R06».
7. Som Konto C: se på kortet «Som utlåner» under «Erfaringer fra lån». Antall og snitt kan vises.
8. Som Konto C: trykk «Som utlåner». Se at anmeldelsen fra A ikke vises: ingen «Via Testmiljø skjult R06», ingen «Fra [A]» og ingen «Hemmelig testtekst R06». Er det ingen andre anmeldelser, står «Ingen anmeldelser å vise.»
9. Som Konto C: bruk nettleserens «Finn på siden» (Ctrl+F på PC) og søk etter «R06» og etter navnet til A på begge sidene. Se at det ikke er treff.
10. Som Konto A: åpne B sin side → «Som utlåner». Se at A, som er medlem av miljøet, ser anmeldelsen med «Via Testmiljø skjult R06».
11. Rydd opp: som Konto C, åpne B sin side → «Flere valg» → «Fjern [B] som venn» og bekreft.

**Testen er bestått når**

- Konto C så aldri miljønavnet «Testmiljø skjult R06», A sitt navn eller teksten «Hemmelig testtekst R06».
- Før vennskapet fikk C «Finnes ikke» på B sin side og ingen søketreff.
- Etter vennskapet så C høyst samlede tall for rollen, aldri selve anmeldelsen.
- A og B, som er medlemmer av miljøet, så anmeldelsen med miljø, navn og tekst.

### R07 – Blokker den andre parten etter et avsluttet lån, og sjekk at begge fortsatt kan anmelde

**Prioritet:** U · **Fase:** 4

**Forventet resultat:** Blokkeringen stopper ny kontakt, men begge parter kan fortsatt anmelde lånet, se hverandres anmeldelse og gi tilsvar.

**Før du starter**

- Egne testkontoer og testting; alt som skrives, er fiktivt.
- Konto A (utlåner) og Konto B (låntaker) med et lån som er levert tilbake og avsluttet, og som ingen av dem har anmeldt.
- Blokkering avslutter et vennskap. Vær forberedt på å bli venner igjen etter testen.
- To enheter, eller én vanlig og én privat nettleserfane.

**Slik gjør du det**

1. Som Konto A: gå til «Lån» → «Avsluttede lån», åpne lånet og se at «Anmeld [B]» finnes. Ikke anmeld ennå.
2. Trykk på navnet til B på lånesiden. På B sin side: trykk «Flere valg» → «Blokker [B]».
3. I vinduet «Blokkere [B]?»: se at det under «Dette består» står «Lån dere allerede har avtalt.» og «Saker dere har sammen, og anmeldelser dere har rett til å skrive.» Trykk «Blokker [B]».
4. Som Konto A: gå til «Konto» → «Blokkerte» og se at B står på listen.
5. Som Konto A: gå til «Lån» → «Avsluttede lån» og åpne lånet. Se at skjemaet «Anmeld [B]» fortsatt finnes.
6. Velg 4 på alle punktene, skriv «Testtekst R07 fra A» i «Beskriv kort» og trykk «Send anmeldelsen». Se meldingen «Anmeldelsen er sendt».
7. Som Konto B: åpne samme lån. Se at «Anmeld [A]» fortsatt finnes. Velg 3 på alle punktene og trykk «Send anmeldelsen».
8. Som Konto B: se at både «Din anmeldelse av [A]» og «[A] sin anmeldelse av deg» vises.
9. Som Konto B: trykk «Gi et tilsvar», skriv «Testtilsvar R07» og trykk «Send tilsvaret». Se at tilsvaret vises under A sin anmeldelse.
10. Som Konto A: last lånesiden på nytt. Se «[B] sin anmeldelse av deg», og tilsvaret under «Din anmeldelse av [B]».
11. Rydd opp: som Konto A, gå til «Konto» → «Blokkerte», trykk «Opphev blokkeringen» ved B og bekreft med «Opphev blokkeringen».

**Testen er bestått når**

- B sto på A sin liste «Blokkerte» mens anmeldelsene ble sendt.
- Etter blokkeringen kunne både A og B sende sin anmeldelse uten feilmelding.
- Begge anmeldelsene ble publisert og vises for begge parter på lånesiden.
- B kunne gi tilsvar etter blokkeringen, og A så tilsvaret.

## D – Miljøadministrasjon, rapporter og saker (10)

| ID | Prioritet | Fase | Testhandling | Forventet resultat |
| --- | :---: | :---: | --- | --- |
| D01 | O | 2 | Administratoren får oppgaver når noen søker om å bli med og når ting venter på godkjenning | Søknader og ting som venter, dukker opp som oppgaver for administratoren på Hjem og i miljøet, med riktig antall og status. Når de er behandlet, forsvinner oppgavene. |
| D02 | O | 2 | Slå på godkjenning av nye ting i et miljø, og godkjenn én ting og avvis en annen | Når godkjenning er slått på, ser medlemmene en ny ting først når en administrator har godkjent den. En avvist ting blir ikke synlig i miljøet. |
| D03 | O | 3 | Et medlem skriver til miljøets administratorer, og saken havner i riktig miljø | Meldingen blir en sak som bare administratorene i det miljøet medlemmet skrev til, ser og kan behandle. Medlemmet ser at saken venter på administratorene, og svaret kommer fra administratorene som gruppe. |
| D04 | O | 3 | Rapporter en ting og en person i et miljø, og sjekk hvem som får rapportene | Rapportene går til administratorene i miljøet, ikke til den som blir rapportert. Lånbort kan ikke velges som mottaker ennå, og anmeldelser kan ikke rapporteres i appen. |
| D05 | O | 3 | Administratoren tar en sak, behandler den og lukker den med en avslutningsmelding | Den som meldte saken, ser hele tiden om saken venter, er tatt eller er lukket, og får avslutningsmeldingen. Den ser ikke hvilken administrator som har saken eller interne notater. |
| D06 | U | 4 | Mekling der partene sier ulike ting: administratoren ser bare det partene sender inn | Administratoren ser partenes forklaringer og bare de chatmeldingene en part selv har valgt å sende inn, aldri resten av den private chatten. Partene ser ikke hverandres forklaring før administratoren deler dem. |
| D07 | U | 4 | En rapportert administrator skal verken se eller behandle saken om seg selv | Saken skjules for administratoren som er rapportert, og behandles av en annen administrator. En administrator som erklærer seg inhabil, mister saken for godt. |
| D08 | U | 4 | Avvis en ting og fjern et medlem i ett miljø, med begrunnelse som bare gjelder der | Tiltaket gjelder bare i det ene miljøet. Den som rammes, får beskjed med begrunnelse uten å få vite hvem som rapporterte, og administratorene ser hva som ble gjort, av hvem og når. |
| D09 | U | 4 | En sak i et miljø der ingen administrator kan behandle den, blir liggende og vente | Når eneste administrator selv er rapportert, står saken på vent og sier det tydelig. Den sendes ikke videre til Lånbort eller noen andre, og blir først behandlet når en ny administrator finnes. |
| D10 | B | 0 | Sjekk at Lånbort ikke kan behandle saker eller gripe inn under piloten | Ingen sider eller knapper for Lånbort sin egen saksbehandling er i bruk. Der appen nevner Lånbort som mottaker, står det tydelig at det ikke er tilgjengelig ennå. |

### D01 – Administratoren får oppgaver når noen søker om å bli med og når ting venter på godkjenning

**Prioritet:** O · **Fase:** 2

**Forventet resultat:** Søknader og ting som venter, dukker opp som oppgaver for administratoren på Hjem og i miljøet, med riktig antall og status. Når de er behandlet, forsvinner oppgavene.

**Før du starter**

- Konto A er eier og administrator av et lukket testmiljø «Testmiljø D01» (som i M02).
- I miljøet skal nye ting kreve godkjenning: A går til «Administrer miljøet» → «Ting i miljøet», trykker «Krev godkjenning» og bekrefter med «Krev godkjenning».
- Konto B er ikke medlem ennå og har en testting «Testdrill D01» under «Mine ting».
- To enheter, eller én vanlig og én privat nettleserfane.

**Slik gjør du det**

1. Som Konto B: finn «Testmiljø D01» (via «Finn» eller en lenke fra A), trykk «Søk om å bli med» og deretter «Send søknaden».
2. Som Konto A: åpne «Varsler» og se varselet «En søknad om medlemskap i Testmiljø D01 venter på behandling».
3. Som Konto A: gå til «Hjem». Se seksjonen «1 som administrator» med et kort for «Testmiljø D01» og raden «Behandle 1 innmelding».
4. Trykk «Behandle 1 innmelding». På siden «Innmeldinger og invitasjoner» skal B stå under «Venter på avgjørelse» med statusen «Søker om å bli med» og knappene «Godkjenn [B]», «Avvis» og «Be om mer informasjon».
5. Trykk «Godkjenn [B]». Gå til «Hjem» og se at «Behandle 1 innmelding» er borte.
6. Som Konto B: gå til «Mine ting», åpne «Testdrill D01» og trykk «Publiser i Testmiljø D01» under «Hvor den vises». Se merket «Venter på godkjenning».
7. Som Konto A: gå til «Hjem» og se raden «Vurder 1 ting» på kortet for «Testmiljø D01».
8. Som Konto A: gå til «Hjem» → «Dine miljøer» → «Testmiljø D01». Se seksjonen «Som administrator» med «Vurder 1 ting» og «Administrer miljøet».
9. Trykk «Administrer miljøet». Se at det under «Venter på dere» står «Ting til godkjenning» med «Testdrill D01» og merket «1 venter».
10. Trykk «Ting til godkjenning». På siden «Ting i miljøet» står «Testdrill D01» under «Venter på godkjenning» med «lagt ut av [B]». Trykk «Godkjenn».
11. Se at tingen flytter til «Synlige for medlemmene», og at «Vurder 1 ting» er borte fra «Hjem».
12. Som Konto B: se at «Hjem» ikke har noen seksjon «som administrator», og at «Testdrill D01» nå har merket «Synlig for medlemmene».

**Testen er bestått når**

- Søknaden ga A både varselet og oppgaven «Behandle 1 innmelding», og B sto under «Venter på avgjørelse» med «Søker om å bli med».
- Tingen ga A oppgaven «Vurder 1 ting» på «Hjem» og i «Som administrator», og «Ting til godkjenning» med «1 venter» under «Administrer miljøet».
- Begge oppgavene forsvant fra «Hjem» straks de var behandlet.
- B, som vanlig medlem, så ingen administratoroppgaver.

### D02 – Slå på godkjenning av nye ting i et miljø, og godkjenn én ting og avvis en annen

**Prioritet:** O · **Fase:** 2

**Forventet resultat:** Når godkjenning er slått på, ser medlemmene en ny ting først når en administrator har godkjent den. En avvist ting blir ikke synlig i miljøet.

**Før du starter**

- Konto A er administrator av «Testmiljø D02» der nye ting foreløpig vises med en gang.
- Konto B er medlem og har to testting under «Mine ting»: «Testdrill D02» og «Lånetest stige D02», ikke publisert i miljøet ennå.
- Konto D: en ekstra testkonto som er vanlig medlem av miljøet og brukes til å se miljøet slik medlemmene ser det.
- Tre enheter eller nettlesere.

**Slik gjør du det**

1. Som Konto A: gå til «Hjem» → «Dine miljøer» → «Testmiljø D02» → «Administrer miljøet» → «Ting i miljøet». Se teksten «Ting blir synlige for medlemmene med en gang de legges ut.»
2. Trykk «Krev godkjenning». Les vinduet «Krev godkjenning av nye ting» (blant annet «Nye ting må godkjennes før medlemmene ser dem.») og trykk «Krev godkjenning». Se at teksten nå er «Nye ting må godkjennes av en administrator før medlemmene ser dem.»
3. Som Konto B: åpne «Testdrill D02» under «Mine ting» og trykk «Publiser i Testmiljø D02». Gjør det samme med «Lånetest stige D02». Se at begge får merket «Venter på godkjenning».
4. Som Konto D: åpne miljøets side og se at ingen av de to tingene står i tinglisten. Søk også på «D02» i feltet «Søk i Testmiljø D02» og se at det ikke kommer treff.
5. Som Konto A: last «Ting i miljøet» på nytt. Se begge tingene under «Venter på godkjenning». Trykk «Godkjenn» ved «Testdrill D02».
6. Ved «Lånetest stige D02»: trykk «Avvis». Les vinduet («Lånetest stige D02 blir ikke synlig i miljøet.») og trykk «Avvis Lånetest stige D02».
7. Se at «Testdrill D02» står under «Synlige for medlemmene» og «Lånetest stige D02» under «Avvist».
8. Som Konto D: last miljøets side på nytt. Se at «Testdrill D02» vises, og at «Lånetest stige D02» verken vises i listen eller i søk på «D02».
9. Som Konto B: åpne begge tingene og se merkene «Synlig for medlemmene» på «Testdrill D02» og «Avvist av administratorene» på «Lånetest stige D02».
10. Rydd opp hvis miljøet ikke skal kreve godkjenning videre: som Konto A, trykk «Slå av godkjenning» på «Ting i miljøet» og bekreft med «Slå av godkjenning».

**Testen er bestått når**

- Etter «Krev godkjenning» så ikke Konto D noen av de nye tingene før en administrator hadde godkjent dem.
- Den godkjente tingen ble synlig for D, og den avviste ble ikke synlig, heller ikke i søk.
- A sin side «Ting i miljøet» og B sine merker på tingene viste samme status for hver ting.

### D03 – Et medlem skriver til miljøets administratorer, og saken havner i riktig miljø

**Prioritet:** O · **Fase:** 3

**Forventet resultat:** Meldingen blir en sak som bare administratorene i det miljøet medlemmet skrev til, ser og kan behandle. Medlemmet ser at saken venter på administratorene, og svaret kommer fra administratorene som gruppe.

**Før du starter**

- Konto A er administrator av to testmiljøer: «Testmiljø D03-1» og «Testmiljø D03-2».
- Konto B er vanlig medlem (ikke administrator) av «Testmiljø D03-1».
- Konto C uten relasjon til A eller B.
- Tre enheter eller nettlesere.

**Slik gjør du det**

1. Som Konto B: gå til «Hjem» → «Dine miljøer» → «Testmiljø D03-1» → «Mitt medlemskap». Se teksten «Går til administratorene som gruppe, ikke til én person. Du får et varsel når de svarer.» og trykk «Kontakt administratorene».
2. Se at siden heter «Kontakt administratorene», har merket for miljøet «Testmiljø D03-1» og teksten «Du skriver til administratorene som gruppe. …».
3. Skriv «Testhenvendelse D03: Hvor finner jeg reglene?» i «Melding» og trykk «Send til administratorene».
4. Se at saken åpnes med tittelen «Henvendelse til administratorene», merket «Testmiljø D03-1» og statusen «Venter på administratorene» med teksten «Venter på at administratorene i Testmiljø D03-1 tar saken». Kopier adressen fra adressefeltet.
5. Som Konto A: gå til «Hjem». Se raden «Svar på 1 henvendelse» på kortet for «Testmiljø D03-1», og at kortet for «Testmiljø D03-2» ikke har noen slik rad.
6. Trykk «Svar på 1 henvendelse». Se siden «Saker» med merket «Testmiljø D03-1», teksten «Du behandler som administrator i Testmiljø D03-1» og saken «Henvendelse fra [B]» under «Ingen har tatt».
7. Som Konto A: gå til «Konto» → «Saker» → «Saker i Testmiljø D03-2». Se «Ingen saker venter nå.»
8. Som Konto A: åpne saken i «Testmiljø D03-1» og trykk «Ta saken». Velg «Til [B]», skriv «Svar fra administratorene (test D03)» i «Innlegg» og trykk «Send innlegget».
9. Som Konto B: åpne saken via «Konto» → «Saker». Se at svaret står med avsender «Administratorene i Testmiljø D03-1», ikke A sitt navn, og at statusen er «En administrator har saken».
10. Som Konto C: lim adressen fra steg 4 inn i adressefeltet. Se «Finnes ikke».
11. Som Konto B: trykk «Flere valg» → «Avslutt henvendelsen». Se at saken står som lukket («Saken er lukket»).

**Testen er bestått når**

- Saken fikk merket «Testmiljø D03-1» og kom bare i køen for det miljøet, ikke i «Testmiljø D03-2».
- A fikk «Svar på 1 henvendelse» under riktig miljø.
- B så «Venter på administratorene» før saken ble tatt, og svaret som fra «Administratorene i Testmiljø D03-1».
- Konto C fikk «Finnes ikke» på saken.

### D04 – Rapporter en ting og en person i et miljø, og sjekk hvem som får rapportene

**Prioritet:** O · **Fase:** 3

**Forventet resultat:** Rapportene går til administratorene i miljøet, ikke til den som blir rapportert. Lånbort kan ikke velges som mottaker ennå, og anmeldelser kan ikke rapporteres i appen.

**Før du starter**

- Konto A er eneste administrator av «Testmiljø D04».
- Konto B (rapporterer) og Konto D (blir rapportert) er vanlige medlemmer. D har publisert testtingen «Testdrill D04» i miljøet.
- B har et avsluttet lån med en publisert anmeldelse av seg (f.eks. fra R01) til siste del.
- Rapportene er fiktive. Tre enheter eller nettlesere.

**Slik gjør du det**

1. Som Konto B: gå til «Testmiljø D04», åpne «Testdrill D04» fra miljøets tingliste, og trykk «Flere valg» → «Rapporter tingen».
2. Se siden «Rapporter «Testdrill D04»» med merket «Testmiljø D04» og teksten «En rapport ber om en vurdering. Den sier ikke at noen har gjort noe galt. …». Under «Hvem skal vurdere det?» er «Administratorene i Testmiljø D04» valgt, og «Lånbort» er grå med «Ikke tilgjengelig ennå. Lånbort kan ikke ta imot rapporter i appen ennå.»
3. Skriv «Fiktiv testrapport D04 om ting» i «Hva har skjedd» og trykk «Send rapporten til administratorene». Se saken «Rapport om «Testdrill D04»» med statusen «Venter på administratorene».
4. Som Konto B: gå tilbake til miljøets side, trykk på navnet til D under «Medlemmer», og trykk «Flere valg» → «Rapporter [D]». Skriv «Fiktiv testrapport D04 om person» i «Hva har skjedd» og trykk «Send rapporten til administratorene». Kopier adressen til saken fra adressefeltet.
5. Som Konto A: gå til «Hjem» og se «Vurder 2 rapporter» på kortet for «Testmiljø D04». Trykk på raden og se begge rapportene under «Ingen har tatt», hver med «Meldt av [B]».
6. Som Konto D: åpne «Konto» → «Saker» og «Varsler». Se at det ikke finnes noen sak eller noe varsel om rapportene.
7. Som Konto D: lim adressen fra steg 4 inn i adressefeltet. Se «Finnes ikke».
8. Som Konto B: gå til «Lån» → «Avsluttede lån» og åpne lånet med en anmeldelse av deg. Se at det under «[navn] sin anmeldelse av deg» ikke finnes noen knapp for å rapportere anmeldelsen, bare «Gi et tilsvar» (eller tilsvaret, hvis det er gitt).

**Testen er bestått når**

- Begge rapportene havnet i køen til administratorene i «Testmiljø D04», og A fikk «Vurder 2 rapporter».
- «Lånbort» kunne ikke velges, og ingen rapport gikk dit.
- Konto D fikk ingen sak og ikke noe varsel, og fikk «Finnes ikke» på saken.
- Det fantes ingen vei til å rapportere en anmeldelse; bare tilsvar.

### D05 – Administratoren tar en sak, behandler den og lukker den med en avslutningsmelding

**Prioritet:** O · **Fase:** 3

**Forventet resultat:** Den som meldte saken, ser hele tiden om saken venter, er tatt eller er lukket, og får avslutningsmeldingen. Den ser ikke hvilken administrator som har saken eller interne notater.

**Før du starter**

- Bruk rapporten «Rapport om «Testdrill D04»» fra D04, som ingen har tatt ennå.
- Konto A (administrator), Konto B (meldte saken) og Konto D (eier av tingen), på tre enheter eller nettlesere.
- Alt som skrives, er fiktivt.

**Slik gjør du det**

1. Som Konto A: gå til «Hjem» → «Vurder … rapport» under «Testmiljø D04» og åpne «Rapport om «Testdrill D04»». Se «Du behandler som administrator i Testmiljø D04», statusen «Ingen har tatt saken ennå» og opplysningene «Gjelder» og «Meldt av [B]».
2. Trykk «Ta saken». Se at statusen blir «Du har saken».
3. Som Konto B: åpne saken via «Konto» → «Saker». Se statusen «En administrator har saken», uten navnet til A.
4. Som Konto A: under «Skriv i saken», velg «Internt notat», skriv «Internt testnotat D05 – skal ikke ses av B» og trykk «Lagre notatet».
5. Velg «Til [B]», skriv «Takk, vi ser på det (test D05)» og trykk «Send innlegget».
6. Under «Behandling»: velg B i «Hvem skal kunne skrive igjen» og trykk «Be om nytt innlegg».
7. Som Konto B: se merket «Din tur» ved saken i «Konto» → «Saker». Åpne saken, skriv «Tilleggsopplysning D05» under «Nytt innlegg» og trykk «Send innlegget».
8. Som Konto B: se at innlegget fra administratorene står med avsender «Administratorene i Testmiljø D04», og at det interne notatet ikke vises.
9. Som Konto A: trykk «Lukk saken». Se vinduet «Lukke saken?» med feltet «Avslutningsmelding til partene». Trykk «Lukk saken» med tomt felt og se at feltet må fylles ut.
10. Skriv «Saken er vurdert og lukket (test D05)» og trykk «Lukk saken». Se meldingen «Saken er lukket».
11. Som Konto A: åpne «Historikk» og se linjene «[A] tok saken», «[A] ba [B] om et nytt innlegg» og «[A] lukket saken», med tidspunkt.
12. Som Konto B: se varselet «En sak du er med i er lukket». Åpne saken og se statusen «Saken er lukket», avslutningsmeldingen som siste innlegg, og at det ikke er noe felt for å skrive mer.
13. Som Konto D: se at det fortsatt ikke er noen sak eller noe varsel om rapporten under «Konto» → «Saker» og «Varsler».

**Testen er bestått når**

- B så statusen gå fra «Venter på administratorene» til «En administrator har saken» og til «Saken er lukket».
- B så aldri navnet til A eller det interne notatet.
- Avslutningsmeldingen kom som siste innlegg hos B, og B kunne ikke skrive mer.
- «Historikk» viste at saken ble tatt, at B ble bedt om innlegg og at saken ble lukket, med navn og tid.
- Konto D så ingenting av saken.

### D06 – Mekling der partene sier ulike ting: administratoren ser bare det partene sender inn

**Prioritet:** U · **Fase:** 4

**Forventet resultat:** Administratoren ser partenes forklaringer og bare de chatmeldingene en part selv har valgt å sende inn, aldri resten av den private chatten. Partene ser ikke hverandres forklaring før administratoren deler dem.

**Før du starter**

- Egne testkontoer og testting; hendelsene er fiktive.
- Konto A er eneste administrator av «Testmiljø D06» og er ikke part i lånet.
- Konto B (utlåner) og Konto D (låntaker) er medlemmer og venner, har aktivert privat chat (K06) og har sendt hverandre minst tre meldinger (K07): «Testmelding 1: hentes fredag», «Testmelding 2: skal ikke sendes inn» og «Testmelding 3: skal ikke sendes inn».
- B har publisert «Lånetest stige D06» i miljøet. D har bedt om å låne den fra miljøets side (som i L02), og B har godkjent, slik at lånet venter på overlevering.
- Tre enheter eller nettlesere. D må bruke en enhet der den private chatten er åpnet.

**Slik gjør du det**

1. Som Konto B: åpne lånet under «Lån» og trykk «[D] har fått Lånetest stige D06».
2. Som Konto D: åpne lånet og trykk «Overleveringen skjedde ikke». Se at lånet nå viser at dere har sagt ulike ting.
3. Som Konto B: på lånesiden, trykk «Be miljøet om hjelp til å avklare». Skriv «Forklaring B (fiktiv): D hentet stigen fredag» i «Hva har skjedd?» og trykk «Be om mekling». Se «Miljøets administratorer er bedt om å mekle.»
4. Som Konto D: åpne saken «Mekling om Lånetest stige D06» via «Konto» → «Saker». Under «Din forklaring», trykk «Legg ved meldinger fra en privat samtale».
5. På siden «Send inn meldinger»: velg B i «Samtale», kryss av bare for «Testmelding 1: hentes fredag», skriv «Forklaring D (fiktiv): Jeg har aldri fått stigen» i «Innlegg» og trykk «Send inn 1 melding».
6. Som Konto B: åpne saken. Se at din egen forklaring har teksten «[D] ser ikke dette før administratoren deler forklaringene», og at D sin forklaring ikke vises.
7. Som Konto A: gå til «Hjem» → «Mekle om 1 lån» under «Testmiljø D06», åpne «Mekling om Lånetest stige D06» og trykk «Ta saken».
8. Som Konto A: se begge forklaringene, merket «Ikke delt med den andre parten ennå». Åpne «1 privat melding sendt inn» ved D sin forklaring: bare «Testmelding 1: hentes fredag» står der, med teksten «En kopi parten selv valgte å sende inn. …».
9. Som Konto A: søk med nettleserens «Finn på siden» etter «Testmelding 2» og «Testmelding 3» og se at det ikke er treff. Åpne «Samtaler» og se at A ikke har noen samtale mellom B og D.
10. Som Konto A: trykk «Del forklaringene med partene» og bekreft med «Del forklaringene».
11. Som Konto B og Konto D: åpne saken og se at hver nå ser den andres forklaring.
12. Som Konto A: trykk «Lukk saken», skriv «Meklingen er avsluttet (test D06). Partene avklarer lånet selv.» i «Avslutningsmelding til partene» og trykk «Lukk saken».
13. Som Konto B: åpne lånet. Se «Miljøets administratorer har avsluttet meklingen.», og at lånet fortsatt viser at dere har sagt ulike ting.

**Testen er bestått når**

- A så bare de to forklaringene og den ene innsendte meldingen, aldri «Testmelding 2», «Testmelding 3» eller resten av chatten.
- Den innsendte meldingen var merket som en kopi parten selv valgte å sende inn.
- Før A delte forklaringene, så ingen av partene den andres forklaring; etterpå så begge den.
- Lukkingen av saken endret ikke lånets status.

### D07 – En rapportert administrator skal verken se eller behandle saken om seg selv

**Prioritet:** U · **Fase:** 4

**Forventet resultat:** Saken skjules for administratoren som er rapportert, og behandles av en annen administrator. En administrator som erklærer seg inhabil, mister saken for godt.

**Før du starter**

- Egne testkontoer; rapporten er fiktiv.
- «Testmiljø D07» med Konto A som eier og administrator, og Konto D som andre administrator (A inviterer D under «Administrer miljøet» → «Roller og eierskap» → «Inviter som administrator», og D trykker «Bli administrator», som i M09).
- Konto B er vanlig medlem.
- Tre enheter eller nettlesere.

**Slik gjør du det**

1. Som Konto B: åpne miljøets side, trykk på navnet til A under «Eier», og trykk «Flere valg» → «Rapporter [A]». Se at «Administratorene i Testmiljø D07» er valgt under «Hvem skal vurdere det?».
2. Skriv «Fiktiv testrapport D07 om administrator» i «Hva har skjedd» og trykk «Send rapporten til administratorene». Kopier adressen til saken fra adressefeltet.
3. Som Konto A: se at «Hjem» ikke har noen «Vurder 1 rapport» for «Testmiljø D07». Gå til «Konto» → «Saker» → «Saker i Testmiljø D07» og se «Ingen saker venter nå.» og teksten «Køen viser ikke saker der du selv er part eller rapportert, og sier ikke at de finnes.»
4. Som Konto A: lim adressen fra steg 2 inn i adressefeltet. Se «Finnes ikke».
5. Som Konto D: gå til «Hjem» → «Vurder 1 rapport» og se «Rapport om [A]» under «Ingen har tatt». Åpne den og trykk «Ta saken». Se «Du har saken».
6. Som Konto B: åpne saken og se statusen «En administrator har saken».
7. Som Konto D: trykk «Flere valg» → «Erklær deg inhabil». Les under «Dette forsvinner»: «Du kan ikke behandle denne saken igjen, og du ser den ikke lenger.» Trykk «Erklær meg inhabil».
8. Som Konto D: se at du havner på «Saker» for miljøet, og at saken ikke står der. Lim inn adressen fra steg 2 og se «Finnes ikke».
9. Som Konto B: last saken på nytt. Se «Står på vent» og «Ingen kan behandle saken nå».
10. Som Konto A: se at A fortsatt ikke har noen oppgave eller sak om rapporten.

**Testen er bestått når**

- A, som er rapportert, så aldri saken: ingen oppgave, tom kø og «Finnes ikke» på saken.
- D kunne ta saken så lenge D ikke var inhabil.
- Etter «Erklær meg inhabil» mistet D saken og fikk «Finnes ikke» på den.
- B så aldri hvem av administratorene som hadde saken, og så «Står på vent» da ingen kunne behandle den.

### D08 – Avvis en ting og fjern et medlem i ett miljø, med begrunnelse som bare gjelder der

**Prioritet:** U · **Fase:** 4

**Forventet resultat:** Tiltaket gjelder bare i det ene miljøet. Den som rammes, får beskjed med begrunnelse uten å få vite hvem som rapporterte, og administratorene ser hva som ble gjort, av hvem og når.

**Før du starter**

- Egne testkontoer og testting; hendelsene er fiktive.
- «Testmiljø D08» med Konto A som eneste administrator, og Konto B og Konto D som vanlige medlemmer.
- Konto D har i tillegg opprettet sitt eget miljø «D sitt testmiljø D08» og publisert testtingen «Testdrill D08» både der og i «Testmiljø D08».
- Tre enheter eller nettlesere.

**Slik gjør du det**

1. Som Konto B: åpne «Testdrill D08» fra tinglisten i «Testmiljø D08», trykk «Flere valg» → «Rapporter tingen», skriv «Fiktiv testrapport D08» i «Hva har skjedd» og trykk «Send rapporten til administratorene».
2. Som Konto A: gå til «Hjem» → «Vurder 1 rapport», åpne «Rapport om «Testdrill D08»» og trykk «Ta saken».
3. Under «Tiltak i miljøet»: velg «Avvis publiseringen» (med teksten «Tingen vises ikke i miljøet. Eieren kan publisere den på nytt.»). Skriv «Fiktiv test D08: tingen passer ikke i miljøet» i «Begrunnelse» og trykk «Avvis publiseringen i Testmiljø D08». Se «Tiltaket er gjennomført».
4. Som Konto A: se seksjonen «Tiltak» med «Avvis publiseringen i Testmiljø D08», navnet ditt, tidspunkt og begrunnelsen. Åpne «Historikk» og se «[A] gjennomførte tiltaket «Avvis publiseringen»».
5. Som Konto D: åpne «Varsler» og trykk på «Publiseringen av tingen din er avvist i et miljø». Se «Publiseringen er avvist i Testmiljø D08», teksten «Tingen vises ikke i Testmiljø D08. Du kan publisere den der på nytt. Andre steder gjelder det ikke, …», «Begrunnelse:» med teksten fra steg 3 og knappen «Be om ny vurdering». Se at det ikke står noe om en rapport eller om B.
6. Som Konto D: trykk «Gå til tingen». Under «Hvor den vises» skal «Testmiljø D08» ha «Avvist av administratorene» og «D sitt testmiljø D08» ha «Synlig for medlemmene».
7. Som Konto A: trykk «Lukk saken», skriv «Saken er vurdert (test D08)» i «Avslutningsmelding til partene» og trykk «Lukk saken».
8. Som Konto A: gå til «Administrer miljøet» → «Medlemmer» og trykk «Fjern fra miljøet» ved D.
9. I vinduet «Fjerne [D] fra miljøet?»: skriv «Fiktiv test D08: fjernes fra testmiljøet» i «Begrunnelse», la «Steng [D] også ute fra nye forsøk» stå uten kryss, og trykk «Fjern [D] fra miljøet».
10. Som Konto D: åpne «Varsler» og trykk «Medlemskapet ditt i et miljø er avsluttet». Se «Medlemskapet ditt i Testmiljø D08 er avsluttet», begrunnelsen fra steg 9 og «Be om ny vurdering», og at det ikke står noe om hvem som rapporterte.
11. Som Konto D: gå til «Hjem» → «Dine miljøer». Se at «D sitt testmiljø D08» fortsatt er der, og at «Testdrill D08» fortsatt vises i det miljøet.

**Testen er bestått når**

- Begge tiltakene krevde begrunnelse, og begrunnelsen ble vist til D.
- Beskjedene til D nevnte verken B eller at det fantes en rapport.
- Tiltakene gjaldt bare «Testmiljø D08»: tingen var fortsatt synlig i «D sitt testmiljø D08», og D var fortsatt med der.
- I saken så A tiltaket med hvem, når og hvorfor under «Tiltak» og i «Historikk».

### D09 – En sak i et miljø der ingen administrator kan behandle den, blir liggende og vente

**Prioritet:** U · **Fase:** 4

**Forventet resultat:** Når eneste administrator selv er rapportert, står saken på vent og sier det tydelig. Den sendes ikke videre til Lånbort eller noen andre, og blir først behandlet når en ny administrator finnes.

**Før du starter**

- Egne testkontoer; rapporten er fiktiv.
- «Testmiljø D09» med Konto A som eneste eier og administrator, og Konto B og Konto D som vanlige medlemmer.
- Tre enheter eller nettlesere.

**Slik gjør du det**

1. Som Konto B: åpne miljøets side, trykk på navnet til A under «Eier», og trykk «Flere valg» → «Rapporter [A]». Skriv «Fiktiv testrapport D09» i «Hva har skjedd» og trykk «Send rapporten til administratorene».
2. Som Konto B: se at saken viser «Står på vent», «Ingen kan behandle saken nå» og «Det finnes ingen i Testmiljø D09 som kan ta saken akkurat nå. Den blir liggende trygt til noen kan, og du får beskjed da.»
3. Som Konto B: se at ingenting på siden sier at saken er sendt til Lånbort eller andre, og at «Flere valg» bare har «Trekk rapporten».
4. Som Konto A: se at «Hjem» ikke har noen rapportoppgave, at «Varsler» ikke har noe om en sak, og at «Konto» → «Saker» → «Saker i Testmiljø D09» viser «Ingen saker venter nå.»
5. Som Konto A: gå til «Administrer miljøet» → «Roller og eierskap», velg D i «Medlem» under «Inviter en administrator» og trykk «Inviter som administrator».
6. Som Konto D: åpne miljøets side og trykk «Bli administrator».
7. Som Konto D: gå til «Hjem» og se «Vurder 1 rapport» på kortet for «Testmiljø D09». Åpne køen og se «Rapport om [A]» under «Ingen har tatt».
8. Som Konto B: last saken på nytt og se at statusen nå er «Venter på administratorene».
9. Rydd opp: som Konto D, åpne saken, trykk «Ta saken», deretter «Lukk saken», skriv «Testen er ferdig (D09)» i «Avslutningsmelding til partene» og trykk «Lukk saken».

**Testen er bestått når**

- Så lenge A var eneste administrator, så B «Står på vent» og «Ingen kan behandle saken nå», og A så ingenting av saken.
- Ingenting viste at saken ble sendt til Lånbort eller noen andre.
- Da D ble administrator, dukket saken opp hos D, og B sin status ble «Venter på administratorene».

### D10 – Sjekk at Lånbort ikke kan behandle saker eller gripe inn under piloten

**Prioritet:** B · **Fase:** 0

**Forventet resultat:** Ingen sider eller knapper for Lånbort sin egen saksbehandling er i bruk. Der appen nevner Lånbort som mottaker, står det tydelig at det ikke er tilgjengelig ennå.

**Før du starter**

- Produkteierens konto i produksjon, helst en konto som også er satt opp som plattformforvalter.
- En venn av produkteieren som produkteieren ikke deler noe miljø med (lag eventuelt et vennskap med en testkonto).
- Konto A som er administrator og har tatt en åpen rapport i sitt miljø (f.eks. fra D04 før den lukkes).
- PC eller mobil.

**Slik gjør du det**

1. Som produkteier: gå til «Hjem». Se at det ikke finnes noen seksjon «For Lånbort» eller noe kort «Forvaltning».
2. Gå til «Konto» → «Saker». Se at det ikke finnes noen rad «Plattformkøen»; det står bare egne saker og eventuelt «Saker du kan behandle» for egne miljøer.
3. I nettleserens adressefelt: behold begynnelsen av adressen (nettstedets navn) og bytt ut resten med «/forvaltning». Se «Finnes ikke». Gjør det samme med «/forvaltning/ko».
4. Åpne siden til vennen du ikke deler miljø med, og trykk «Flere valg». Se at det ikke finnes noen «Si fra om mulig dødsfall».
5. Trykk «Rapporter [navn]». Se merket «Ikke tilgjengelig ennå», overskriften «Du kan ikke rapportere til Lånbort ennå», og at det ikke finnes noen knapp for å sende.
6. Åpne en ting i et miljø du er medlem av (ikke din egen) og trykk «Flere valg» → «Rapporter tingen». Se at «Lånbort» under «Hvem skal vurdere det?» er grå med «Ikke tilgjengelig ennå. Lånbort kan ikke ta imot rapporter i appen ennå.» Ikke send rapporten.
7. Som Konto A: åpne den åpne rapporten A har tatt, og trykk «Flere valg». Se at «Send videre til Lånbort» bare står som tekst med «Ikke tilgjengelig ennå. Lånbort kan ikke ta imot rapporter i appen ennå.», uten knapp.

**Testen er bestått når**

- Ingen «For Lånbort», «Forvaltning» eller «Plattformkøen» vises noe sted, og sidene for forvaltning viser «Finnes ikke».
- Alle steder der Lånbort er nevnt som mottaker, står det «Ikke tilgjengelig ennå», og ingenting kan sendes dit.
- «Si fra om mulig dødsfall» vises ikke.

## S – Personvern, kontolivssyklus og robusthet (9)

| ID | Prioritet | Fase | Testhandling | Forventet resultat |
| --- | :---: | :---: | --- | --- |
| S01 | B | 1 | Sjekk at en utenforstående ikke finner skjulte miljøer, ting eller samtaler | Den utenforstående finner ingenting av det skjulte, verken ved å søke eller ved å åpne adressene direkte. Sidene sier «Finnes ikke» eller er tomme, uten navn, ting, medlemmer eller meldinger. |
| S02 | O | 0 | Finn personvernsiden i appen, og sjekk at den er forståelig og at kontaktadressen virker | Siden «Personvern og sikkerhet» er lett å finne og lett å forstå, og opplysningene der stemmer med hvordan Lånbort faktisk drives. En e-post til kontaktadressen kommer fram til produkteieren. |
| S03 | O | 1 | Bruk samme konto på mobil og PC, og logg inn og ut i flere nettlesere | Kontoen ser lik ut uansett hvor du logger inn, og utlogging på én enhet logger ikke ut de andre. En ny enhet får ikke se de private samtalene før den er koblet til. |
| S04 | U | 4 | Sjekk at dobbelttrykk eller nettbrudd ikke gir doble forespørsler eller doble lån | Uansett hvor mange ganger man trykker, eller om nettet faller ut midt i, blir det bare én forespørsel og ett lån. Appen sier fra når den ikke vet om noe kom fram, og det man har fylt ut, går ikke tapt. |
| S05 | U | 4 | Deaktiver en testkonto som har et pågående lån, og se hva den fortsatt kan gjøre | Etter deaktivering kan kontoen ikke starte noe nytt, og andre ser ikke lenger tingene og siden dens. Den kan fortsatt fullføre lånet den er midt i, og den kan tas i bruk igjen. |
| S06 | U | 4 | Slett en testkonto uten uavsluttede lån, og sjekk hva som forsvinner og hva som består | Kontoen slettes etter en ny kode på e-post. Navn, profil, ting og vennskap forsvinner, felles lånehistorikk står igjen med «Tidligere bruker» i stedet for navnet, og adressen kan ikke lenger logge inn. |
| S07 | U | 4 | Prøv å slette en testkonto som har et avtalt lån, og se at lånet ikke forsvinner | Appen lar ikke kontoen slettes så lenge et lån ikke er avsluttet, og sier hva som må avsluttes først, også når lånet blir avtalt mens slettingen pågår. Lånet og motpartens historikk står urørt. |
| S08 | U | 4 | Sjekk at tidligere venner og medlemmer ikke lenger ser det de har mistet tilgang til | Etter at en ting er slettet, et vennskap er avsluttet eller et miljø er avviklet, ser de som var med fortsatt sin egen historikk, som avsluttede lån. Det de ikke lenger har rett til, og alt for utenforstående, viser «Finnes ikke». |
| S09 | B | 0 | Sjekk at feil oppdages og varsles, at backupene går, og at ingen persondata lekker | Feil i appen kan finnes igjen i loggene, og produkteieren får e-post når en publisering eller en backup feiler. Backupene tas hver natt og gjenopprettingen øves, og verken loggene eller det offentlige repoet inneholder navn, e-postadresser eller andre personopplysninger. |

### S01 – Sjekk at en utenforstående ikke finner skjulte miljøer, ting eller samtaler

**Prioritet:** B · **Fase:** 1

**Forventet resultat:** Den utenforstående finner ingenting av det skjulte, verken ved å søke eller ved å åpne adressene direkte. Sidene sier «Finnes ikke» eller er tomme, uten navn, ting, medlemmer eller meldinger.

**Før du starter**

- Konto A eier et skjult testmiljø, for eksempel «Testmiljø Skjult» (opprettet med valget «Skjult miljø» under «Hvem kan finne og bli med?»), og Konto B er medlem der (se M05 og M06).
- Konto A har en testting, for eksempel «Lånetest skjult drill», som bare er publisert i «Testmiljø Skjult», ikke for venner (se T05).
- Konto A og Konto B har en privat samtale med minst én melding (se K07) og et lån eller en forespørsel mellom seg (se L01 eller L02).
- Konto C er invitert og registrert, men er ikke venn med A eller B og ikke medlem i testmiljøet. Bruk én enhet for Konto A og en annen enhet (eller en privat nettleserfane) for Konto C.
- Ha et sted å lime inn adresser underveis, for eksempel et notat eller en e-post til deg selv.

**Slik gjør du det**

1. Logg inn som Konto A. Åpne «Testmiljø Skjult» fra «Hjem». Kopier adressen i nettleserens adressefelt, og lim den inn i notatet merket «miljø».
2. Som Konto A: trykk «Administrer miljøet» og deretter «Medlemmer». Kopier adressen og lagre den som «medlemsliste».
3. Som Konto A: åpne «Lånetest skjult drill» under «Mine ting». Kopier adressen og lagre den som «ting».
4. Som Konto A: åpne lånet eller forespørselen med Konto B under «Lån», og lagre adressen som «lån». Åpne samtalen med Konto B under «Samtaler», og lagre adressen som «samtale». Trykk på navnet til Konto B øverst i samtalen, og lagre adressen til Konto Bs side som «person».
5. Logg inn som Konto C på den andre enheten. Gå til «Finn», velg «Miljøer», skriv «Testmiljø Skjult» i søkefeltet og trykk «Søk». Se om miljøet er blant treffene.
6. Som Konto C: velg «Ting» i «Finn», skriv «skjult drill» i feltet «Hva leter du etter?» og trykk «Søk». Se om tingen er blant treffene.
7. Som Konto C: lim inn adressen «miljø» i adressefeltet og åpne den. Noter hva siden viser.
8. Som Konto C: gjør det samme med adressene «medlemsliste», «ting», «lån» og «person», én om gangen. Noter hva hver side viser.
9. Som Konto C: åpne adressen «samtale». Se etter om siden viser navnet til A eller B, noen meldinger eller et felt å skrive i.
10. Som Konto C: ta adressen «ting», bytt ut det aller siste tegnet med et annet tall eller en annen bokstav, og åpne den. Sammenlign siden med det du så i steg 8.
11. Som Konto C: åpne «Hjem» og «Varsler», og se etter om noe der nevner testmiljøet, testtingen, Konto A eller Konto B.

**Testen er bestått når**

- Søk i «Finn», både under «Miljøer» og «Ting», ga ingen treff på testmiljøet eller testtingen for Konto C.
- Adressene til miljøet, medlemslisten, tingen, lånet og Konto Bs side viste alle siden «Finnes ikke» med teksten «Denne siden finnes ikke, eller du har ikke tilgang til den.»
- Samtaleadressen viste verken navn, meldinger eller skrivefelt for Konto C.
- Den påfunne adressen i steg 10 så nøyaktig lik ut som de ekte adressene, så Konto C ikke kan skille noe som finnes fra noe som ikke finnes.
- Ingenting om testmiljøet, testtingen, Konto A eller Konto B dukket opp i Konto Cs «Hjem» eller «Varsler».

### S02 – Finn personvernsiden i appen, og sjekk at den er forståelig og at kontaktadressen virker

**Prioritet:** O · **Fase:** 0

**Forventet resultat:** Siden «Personvern og sikkerhet» er lett å finne og lett å forstå, og opplysningene der stemmer med hvordan Lånbort faktisk drives. En e-post til kontaktadressen kommer fram til produkteieren.

**Før du starter**

- Konto A: en vanlig pilotdeltaker som er logget inn, helst en som ikke kjenner teknikken bak Lånbort.
- Produkteier har tilgang til innboksen som sikkerhet@lånbort.no sendes videre til.
- En annen e-postadresse enn produkteierens egen å sende testen fra, for eksempel deltakerens. E-post man sender til seg selv gjennom videresending, vises ofte ikke i innboksen.

**Slik gjør du det**

1. Logg inn som Konto A. Trykk på profilbildet ditt øverst for å åpne «Konto». Finn «Personvern og sikkerhet» under «Annet» uten hjelp, og noter om det var lett å finne.
2. Trykk «Personvern og sikkerhet». Se at siden har disse overskriftene: «Si fra om noe alvorlig», «Innlogging», «Hvem som har ansvaret», «Hva Lånbort lagrer, og hvor lenge», «Hvem som behandler opplysningene for Lånbort» og «Rettighetene dine».
3. Under «Si fra om noe alvorlig»: se om det står e-postadressen sikkerhet@lånbort.no, eller bare «si fra til den som inviterte deg til piloten».
4. Under «Hvem som har ansvaret»: se om det står navnet på den som driver Lånbort, eller bare «Den som driver Lånbort».
5. Les «Hva Lånbort lagrer, og hvor lenge». Se at det står at varsler lagres i 180 dager, at svar du ga for å bli med i et miljø lagres til 90 dager etter at du gikk ut, og at backuper lagres i 7 dager.
6. Produkteier: sammenlign listen under «Hvem som behandler opplysningene for Lånbort» (Supabase, Vercel, Resend og ImprovMX) med tjenestene Lånbort faktisk bruker. Noter om noe mangler eller er feil.
7. Trykk på e-postadressen under «Si fra om noe alvorlig». Se at e-postprogrammet åpner en ny e-post til adressen. Send fra en annen adresse enn produkteierens en e-post med emnet «Test S02 kontaktkanal» og teksten «Dette er en test, ingen hendelse».
8. Produkteier: sjekk innboksen. Se om e-posten kommer innen 15 minutter, og svar avsenderen kort at den er mottatt.
9. Under «Rettighetene dine»: trykk «Kontoen din» og se at du kommer til siden der kontoen kan deaktiveres og slettes. Gå tilbake, trykk «Datatilsynet» og se at Datatilsynets nettside åpnes.
10. Spør deltakeren, uten at siden vises på nytt: «Hvor sier du fra hvis noen har kommet inn på kontoen din?», «Hvor lenge lagres varslene dine?» og «Hvor sletter du kontoen din?». Noter svarene.

**Testen er bestått når**

- Deltakeren fant «Personvern og sikkerhet» under «Konto» uten hjelp.
- Siden viste kontaktadressen sikkerhet@lånbort.no og navnet på den som driver Lånbort.
- Testmeldingen til kontaktadressen kom fram til produkteierens innboks innen 15 minutter.
- Tidene på siden (180 dager, 90 dager, 7 dager) og listen over leverandører stemte med det produkteieren vet om driften.
- Deltakeren svarte riktig på minst to av de tre spørsmålene i det siste steget (sikkerhet@lånbort.no, 180 dager, under «Kontoen din»).
- Lenkene «Kontoen din» og «Datatilsynet» virket.

### S03 – Bruk samme konto på mobil og PC, og logg inn og ut i flere nettlesere

**Prioritet:** O · **Fase:** 1

**Forventet resultat:** Kontoen ser lik ut uansett hvor du logger inn, og utlogging på én enhet logger ikke ut de andre. En ny enhet får ikke se de private samtalene før den er koblet til.

**Før du starter**

- Konto A med noe innhold: navn, minst én venn, minst én ting under «Mine ting» og minst ett lån eller én forespørsel under «Lån».
- Privat chat er slått på for Konto A på mobilen (se K06). Har Konto A ikke privat chat, hopp over steg 6, 7 og 11.
- En mobil og en PC. På PC-en trengs to ulike nettlesere (for eksempel Chrome og Firefox eller Edge), eller én vanlig og én privat fane.
- Tilgang til e-postinnboksen til Konto A for innloggingskodene.

**Slik gjør du det**

1. På mobilen, innlogget som Konto A: åpne «Konto». Noter navnet, tallet ved «Venner» og at det står «Aktiv» ved «Kontoen din». Åpne «Mine ting» og «Lån», og noter hva som står der.
2. På PC-en, i nettleser 1: gå til www.lånbort.no. Skriv e-postadressen til Konto A i «E-postadresse» og trykk «Send kode». Skriv koden fra e-posten i «Kode fra e-posten» og trykk «Bekreft». Se at du kommer rett til «Hjem» uten å måtte registrere deg på nytt.
3. På PC-en: åpne «Konto», «Mine ting» og «Lån». Se om navn, antall venner, ting og lån er de samme som du noterte på mobilen.
4. På PC-en: åpne «Konto» › «Varslingsvalg» og skru av én bryter, for eksempel en «På e-post». Åpne «Varslingsvalg» på mobilen (last siden på nytt) og se om samme bryter er av der også. Skru den på igjen etterpå.
5. På PC-en: åpne «Konto» › «Utseende» og velg «Mørkt». Se at mobilen ikke bytter farge, fordi dette valget bare gjelder enheten det gjøres på. Sett det tilbake etterpå.
6. På PC-en: åpne «Samtaler». Se at PC-en ikke viser samtalene dine, men tilbyr å koble til enheten («Koble til denne enheten»). Ikke koble til nå.
7. På mobilen: åpne «Konto» › «Mine enheter». Se at bare mobilen (merket «Denne enheten») står under «Disse kan lese samtalene dine», og ikke PC-en.
8. På PC-en, i nettleser 2: logg inn som Konto A på samme måte som i steg 2. Se at du også her kommer til «Hjem» med samme innhold.
9. I nettleser 1 på PC-en: åpne «Konto» og trykk «Logg ut». Se at du kommer til innloggingssiden. Last siden på nytt og se at du fortsatt er logget ut.
10. I nettleser 2 på PC-en og på mobilen: last siden på nytt. Se om begge fortsatt er innlogget som Konto A.
11. På mobilen: åpne «Konto» og trykk «Logg ut». Se at siden «Logge ut av denne enheten?» forklarer hva mobilen mister (privat chat og samtalene som er lagret der). Trykk «Avbryt», så du ikke mister chatten.
12. I nettleser 1 på PC-en: logg inn igjen som Konto A. Se om navn, venner, ting og lån fortsatt er de samme.

**Testen er bestått når**

- Innlogging med kode virket i alle nettleserne og ledet rett til «Hjem» uten ny registrering.
- Navn, venner, «Mine ting» og «Lån» var like på mobilen og i begge nettleserne på PC-en, også etter utlogging og ny innlogging.
- Endringen i «Varslingsvalg» på PC-en viste seg på mobilen, mens «Utseende» bare endret seg på enheten der det ble valgt.
- Utlogging i én nettleser logget ikke ut de andre.
- PC-en fikk ikke se samtalene uten å kobles til, og «Mine enheter» viste bare mobilen under «Disse kan lese samtalene dine».
- Mobilen sa hva den ville miste før utlogging, og ingenting ble logget ut da du trykket «Avbryt».

### S04 – Sjekk at dobbelttrykk eller nettbrudd ikke gir doble forespørsler eller doble lån

**Prioritet:** U · **Fase:** 4

**Forventet resultat:** Uansett hvor mange ganger man trykker, eller om nettet faller ut midt i, blir det bare én forespørsel og ett lån. Appen sier fra når den ikke vet om noe kom fram, og det man har fylt ut, går ikke tapt.

**Før du starter**

- Bruk testkontoer og testting; lånene er fiktive og kanselleres til slutt. Konto A (utlåner, helst på PC) og Konto B (låntaker, på mobil) er venner.
- Konto A har to ledige testting som er synlige for venner: «Lånetest drill» og «Lånetest stige» (se T01 og T05). Konto B har ingen åpne forespørsler om dem.
- Mobilen til Konto B må kunne settes i flymodus, og PC-en til Konto A må kunne kobles fra nettet (slå av Wi-Fi eller ta ut nettverkskabelen).

**Slik gjør du det**

1. Variant 1, dobbelttrykk: Som Konto B på mobilen: åpne «Konto» › «Venner», trykk på Konto A og deretter på «Lånetest drill». Trykk «Be om å låne», velg dager og trykk «Videre». Kryss av for «Jeg godtar ansvarserklæringen for dette lånet».
2. Trykk på knappen «Send forespørsel …» (den har datoene i seg) tre ganger så raskt du kan.
3. Som Konto B: åpne «Lån». Tell hvor mange forespørsler om «Lånetest drill» som står der.
4. Som Konto A: åpne «Lån» og «Varsler». Tell hvor mange forespørsler fra Konto B om «Lånetest drill» som står der, og hvor mange varsler om den du har fått.
5. Variant 2, uten nett: Som Konto B: start en forespørsel om «Lånetest stige» på samme måte, helt til knappen «Send forespørsel …» vises. Slå på flymodus. Se at appen sier «Du er uten nett. Det du har fylt ut, beholdes, men ingenting sendes før du er tilkoblet igjen.»
6. Trykk «Send forespørsel …». Se at appen sier «Fikk ikke svar fra Lånbort, så vi vet ikke om det kom fram. Det du har fylt ut er beholdt. Prøv igjen; det blir ikke gjort to ganger.», og at det du fylte ut, fortsatt står der.
7. Slå av flymodus og vent til mobilen har nett igjen. Trykk «Send forespørsel …» en gang til. Se at forespørselen sendes.
8. Som Konto B og som Konto A: åpne «Lån» og tell forespørslene om «Lånetest stige».
9. Variant 3, brudd under sending: Som Konto B: åpne forespørselen om «Lånetest stige» under «Lån», trykk «Flere valg» og «Trekk forespørselen», og bekreft med «Trekk forespørselen». Start så en ny forespørsel om «Lånetest stige». Trykk «Send forespørsel …» og slå på flymodus med en gang (innen et sekund).
10. Slå av flymodus. Står skjemaet fortsatt der, trykker du «Send forespørsel …» igjen. Noter hva appen sier; det kan være «Det du sendte før forbindelsen brøt, kom fram slik det var da. Sjekk at det ble som du ville før du sender igjen.» Åpne «Lån» som A og B, og tell de åpne forespørslene om «Lånetest stige».
11. Variant 4, dobbelttrykk ved godkjenning: Som Konto A på PC-en: åpne forespørselen om «Lånetest drill» under «Lån». Står det «Godta ansvarserklæringen», trykk den først. Trykk «Godkjenn lån …», og trykk så «Godkjenn lån …» i vinduet som åpnes tre ganger raskt.
12. Som Konto A og Konto B: åpne «Lån» og tell lånene av «Lånetest drill». Åpne lånet og se på tidslinjen hvor mange ganger godkjenningen står.
13. Variant 5, godkjenning uten nett: Som Konto A: åpne forespørselen om «Lånetest stige» og trykk «Godkjenn lån …». Koble PC-en fra nettet, og trykk «Godkjenn lån …» i vinduet. Se meldingen «Fikk ikke svar fra Lånbort, så vi vet ikke om det kom fram. …». Koble til nettet igjen og trykk «Godkjenn lån …» en gang til.
14. Som Konto A og Konto B: åpne «Lån» og tell lånene av «Lånetest stige». Åpne lånet og se på tidslinjen hvor mange ganger godkjenningen står.
15. Rydd opp: åpne hvert testlån, trykk «Kanseller lånet» og bekreft med «Kanseller lånet».

**Testen er bestått når**

- Etter tre raske trykk på «Send forespørsel …» fantes det nøyaktig én forespørsel om «Lånetest drill» hos både Konto A og Konto B, og Konto A fikk ett varsel om den.
- Uten nett viste appen meldingen om at den ikke vet om forespørselen kom fram, det utfylte sto fortsatt der, og nytt forsøk med nett ga én forespørsel om «Lånetest stige», ikke to.
- Da nettet ble brutt midt i sendingen, endte det med nøyaktig én åpen forespørsel om «Lånetest stige».
- Både raske gjentatte trykk og godkjenning uten nett ga nøyaktig ett lån per forespørsel, og tidslinjen viser godkjenningen bare én gang.
- Ingen side viste «Siden kunne ikke vises», og ingenting av det som var fylt ut, gikk tapt.

### S05 – Deaktiver en testkonto som har et pågående lån, og se hva den fortsatt kan gjøre

**Prioritet:** U · **Fase:** 4

**Forventet resultat:** Etter deaktivering kan kontoen ikke starte noe nytt, og andre ser ikke lenger tingene og siden dens. Den kan fortsatt fullføre lånet den er midt i, og den kan tas i bruk igjen.

**Før du starter**

- Bruk en egen testkonto som Konto B, for eksempel «Testkonto Deaktiver», invitert av produkteier. Alt er testdata.
- Konto A og Konto B er venner. Konto B har lånt «Lånetest stige» av Konto A, og overleveringen er bekreftet, så tingen er utlånt (se L09).
- Konto B har en forespørsel om å låne «Lånetest drill» av Konto A som venter på svar.
- Konto B eier alene en testting, for eksempel «Testkonto sag», som er synlig for venner. Konto A har lagret adressen til den tingen og adressen til Konto Bs side.
- To enheter, eller én vanlig og én privat nettleserfane: én for Konto A og én for Konto B.

**Slik gjør du det**

1. Logg inn som Konto B. Åpne «Konto» › «Kontoen din». Se at det står «Kontoen din er aktiv.» og at det finnes en del som heter «Deaktiver kontoen».
2. Les teksten under «Deaktiver kontoen», og trykk «Deaktiver kontoen». Knappen virker med en gang, uten ekstra spørsmål.
3. Se at siden nå sier «Kontoen din er deaktivert. Du kan fortsatt fullføre lån og saker du allerede er med i, og avvikle det du eier, men ikke starte noe nytt.», og at knappen «Ta kontoen i bruk igjen» vises. Gå til «Hjem» og se at samme beskjed står øverst, med lenken «Se hva du kan gjøre».
4. Som Konto B: gå til «Finn». Se at det står «Du kan ikke finne nye ting mens kontoen ikke er aktiv.»
5. Som Konto B: åpne «Mine ting». Se om det finnes en knapp for å registrere en ny ting.
6. Som Konto B: åpne «Lån». Se om forespørselen om «Lånetest drill» fortsatt venter på svar.
7. Som Konto A: åpne «Lån» og forespørselen fra Konto B om «Lånetest drill». Se om den fortsatt kan godkjennes.
8. Som Konto A: åpne den lagrede adressen til «Testkonto sag», og deretter adressen til Konto Bs side. Noter hva hver side viser.
9. Som Konto B: åpne lånet av «Lånetest stige» under «Lån». Trykk «Meld returnert». Se at det går, og at lånet nå venter på at Konto A bekrefter.
10. Som Konto A: åpne lånet og trykk «Jeg har fått tilbake Lånetest stige». Se at lånet avsluttes for begge.
11. Som Konto B: åpne «Konto» › «Kontoen din» og trykk «Ta kontoen i bruk igjen». Se at det står «Kontoen din er aktiv.» Åpne «Lån» og se om forespørselen om «Lånetest drill» har kommet tilbake.

**Testen er bestått når**

- Etter deaktiveringen viste appen at kontoen er deaktivert, «Finn» var stengt, og «Mine ting» hadde ingen knapp for å registrere nye ting.
- Den ventende forespørselen om «Lånetest drill» ble avsluttet, og Konto A kunne ikke lenger godkjenne den.
- Konto A fikk «Finnes ikke» på «Testkonto sag» og på Konto Bs side mens kontoen var deaktivert.
- Konto B kunne likevel melde retur på det pågående lånet, og Konto A kunne avslutte det.
- «Ta kontoen i bruk igjen» gjorde kontoen aktiv igjen, og den avsluttede forespørselen kom ikke tilbake av seg selv.

### S06 – Slett en testkonto uten uavsluttede lån, og sjekk hva som forsvinner og hva som består

**Prioritet:** U · **Fase:** 4

**Forventet resultat:** Kontoen slettes etter en ny kode på e-post. Navn, profil, ting og vennskap forsvinner, felles lånehistorikk står igjen med «Tidligere bruker» i stedet for navnet, og adressen kan ikke lenger logge inn.

**Før du starter**

- Bruk en egen testkonto som Konto B, for eksempel «Testkonto Slett», invitert av produkteier. Slettingen kan ikke angres, så bruk aldri en ekte deltakers konto.
- Konto A og Konto B er venner. Konto B har lånt en ting av Konto A og levert den tilbake, og lånet er avsluttet (se L12 og L13). Gjerne har Konto B også anmeldt lånet (se R01).
- Konto B eier alene en testting, «Testkonto sag», og er medlem i et testmiljø som Konto A administrerer. Konto B eier ikke selv noe miljø og har ingen pågående lån eller åpne saker.
- Konto A har lagret adressen til «Testkonto sag» og til Konto Bs side før testen.
- To enheter, eller én vanlig og én privat nettleserfane, og tilgang til e-postinnboksen til Konto B.

**Slik gjør du det**

1. Logg inn som Konto B. Åpne «Konto» › «Kontoen din». Se at delen «Slett kontoen» ikke har noen liste over noe som må avsluttes først.
2. Les avsnittene «Dette forsvinner:», «Dette består, uten navnet ditt:» og «Dette påvirker andre:», og teksten «Sletting kan ikke angres.»
3. Trykk «Slett kontoen». Se teksten «Vi har sendt en kode til e-postadressen din. Skriv den inn for å slette kontoen for godt.»
4. Hent koden i innboksen til Konto B, skriv den i «Kode fra e-posten» og trykk «Slett kontoen for godt». Se at du blir logget ut og ser innloggingssiden.
5. Som Konto A: åpne «Konto» › «Venner». Se om Konto B fortsatt står der.
6. Som Konto A: åpne de lagrede adressene til Konto Bs side og til «Testkonto sag». Noter hva hver side viser.
7. Som Konto A: åpne «Lån» › «Avsluttede lån» og lånet med Konto B. Se om lånet, tingen og datoene står som før, og hva motparten nå heter.
8. Som Konto A: åpne testmiljøet, trykk «Administrer miljøet» og «Medlemmer». Se om Konto B fortsatt står som medlem.
9. Hvis Konto B hadde anmeldt lånet: som Konto A, åpne «Konto» og trykk «Se din egen side». Se om anmeldelsen fortsatt står, og om Konto Bs navn vises noe sted.
10. Vent minst 10 minutter. Gå til www.lånbort.no på enheten til Konto B, skriv e-postadressen til den slettede kontoen og trykk «Send kode». Se at appen svarer «Er … invitert, har vi sendt en kode dit.», og følg med i innboksen i 10 minutter.
11. Produkteier (valgfritt): logg inn på supabase.com, åpne Lånbort-prosjektet, velg «Authentication» og «Users», og søk etter adressen. Se om den finnes. Ikke slett eller endre noe der.

**Testen er bestått når**

- Slettingen krevde en ny kode fra e-posten, og Konto B ble logget ut etterpå.
- Konto B var borte fra Konto As venneliste og fra miljøets medlemsliste, og Konto Bs side og «Testkonto sag» viste «Finnes ikke».
- Det avsluttede lånet sto fortsatt hos Konto A med samme ting og datoer, med «Tidligere bruker» der Konto Bs navn sto før.
- En eventuell anmeldelse fra Konto B sto fortsatt, uten Konto Bs navn.
- Ingen innloggingskode kom til den slettede adressen, og (hvis sjekket) adressen fantes ikke lenger under «Users» i Supabase.

### S07 – Prøv å slette en testkonto som har et avtalt lån, og se at lånet ikke forsvinner

**Prioritet:** U · **Fase:** 4

**Forventet resultat:** Appen lar ikke kontoen slettes så lenge et lån ikke er avsluttet, og sier hva som må avsluttes først, også når lånet blir avtalt mens slettingen pågår. Lånet og motpartens historikk står urørt.

**Før du starter**

- Bruk en egen testkonto som Konto B, for eksempel «Testkonto Binding», invitert av produkteier. Lånene er fiktive.
- Konto A og Konto B er venner. Konto A har godkjent at Konto B låner «Lånetest stige», og lånet er ikke avsluttet (se L04).
- Konto A har en annen ledig testting, «Lånetest drill», som er synlig for venner.
- To enheter, eller én vanlig og én privat nettleserfane, og tilgang til e-postinnboksen til Konto B.

**Slik gjør du det**

1. Logg inn som Konto B. Åpne «Konto» › «Kontoen din». Se at det under «Slett kontoen» står «Før kontoen kan slettes, må dette avsluttes:» med linjen «Et lån som ikke er avsluttet ennå», og se etter om det finnes en knapp «Slett kontoen».
2. Trykk på linjen «Et lån som ikke er avsluttet ennå». Se at den åpner lånet av «Lånetest stige».
3. Som Konto A: åpne «Lån». Se at lånet med Konto B står som før, med Konto Bs navn.
4. Avslutt lånet: er tingen ikke overlevert, trykker en av dere «Kanseller lånet» og bekrefter. Er den overlevert, trykker Konto B «Meld returnert» og Konto A «Jeg har fått tilbake Lånetest stige».
5. Som Konto B: åpne «Kontoen din» på nytt. Se at listen er borte og at knappen «Slett kontoen» nå vises. Ikke slett ennå.
6. Samtidig-variant: Som Konto B: åpne «Lånetest drill» (via «Konto» › «Venner» og Konto A), trykk «Be om å låne», velg dager og send med «Send forespørsel …».
7. Som Konto B: åpne «Konto» › «Kontoen din» og trykk «Slett kontoen». Vent til koden kommer på e-post, men ikke skriv den inn ennå.
8. Som Konto A: åpne forespørselen om «Lånetest drill» under «Lån». Står det «Godta ansvarserklæringen», trykk den først. Trykk «Godkjenn lån …», og trykk «Godkjenn lån …» i vinduet.
9. Som Konto B: skriv koden i «Kode fra e-posten» og trykk «Slett kontoen for godt». Les meldingen appen viser, og se om du fortsatt er innlogget.
10. Som Konto B: last siden på nytt. Se hva som står under «Slett kontoen».
11. Som Konto A: åpne «Lån». Se om lånet av «Lånetest drill» finnes, med Konto Bs navn.
12. Rydd opp: åpne lånet av «Lånetest drill», trykk «Kanseller lånet» og bekreft. Testkontoen kan deretter brukes i S06.

**Testen er bestått når**

- Så lenge et lån ikke var avsluttet, viste «Kontoen din» linjen «Et lån som ikke er avsluttet ennå», uten noen «Slett kontoen»-knapp, og linjen førte til riktig lån.
- Da lånet ble avtalt mens slettingen pågikk, ble kontoen ikke slettet: appen viste «Kontoen kan ikke slettes ennå. Last siden på nytt for å se hva som må avsluttes først.», og Konto B var fortsatt innlogget.
- Etter ny innlasting sto «Et lån som ikke er avsluttet ennå» i listen igjen.
- Konto A så begge lånene hele tiden, med Konto Bs navn, og ingenting forsvant.
- Når lånet var avsluttet, ble «Slett kontoen» tilgjengelig.

### S08 – Sjekk at tidligere venner og medlemmer ikke lenger ser det de har mistet tilgang til

**Prioritet:** U · **Fase:** 4

**Forventet resultat:** Etter at en ting er slettet, et vennskap er avsluttet eller et miljø er avviklet, ser de som var med fortsatt sin egen historikk, som avsluttede lån. Det de ikke lenger har rett til, og alt for utenforstående, viser «Finnes ikke».

**Før du starter**

- Bruk testting, et testmiljø og fiktive lån. Konto A (eier) og Konto B er venner, og Konto C er utenforstående uten relasjon til dem.
- Konto A har tre testting: «Slettetest drill», som Konto B har lånt og levert tilbake (avsluttet lån); «Lånetest stige», som bare er synlig for venner; og «Miljøtest sag», som bare er publisert i testmiljøet nedenfor.
- Konto A eier testmiljøet «Testmiljø Avvikling», og Konto B er medlem der.
- Før testen lagrer Konto B adressene til de tre tingene, til miljøet og til det avsluttede lånet av «Slettetest drill». Konto C får adressene til lånet og miljøet.
- Et miljø med andre medlemmer avvikles først når angrefristen på 7 dager er ute. Start del 3 tidlig, og fullfør den når fristen har gått.

**Slik gjør du det**

1. Del 1, slettet ting: Som Konto A: åpne «Slettetest drill» under «Mine ting», trykk «Flere valg» og «Slett tingen». Les vinduet, og trykk «Slett Slettetest drill».
2. Som Konto B: åpne den lagrede adressen til «Slettetest drill». Noter hva siden viser.
3. Som Konto B: åpne «Lån» › «Avsluttede lån» og lånet av «Slettetest drill». Se om lånet fortsatt vises med tingens navn og datoene.
4. Som Konto C: åpne den lagrede adressen til lånet. Noter hva siden viser.
5. Del 2, avsluttet vennskap: Som Konto B: åpne den lagrede adressen til «Lånetest stige». Se at tingen vises (kontroll før endringen).
6. Som Konto A: åpne Konto Bs side (via «Konto» › «Venner»), trykk «Flere valg» og «Fjern [navnet til Konto B] som venn», og bekreft i vinduet med samme knapp.
7. Som Konto B: åpne adressen til «Lånetest stige» på nytt. Noter hva siden viser.
8. Som Konto B: åpne «Lån» › «Avsluttede lån». Se om de tidligere lånene med Konto A fortsatt står der.
9. Del 3, avviklet miljø: Som Konto A: åpne «Testmiljø Avvikling», trykk «Administrer miljøet», så «Flere valg» og «Avvikle miljøet». Trykk «Send kode», skriv koden fra e-posten og trykk «Avvikle Testmiljø Avvikling». Noter datoen.
10. Som Konto B: åpne miljøet og se at det er merket «Avvikles». Når 7 dager har gått: se at lenken «Avviklede miljøer» står nederst på «Hjem», og at miljøet står der merket «Avviklet» med dato.
11. Som Konto B: åpne miljøet fra «Avviklede miljøer». Se teksten «Bare de som var medlemmer da det ble avviklet, finner det igjen …», og se etter om det finnes noen knapper for å gjøre noe nytt der.
12. Som Konto B: åpne den lagrede adressen til «Miljøtest sag». Noter hva siden viser.
13. Som Konto C: åpne den lagrede adressen til miljøet. Noter hva siden viser.

**Testen er bestått når**

- Den slettede tingen viste «Finnes ikke», mens Konto Bs avsluttede lån av den fortsatt viste tingens navn og datoene.
- Etter at vennskapet ble avsluttet, viste «Lånetest stige» «Finnes ikke» for Konto B, mens tidligere lån mellom A og B fortsatt sto under «Avsluttede lån».
- Det avviklede miljøet fantes for Konto B bare under «Avviklede miljøer», som en side uten noe nytt å gjøre, og miljøets ting viste «Finnes ikke».
- Konto C fikk «Finnes ikke» på både lånet og miljøet.

### S09 – Sjekk at feil oppdages og varsles, at backupene går, og at ingen persondata lekker

**Prioritet:** B · **Fase:** 0

**Forventet resultat:** Feil i appen kan finnes igjen i loggene, og produkteieren får e-post når en publisering eller en backup feiler. Backupene tas hver natt og gjenopprettingen øves, og verken loggene eller det offentlige repoet inneholder navn, e-postadresser eller andre personopplysninger.

**Før du starter**

- Produkteier, på PC, innlogget på vercel.com, supabase.com og github.com, med tilgang til både det offentlige repoet peohol/lanbort og det private backup-repoet.
- Tilgang til produkteierens e-postinnboks.
- Navnet på en testting, fornavnet til en testdeltaker og e-postadressen til en testkonto som er brukt i appen i dag, til søk i loggene. Ikke skriv inn passord, nøkler eller andre hemmeligheter noe sted under testen.
- Gjør steg 1–4 samme dag som du bruker appen: Vercel tar vare på loggene i bare 1 dag.

**Slik gjør du det**

1. Åpne en adresse som ikke finnes: www.lånbort.no/s09-loggtest. Se at Lånbort viser «Finnes ikke». Noter klokkeslettet.
2. Gå til vercel.com, åpne Lånbort-prosjektet og velg «Logs». Søk etter «s09-loggtest». Se om besøket fra steg 1 står der, med tidspunkt og status.
3. Fortsatt i «Logs»: søk etter e-postadressen til testkontoen, deretter etter fornavnet til testdeltakeren og etter navnet på testtingen. Noter om noen av søkene gir treff.
4. Fortsatt i «Logs»: vis bare feil (nivå «Error») for det siste døgnet. Les noen av linjene, og se om de bare har tekniske opplysninger (adresse i appen, status, varighet, feilkode) eller også navn, e-post eller meldingstekst. Noter hvor mange feil det var.
5. I Vercel: åpne «Deployments». Se at den nyeste produksjonsdeployen står som «Ready».
6. I Vercel: åpne «Settings», og velg «My Notifications» under «Account». Se om «Deployment Failures» er slått på for e-post.
7. Gå til github.com/peohol/lanbort og velg «Actions». Se om siste kjøring av «CI» på main er grønn.
8. I «Actions»: velg «Restore drill» i listen til venstre. Se om det finnes en grønn kjøring den siste måneden (den kjører den 1. i hver måned). Åpne den, og se om sammendraget under «Restore drill» sier hvor mange sekunder gjenopprettingen tok, med målet «target: 8 hours».
9. Åpne det private backup-repoet på GitHub. Under «Actions»: se om «Backup» kjørte i natt og er grønn. Under «Releases»: se om den nyeste er fra i natt, og at ingen er eldre enn 7 dager.
10. Gå til supabase.com, åpne Lånbort-prosjektet, velg «Database» og deretter «Backups». Se om det finnes daglige backuper for de siste 7 dagene, den nyeste fra i natt.
11. På GitHub: trykk på profilbildet ditt, velg «Settings» og «Notifications». Se om varsler for GitHub Actions sendes på e-post (gjerne bare for feilede kjøringer). Søk så i e-postinnboksen etter e-post fra GitHub og Vercel om feilede kjøringer eller deployer den siste måneden, og noter om noen ikke er fulgt opp.
12. På github.com/peohol/lanbort: skriv e-postadressen til testkontoen i søkefeltet øverst og søk i dette repoet. Gjør det samme med fornavnet til testdeltakeren. Se om det gir treff i koden, i «Issues» eller i «Pull requests».
13. Åpne www.lånbort.no/.well-known/security.txt. Se om linjen «Expires:» har en dato fram i tid (2027-10-01). Trykk lenken etter «Contact:», og se om GitHub åpner siden for å melde en sikkerhetsfeil privat.
14. Åpne dokumentet «Drift av den lukkede piloten» (docs/implementation/pilot-operations.md i repoet) og les delen «Alvorlige hendelser». Se at du vet hva du gjør først, og hvem som gjør resten.

**Testen er bestått når**

- Testbesøket fra steg 1 kunne finnes igjen i Vercels «Logs» samme dag.
- Søk etter testkontoens e-postadresse, deltakernavnet og testtingens navn ga ingen treff, verken i loggene eller i det offentlige repoet, og feillinjene inneholdt bare tekniske opplysninger.
- «Deployment Failures» er slått på for e-post i Vercel, GitHub sender e-post om feilede kjøringer, og ingen slik e-post fra den siste måneden står uten oppfølging.
- «CI» er grønn, «Restore drill» har en grønn kjøring den siste måneden med tid under 8 timer, «Backup» i det private repoet var grønn i natt med høyst 7 dager gamle releaser, og Supabase viser daglige backuper for de siste 7 dagene.
- security.txt har en utløpsdato fram i tid, og lenken fører til GitHubs side for private sikkerhetsmeldinger.
- Produkteier vet hvor fremgangsmåten for alvorlige hendelser står, og hva første steg er.
<!-- generert:pilot-tester slutt -->

## Dekning og sluttrapport

Katalogen inneholder **98 manuelle testpunkter** fordelt på åtte områder. Oppdater katalogen gjennom vanlig PR dersom funksjoner blir lagt til/fjernet. Ny ID skal ikke gjenbrukes. Den private journalen må skille mellom «prøvd og bestått», «prøvd og feilet», «blokkert», «ikke relevant» og «ikke prøvd».

Aggregert status (antall bestått/feilet/blokkert/ikke prøvd per område) kan offentliggjøres etter anonymisering. Ingen statistikk eller resultater foreligger ved opprettelsen av denne katalogen.
