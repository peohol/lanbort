# Låneforløp

> **Status:** Arbeidsversjon av produktspesifikasjonen.

## Begrepsmodell

Låneforløpet består av en **låneforespørsel** før godkjenning og en **låneavtale** etter godkjenning. Den samme overordnede prosessen fortsetter gjennom overlevering, bruk og retur.

### PS-LOAN-001 — Ett felles låneforløp
**Forankring:** VP-04

Et miljøbasert lån og et direkte vennelån skal bruke samme grunnmodell etter at forespørselen er opprettet. Opprinnelseskonteksten beholdes som metadata og kan gi kontekstuelle rettigheter som miljømekling.

### PS-LOAN-002 — Gyldig adgang må finnes ved godkjenning
**Forankring:** VP-06

Miljøbasert forespørsel krever fortsatt nødvendig miljøadgang ved godkjenning. Direkte vennelån krever fortsatt vennskap. Bortfall før godkjenning avslutter forespørselen nøytralt; bortfall etter godkjenning opphever ikke avtalen.

### PS-LOAN-003 — Direkte vennelån krever ansvarserklæring fra begge
**Forankring:** VP-06; [Ansvarserklæring ved direkte vennelån](../vision/05-laneforlop.md)

Begge parter må uttrykkelig akseptere ansvarserklæringen for det konkrete lånet før godkjenning kan fullføres.

### PS-LOAN-004 — Forespørselen inneholder nødvendig avtalegrunnlag
**Forankring:** [Låneforespørsel](../vision/05-laneforlop.md)

Forespørselen inneholder objekt, ønsket start, ønsket slutt/varighet og en valgfri melding. «Så snart som mulig» kan brukes som startønske.

Meldingen er del av den strukturerte låneforespørselen og er ikke ende-til-ende-kryptert (PS-COM-005). Den er bare synlig for partene og kopieres ikke til hendelser eller logger. Videre fritekstsamtale skjer i den ende-til-ende-krypterte chatten. (Produkteier, 6. oktober 2026, OD-0015.)

### PS-LOAN-005 — Vesentlig endrede vilkår krever ny bekreftelse
**Forankring:** VP-06; [Endring av vilkår mens forespørselen venter](../vision/05-laneforlop.md)

Dersom relevante objektvilkår endres vesentlig mens forespørselen venter, settes den på vent til låntaker uttrykkelig har bekreftet de nye vilkårene.

### PS-LOAN-006 — Godkjenning oppretter avtale og reservasjon atomisk
**Forankring:** VP-07

Godkjenning skal bare lykkes dersom objektet fortsatt er faktisk ledig og alle adgangskrav fortsatt er oppfylt. Ved vellykket godkjenning opprettes avtaleøyeblikksbildet og perioden reserveres som én konsistent produktoperasjon.

### PS-LOAN-007 — Kolliderende åpne forespørsler avsluttes når én godkjennes
**Forankring:** VP-07

Andre ikke-godkjente forespørsler som overlapper den nye reservasjonen avsluttes automatisk og nøytralt. Ikke-kolliderende forespørsler består.

### PS-LOAN-008 — Godkjent lån har én ansvarlig utlåner
**Forankring:** [Ansvarlig utlåner](../vision/glossary.md)

Ved medeierskap blir den medeiaren som godkjenner forespørselen ansvarlig utlåner.

### PS-LOAN-009 — Overføring av ansvar er eksplisitt og sporbar
**Forankring:** VP-10, VP-15; [Overføring av ansvarlig utlåner](../vision/05-laneforlop.md)

Frivillig overføring kan skje til medeier som var medeier ved godkjenning. Kontrollert overtakelse ved reell utilgjengelighet følger samme krets. Senere medeier kan bare tre inn med låntakers uttrykkelige samtykke. Byttet endrer ikke avtalevilkår.

### PS-LOAN-010 — Avtaleendring krever relevant samtykke
**Forankring:** VP-06, VP-07

Forlengelse, endring av avtalt overlevering eller andre vesentlige avtaleendringer kan ikke gjennomføres ensidig når de endrer den andre partens forpliktelse eller påvirker en allerede godkjent avtale.

### PS-LOAN-011 — Begge parter kan ensidig kansellere før fysisk overlevering
**Forankring:** [Låneforløpet](../vision/05-laneforlop.md), [Scenario 19](../vision/scenario-stresstest.md)

Så lenge objektet ikke er fysisk overlevert kan både utlåner og låntaker avslutte et godkjent lån ensidig. Etter overlevering brukes retur-/avviksforløpet. Kansellering før planlagt overlevering og «ikke gjennomført» etter passert overlevering er separate sluttårsaker. Plattformadministrativ stans skal også være egen årsak og ikke feilaktig telle som brukerens ordinære kansellering/no-show.

### PS-LOAN-012 — Passert overlevering starter nøytral avklaring
**Forankring:** [Når et godkjent lån ikke blir hentet](../vision/05-laneforlop.md)

Hvis overleveringstidspunktet passerer uten bekreftet overlevering, går forløpet til **avventer overleveringsavklaring**. Taushet alene er ikke bevis. Pilotstandard for svarfrist er **72 timer** før et ensidig «ikke overlevert»-utsagn kan avslutte forløpet når motparten ikke svarer.

### PS-LOAN-013 — Motstrid om overlevering gir usikker/uenighet
**Forankring:** VP-12

Ved motstridende opplysninger om fysisk overlevering går lånet til **usikker/uenighet** og objektet sperres for nye kolliderende lån inntil besittelsen er avklart eller forløpet avsluttes administrativt.

### PS-LOAN-014 — Passert returtid starter nøytral returavklaring
**Forankring:** VP-12; [Når returtidspunktet passeres](../vision/05-laneforlop.md)

Passert returtid uten endelig bekreftelse gir **avventer returavklaring**, ikke automatisk «forsinket». Status **forsinket** brukes bare når det er kjent at låntaker fortsatt har objektet uten gyldig forlengelse.

### PS-LOAN-015 — Utlåners mottaksbekreftelse avslutter normal retur
**Forankring:** [Tilbakelevering](../vision/05-laneforlop.md)

Ansvarlig utlåners bekreftelse gjør normal retur endelig. Låntakers bekreftelse alene gir fortsatt avventer returavklaring. Ved reell utilgjengelighet kan kvalifisert medeier bekrefte fysisk mottak gjennom den snevre unntaksrollen.

### PS-LOAN-016 — Returbekreftelse har kort angrebuffer
**Forankring:** [Angrebuffer](../vision/05-laneforlop.md), UX-P09

Pilotstandard er **30 sekunder**. I bufferen kan aktøren angre eller velge umiddelbar bekreftelse. Etterpå korrigeres feil kun med ny historisk hendelse.

### PS-LOAN-017 — Senere bestridt retur gjenåpner uten omskriving
**Forankring:** VP-15; [Feil etter gjennomført returbekreftelse](../vision/05-laneforlop.md)

En tidligere avslutning kan gå tilbake til **usikker/uenighet** gjennom en ny problemhendelse. Den opprinnelige returbekreftelsen består i historikken.

### PS-LOAN-018 — Uavklart avslutning fastsetter ikke skyld
**Forankring:** VP-12, VP-13

Et forløp kan avsluttes administrativt som **uavklart** når videre faktaklargjøring ikke er rimelig mulig. Dette avslutter systemprosessen, men fastslår ikke privatrettslig faktum, skyld eller erstatningsansvar.

### PS-LOAN-019 — Uavklart avslutning gjør ikke automatisk objektet tilgjengelig
**Forankring:** VP-07

Hvis fysisk besittelse fortsatt er usikker, må registrert eier/medeier først bekrefte faktisk kontroll over objektet før nye lån kan inngås.

### PS-LOAN-020 — Tidlig bekreftet retur frigjør restperioden
**Forankring:** VP-07; [Scenario 27](../vision/scenario-stresstest.md)

Når ansvarlig utlåner bekrefter fysisk retur før avtalt slutt, avsluttes lånet på faktisk returtidspunkt og den resterende reservasjonen frigjøres. Dette gjør ikke perioden ledig dersom en annen gyldig sperre eller reservasjon fortsatt gjelder.

### PS-LOAN-021 — Blokkering og suspensjon bevarer minimumstilgang til fysisk avslutning
**Forankring:** VP-10, VP-11

Når et objekt allerede er overlevert, skal nødvendig strukturert retur-/mottakstilgang bestå selv om ordinær sosial tilgang eller kontoaktivitet stanses, med strengere kontrollert prosess ved særskilt sikkerhetsrisiko.

### PS-LOAN-022 — Én parts registrering av overlevering er nok uten motsigelse
**Forankring:** VP-12; [Når et godkjent lån ikke blir hentet](../vision/05-laneforlop.md)

Begge parter kan registrere utfallet av overleveringen. Når én part har registrert «overlevert» og den andre ikke har sagt noe annet, er lånet **utlånt**; den andre parten trenger ikke bekrefte. Den andre parten kan fortsatt registrere at overleveringen ikke skjedde, også etter at lånet er utlånt. Motstridende registreringer gir **usikker/uenighet** (PS-LOAN-013). Regelen gjelder både på overleveringsdagen og under overleveringsavklaringen (PS-LOAN-012). (Produkteier, 7. oktober 2026.)

## Tilstander

### Før godkjenning

- **forespurt**
- **venter på låntakers nye vilkårsbekreftelse**
- **administrativt satt på vent**
- **avslått/avsluttet**

### Etter godkjenning

- **reservert**
- **avventer overleveringsavklaring**
- **utlånt**
- **avventer returavklaring**
- **forsinket**
- **usikker/uenighet**
- **avsluttet – gjennomført**
- **avsluttet – kansellert**
- **avsluttet – ikke gjennomført**
- **avsluttet – administrativt uavklart**
- **avsluttet – administrativt stanset**

En historisk sluttstatus kan senere suppleres av en ny hendelse som gjenåpner faktisk status til **usikker/uenighet** uten å slette den tidligere hendelsen.

## Tidsfrister som pilotstandard

- manglende overleveringsavklaring: 72 timer
- manglende returavklaring: 7 dager før saken kan tilbys/ledes videre til relevant avklaringsprosess; taushet gir fortsatt ikke automatisk skyldstatus

Disse fristene er driftsstandarder og kan justeres etter pilotdata uten å endre domenemodellen.
