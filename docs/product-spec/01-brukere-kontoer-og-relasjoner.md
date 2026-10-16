# Brukere, kontoer og relasjoner

> **Status:** Arbeidsversjon av produktspesifikasjonen.

### PS-USR-001 — Minstekrav for konto i pilot
**Forankring:** [Brukeridentitet og grunnkrav](../vision/02-brukere-roller-og-relasjoner.md)

En bruker må være minst 18 år og oppgi sitt virkelige navn. I den lukkede piloten er verifisert e-post og engangskode obligatorisk, og produkteieren godkjenner/verifiserer personlig alle deltakere. Vipps og betaling brukes ikke. Kravene for ordinær drift står i PS-USR-016–019; de aktiveres ikke under piloten.

### PS-USR-002 — Minimal profil
**Forankring:** [Profil og synlighet](../vision/02-brukere-roller-og-relasjoner.md)

Profilen skal minst ha virkelig navn. I ordinær drift er navnet hentet fra Vipps og ikke brukerredigerbart. Profilbilde og kort presentasjon kan være valgfrie. Hvert profilfelt som kan deles skal ha en eksplisitt synlighetsregel med minst nivåene **generelt**, **venner** og **bare meg**. Systemkritiske kontoopplysninger skal ikke gjøres til profilfelt bare fordi de finnes. Profilbildet vises som sirkel overalt der det vises, og brukeren beskjærer det i den samme sirkelen (OD-0027).

### PS-USR-003 — Vennskap krever gjensidig aksept
**Forankring:** [Vennskap](../vision/02-brukere-roller-og-relasjoner.md)

Vennskap oppstår først når en mottaker godtar en venneforespørsel. Én bruker kan ensidig avslutte vennskapet.

### PS-USR-004 — Direkte lån krever aktivt vennskap ved godkjenning
**Forankring:** VP-06; [Vennskap](../vision/02-brukere-roller-og-relasjoner.md)

Et direkte vennelån kan initieres mellom venner, fra et objekt eieren har gjort synlig for venner (PS-OBJ-020), men kan bare godkjennes dersom vennskapet fortsatt består. Opphør før godkjenning avslutter forespørselen. Opphør etter godkjenning endrer ikke lånet.

### PS-USR-005 — Ikke-venner kan bare initiere kontakt i legitim kontekst
**Forankring:** [Kontakt mellom brukere som ikke er venner](../vision/02-brukere-roller-og-relasjoner.md)

En bruker som ikke er venn med mottakeren kan ikke starte vilkårlig fri chat. Før videre samtale er akseptert kan kontakt bare skje gjennom en strukturert produktkontekst, for eksempel et synlig objekt eller en låneforespørsel.

### PS-USR-006 — Blokkering stanser ny sosial kontakt
**Forankring:** VP-11; [Blokkering](../vision/02-brukere-roller-og-relasjoner.md)

Blokkering avslutter vennskap og skal hindre ordinær oppdagelse, nye venneforespørsler, nye direktemeldinger og nye lån mellom partene. Den blokkerte varsles ikke eksplisitt om hvem som blokkerte.

### PS-USR-011 — Bare ny og godtatt venneforespørsel varsles
**Forankring:** [Vennskap](../vision/02-brukere-roller-og-relasjoner.md); OD-0028

Den andre får varsel når en venneforespørsel kommer og når den blir godtatt. Avslag, tilbaketrukket forespørsel og fjernet vennskap varsles ikke. Relasjonen oppdateres likevel for begge med en gang. Et varsel om en forespørsel som ikke lenger gjelder, gir ikke tilgang til handlinger som har falt bort; det sier at forespørselen ikke lenger gjelder, uten grunn (UX-IA-019).

### PS-USR-012 — Etter avslag må mottakeren ta neste initiativ
**Forankring:** [Vennskap](../vision/02-brukere-roller-og-relasjoner.md); PS-USR-003, PS-USR-011; OD-0029

Når en venneforespørsel avslås, kan avsenderen ikke sende en ny forespørsel til mottakeren før mottakeren selv har sendt en forespørsel til avsenderen. Mottakeren kan sende når som helst. Sperren består om en av dem blokkerer og senere opphever blokkeringen, og den gjelder ikke etter en tilbaketrukket forespørsel eller et fjernet vennskap.

Sperren vises nøytralt: avsenderen ser at de ikke er venner og at en forespørsel ikke kan sendes nå, men ingen status, tekst, kode eller felt sier at forespørselen ble avslått. Regelen håndheves på serveren; at handlingen mangler i brukerflaten, er ikke sperren.

### PS-USR-013 — Venneforespørsel og invitasjon på e-post
**Forankring:** [Vennskap](../vision/02-brukere-roller-og-relasjoner.md); PS-USR-003, PS-USR-006, PS-USR-011, PS-USR-012

En bruker kan skrive inn en e-postadresse under Konto › Venner og spørre om å bli venner. Har adressen en konto, får mottakeren en vanlig venneforespørsel i appen med varsel etter egne varslingsvalg (PS-USR-011). Har den ingen konto, gjelder forespørselen fra mottakeren registrerer seg med den bekreftede adressen. Mottakeren godtar eller avslår som ellers.

Avsenderen får samme bekreftelse uansett, og ser forespørselen bare som en invitasjon til adressen, aldri som en person, til den utløper etter 14 dager, trekkes tilbake eller blir et vennskap. Ingenting forteller avsenderen om adressen har konto, hva mottakeren har valgt om varsler, eller om forespørselen ble avslått eller stoppet av en blokkering. Blokkering i en av retningene og sperren etter avslag (PS-USR-012) gjelder: da blir det ingen forespørsel, uten at noen får vite det. Spør avsenderen samme person i appen eller med QR-kode, blir forespørselen synlig for avsenderen som en vanlig forespørsel.

Det kan bare være én åpen invitasjon per avsender og adresse, antallet per døgn er begrenset, og en invitasjon som trekkes tilbake eller utløper, tar med seg en forespørsel som fortsatt venter. Adressen og invitasjonen slettes 30 dager etter at den er avsluttet.

Etter overgang til Vipps skal en slik invitasjon alltid føre til **Vipps-registrering**, aldri opprettelse med e-postkode. Den inviterte må deretter påvise kontroll over invitasjonsadressen før en ventende venneforespørsel kan knyttes til kontoen, for eksempel gjennom verifisert e-postopplysning fra Vipps eller en særskilt tidsbegrenset bekreftelse av invitasjonen. Dette er ikke en alternativ måte å registrere seg på. Personvern- og blokkeringreglene over gjelder uendret.

### PS-USR-014 — Venneforespørsel med QR-kode
**Forankring:** [Vennskap](../vision/02-brukere-roller-og-relasjoner.md); PS-USR-003, PS-USR-006, PS-USR-012

En bruker kan vise en midlertidig QR-kode («Min QR-kode») som gjelder i fem minutter. Bare den nyeste koden virker. En annen innlogget bruker som skanner koden, eller skriver den inn der kameraet ikke kan brukes, ser bare personens navn og relasjonen mellom dem, og kan sende en venneforespørsel. Skanning gir aldri vennskap av seg selv; personen godtar eller avslår som vanlig.

Koden røper ikke e-postadresse eller noen fast identifikator, og serveren lagrer bare et fingeravtrykk av den. En kode som er utløpt, erstattet, ens egen eller tilhører noen som blokkerer den som skanner, gir det samme svaret som en kode som ikke finnes. Blokkering og sperren etter avslag gjelder som for andre forespørsler. QR-koden er atskilt fra kodene som kobler enheter til privat chat.

### PS-USR-015 — Invitasjon av nye deltakere i den lukkede piloten
**Forankring:** PS-USR-001, PS-NFR-015; OD-0056

Mens piloten er lukket, kan bare produkteierens konto invitere en adresse uten konto til Lånbort. Mottakeren får en e-post med avsenderens navn og en lenke til innloggingen, og kan logge inn med engangskode og registrere seg som vanlig, uten at noen lager brukeren manuelt. Valget «Spør også om å bli venner» er av som standard. Alle andre kan bare sende venneforespørsler på e-post til adresser som allerede har konto, og bruke QR-koden; en adresse uten konto får da ingenting.

Registreringen er fortsatt lukket for alle andre, og sperrene for privat chat i piloten (PS-COM-023) gjelder uendret. En invitasjon som trekkes tilbake eller utløper før den er tatt i bruk, fjerner adressen fra innloggingstjenesten igjen.

### PS-USR-016 — Bare Vipps kan registrere ordinære kontoer
**Forankring:** [Brukeridentitet og grunnkrav](../vision/02-brukere-roller-og-relasjoner.md)

Etter piloten skal opprettelse eller aktivering av ordinær konto kreve en fullført, serververifisert Vipps Logg inn-flyt og nødvendige identitetsopplysninger. Verken e-postkode, passord, passkey alene, invitasjon eller andre leverandører kan omgå dette. En Vipps-identitet skal kobles til høyst én aktiv konto ved sin stabile, leverandørspesifikke ID, ikke navn eller e-post. 18-årsgrensen gjelder. Ingen «identitet verifisert»-merker i UI: alle ordinære brukere er omfattet.

### PS-USR-017 — Låst navn med oppdatering fra Vipps
**Forankring:** [Brukeridentitet og grunnkrav](../vision/02-brukere-roller-og-relasjoner.md)

Fullt navn hentes fra Vipps og kan ikke endres av brukeren, heller ikke via API-et. Ved faktisk navneendring kan brukeren gjennomføre en ny Vipps-flyt for kontrollert, sporbar oppdatering. Navnet vises for legitime motparter innenfor personvernreglene; historiske navn offentliggjøres ikke unødvendig.

### PS-USR-018 — Første innlogging på ny enhet krever Vipps
**Forankring:** [Brukeridentitet og grunnkrav](../vision/02-brukere-roller-og-relasjoner.md)

På en ny, ukjent eller tilbakekalt enhet/nettleserinstallasjon må brukeren først autentiseres med Vipps. Etter sikker registrering kan den godkjente enheten bruke passkey/WebAuthn ved senere innlogging, med lokal biometri/PIN der det støttes. En synkronisert passkey på en *annen* enhet oppfyller ikke kravet om Vipps ved første bruk der. Enhetsgodkjenning og tilbakekalling håndheves av serveren og skal ikke baseres bare på nettleserfingeravtrykk. E-postkode og support gir ingen ordinær fallback etter overgang.

### PS-USR-019 — Eksisterende pilotkontoer beholdes
**Forankring:** [Brukeridentitet og grunnkrav](../vision/02-brukere-roller-og-relasjoner.md); VP-05, VP-10

En pilotbruker skal koble Vipps-identitet til samme interne konto, ved å bevise kontroll over både pilotkontoen og Vipps-identiteten. Lik e-post eller navn er utilstrekkelig. Alle eksisterende sosiale relasjoner, miljøer, ting, lån og historikk skal bevares. Privat chats nøkler, enhetssertifikater, tilbakekallinger og recovery følger ADR-0010, ikke automatisk Vipps-innlogging. Feil eller duplikater skal føre til sikkert avslag, aldri stille sammenføyning eller tap av konto.

### PS-USR-007 — Blokkering opphever ikke etablerte forpliktelser
**Forankring:** VP-05, VP-10, VP-11

Eksisterende reserverte eller aktive lån, saker, opptjente anmeldelsesrettigheter og nødvendig felles historikk består. Tilgangen reduseres til det som er nødvendig for å avslutte eller dokumentere forholdet.

### PS-USR-008 — Produktroller er eksplisitte
**Forankring:** VP-16; [Plattformforvalter](../vision/02-brukere-roller-og-relasjoner.md)

Plattformforvalter er en eksplisitt global produktrolle. Teknisk utvikler- eller driftstilgang skal ikke automatisk gi denne rollen. Miljøadministrator og miljøeier er kontekstuelle roller og gir ingen generell plattformmyndighet.

### PS-USR-009 — Habilitet begrenser administrativ rolle
**Forankring:** VP-16

En administrator eller plattformforvalter som er part, rapportert eller ellers direkte inhabil i en sak skal ikke få administrativt saksinnsyn eller behandle saken utover rettighetene vedkommende har som vanlig part.

### PS-USR-010 — Slettet konto skal ikke gjenoppstå sosialt
**Forankring:** VP-15; [Sikkerhet, personvern, jus og datalivssyklus](../vision/08-sikkerhet-personvern-jus-og-datalivssyklus.md)

Etter permanent sletting fjernes aktiv profil og aktive sosiale relasjoner. Nødvendig felles historikk kan bestå med redusert identitet, typisk «Tidligere bruker». En ny konto skal ikke automatisk arve tidligere vennskap, medlemskap, anmeldelser eller tillitsprofil.

## Relasjonstilstander

### Vennskap

`ventende → aktivt → avsluttet`

En ventende forespørsel avsluttes også når den avslås eller trekkes. En forespørsel som kom fra en invitasjon på e-post (PS-USR-013), er skjult for avsenderen mens den venter, og avsluttes som trukket når invitasjonen trekkes tilbake eller utløper. Blokkering kan når som helst avslutte et aktivt vennskap. En avsluttet relasjon gjenopprettes ikke automatisk. Et avslag sperrer ny forespørsel fra samme avsender til mottakeren har tatt initiativ (PS-USR-012).

### Blokkering

Blokkering er ensidig og aktiv inntil den oppheves. Oppheving gjenoppretter ikke tidligere vennskap eller avsluttede forespørsler automatisk.

## Utsatte detaljer

- Utvidelse til andre verifiserte kontaktkanaler enn e-post vurderes senere dersom pilotbehov tilsier det.
- Eventuelle ytterligere profilfelt skal legges til etter dataminimeringsprinsippet, ikke som en forhåndsdefinert stor profil.
