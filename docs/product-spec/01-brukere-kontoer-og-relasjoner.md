# Brukere, kontoer og relasjoner

> **Status:** Arbeidsversjon av produktspesifikasjonen.

### PS-USR-001 — Minstekrav for konto i pilot
**Forankring:** [Brukeridentitet og grunnkrav](../vision/02-brukere-roller-og-relasjoner.md)

En ny bruker skal være minst 18 år, oppgi virkelig navn og verifisere minst én kontaktkanal. For pilotfasen brukes verifisert e-post som obligatorisk kontaktkanal. BankID er ikke et krav. Framtidig Vipps-innlogging og et mulig sterkere identitetsgrunnlag utredes separat i OD-0011 og endrer ikke dette pilotkravet før en ny beslutning er tatt.

### PS-USR-002 — Minimal profil
**Forankring:** [Profil og synlighet](../vision/02-brukere-roller-og-relasjoner.md)

Profilen skal minst ha virkelig navn. Profilbilde og kort presentasjon kan være valgfrie. Hvert profilfelt som kan deles skal ha en eksplisitt synlighetsregel med minst nivåene **generelt**, **venner** og **bare meg**. Systemkritiske kontoopplysninger skal ikke gjøres til profilfelt bare fordi de finnes. Profilbildet vises som sirkel overalt der det vises, og brukeren beskjærer det i den samme sirkelen (OD-0027).

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

En ventende forespørsel avsluttes også når den avslås eller trekkes. Blokkering kan når som helst avslutte et aktivt vennskap. En avsluttet relasjon gjenopprettes ikke automatisk. Et avslag sperrer ny forespørsel fra samme avsender til mottakeren har tatt initiativ (PS-USR-012).

### Blokkering

Blokkering er ensidig og aktiv inntil den oppheves. Oppheving gjenoppretter ikke tidligere vennskap eller avsluttede forespørsler automatisk.

## Utsatte detaljer

- Utvidelse til andre verifiserte kontaktkanaler enn e-post vurderes senere dersom pilotbehov tilsier det.
- Eventuelle ytterligere profilfelt skal legges til etter dataminimeringsprinsippet, ikke som en forhåndsdefinert stor profil.
