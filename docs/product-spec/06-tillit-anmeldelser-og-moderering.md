# Tillit, anmeldelser og moderering

> **Status:** Arbeidsversjon av produktspesifikasjonen.

### PS-TRUST-001 — Anmeldelsesrett følger faktisk forløp
**Forankring:** VP-12, VP-14; [Anmeldelse etter et fullført lån](../vision/07-tillit-anmeldelser-og-moderering.md)

Et gjennomført lån gir ordinær anmeldelsesrett. Kansellert eller ikke gjennomført lån kan bare vurderes på dimensjoner som faktisk ble erfart. Administrativt uavklart lån kan vurderes på ikke-omstridte forhold og skal tydelig merkes som uavklart.

### PS-TRUST-002 — Skala er 1–5 per relevant dimensjon
**Forankring:** [Skala](../vision/07-tillit-anmeldelser-og-moderering.md)

1–2 krever én kort samlet begrunnelse dersom minst én dimensjon har slik skår. 3 kan forklares frivillig; 4–5 krever ikke begrunnelse.

### PS-TRUST-003 — Anmeldelser publiseres dobbelblindt
**Forankring:** [Når anmeldelser blir synlige](../vision/07-tillit-anmeldelser-og-moderering.md)

Pilotstandard for anmeldelsesfrist er **14 dager** etter vurderingsberettiget avslutning. Inntil begge har levert eller fristen utløper er innsendt anmeldelse skjult og påvirker ikke synlige aggregater. Hvis begge leverer, publiseres begge samtidig.

### PS-TRUST-004 — Publisert anmeldelse er låst
**Forankring:** VP-15; [Redigering og tilsvar](../vision/07-tillit-anmeldelser-og-moderering.md)

Forfatter kan redigere mens anmeldelsen fortsatt er skjult. Etter publisering kan skår og tekst ikke endres direkte; korreksjon eller moderering skjer som sporbar prosess.

### PS-TRUST-005 — Den anmeldte kan gi ett tilsvar
**Forankring:** [Redigering og tilsvar](../vision/07-tillit-anmeldelser-og-moderering.md)

Tilsvaret vises med anmeldelsen, påvirker ikke skåren og åpner ikke en videre diskusjonstråd.

### PS-TRUST-006 — Tillit er rolle- og kontekstspesifikk
**Forankring:** VP-14

Systemet skal ikke presentere én global menneskeskår eller topplister. Låntaker- og utlånererfaring skal ikke blandes ukritisk. Datagrunnlag og usikkerhet skal kunne forstås.

### PS-TRUST-007 — Fritekstanmeldelser arver tilgangskontekst
**Forankring:** VP-08, VP-09

Fritekst kan sees av den anmeldte og av andre som allerede har legitim profil-/konteksttilgang. Anmeldelser fra skjult miljø har strengere synlighet og skal ikke røpe miljø, forfatter eller sosial kontekst til utenforstående.

### PS-TRUST-008 — Skjult anmeldelse pauses hvis lånet gjenåpnes
**Forankring:** VP-12, VP-15

Hvis lånet går fra avsluttet til usikker/uenighet før publisering, pauses anmeldelsen. Partene kan justere sin fortsatt skjulte anmeldelse ved ny avslutning. Allerede publisert anmeldelse omskrives ikke, men kan merkes og få omstridte dimensjoner tatt ut av aggregater.

### PS-TRUST-009 — Blokkering fjerner ikke opptjent anmeldelsesrett
**Forankring:** VP-11

Anmeldelse og ett tilsvar kan fullføres innen fristen uten å gjenåpne ordinær sosial kontakt.

### PS-TRUST-010 — Rå rapporter og blokkeringer er ikke tillitssignaler
**Forankring:** VP-12, VP-14

Antall rapporter, blokkeringer eller konflikter skal ikke direkte gi negativ skår eller sanksjon. Dokumenterte hendelser kan brukes i intern sikkerhetsanalyse etter egen vurdering.

### PS-TRUST-011 — Mønsterinformasjon er deskriptiv
**Forankring:** VP-14; [Mønstersignaler fra lånehistorikken](../vision/07-tillit-anmeldelser-og-moderering.md)

Hvis mønstre senere vises, skal de uttrykkes som forståelige rolle- og hendelsesspesifikke rater med teller/nevner, tilstrekkelig datamengde og kontekst. De skal ikke automatisk klassifisere personen som «upålitelig».

### PS-TRUST-012 — Ingen automatisk nedvekting fra start
**Forankring:** [Uvanlig negative anmeldelsesmønstre](../vision/07-tillit-anmeldelser-og-moderering.md)

Statistisk kalibrering eller vekting av anmeldere inngår ikke i første versjon.

### PS-TRUST-013 — Lokal moderering og plattformmoderering er forskjellige nivåer
**Forankring:** VP-13, VP-17

Miljøadministratorer kan moderere innen eget miljø. Plattformforvalter behandler plattformregler, alvorlig misbruk og globale sikkerhets-/lovlighetsproblemer. Miljømekling avgjør ikke privatrettslig skyld.

### PS-TRUST-014 — Moderert anmeldelse skal ikke fortsette å påvirke synlige aggregater
**Forankring:** VP-14, VP-15; [Scenario 40](../vision/scenario-stresstest.md)

Hvis en anmeldelse eller en skårdimensjon modereres bort som ugyldig, skal synlige aggregater beregnes på nytt uten den. Nødvendig intern modereringshistorikk kan fortsatt bevares.

### PS-TRUST-015 — Fritekst og tilsvar kan modereres uten å omskrive øvrig gyldig vurdering
**Forankring:** VP-15; [Scenario 42](../vision/scenario-stresstest.md)

Tredjepartsopplysninger, private kontekstlekkasjer eller regelstridig tekst kan fjernes gjennom sporbar moderering. En gyldig skår kan bestå dersom grunnlaget for selve vurderingen ikke er rammet.

### PS-TRUST-016 — Modereringstiltak skal ha eksplisitt grunnlag og virkning
**Forankring:** VP-15, VP-16, VP-17

Et tiltak skal registrere hvem/hva det gjelder, omfang, begrunnelse, beslutningstaker og tidspunkt. Et lokalt tiltak skal ikke få global effekt uten separat grunnlag.
