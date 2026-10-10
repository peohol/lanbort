# Miljøer

> **Status:** Arbeidsversjon av produktspesifikasjonen.

### PS-ENV-001 — Miljø har én av tre personverntyper
**Forankring:** [Tre typer miljøer](../vision/03-miljoer.md)

Et miljø er **åpent**, **lukket** eller **skjult**.

- Åpent: oppdagbart og selvbetjent innmelding uten individuell administratorvurdering.
- Lukket: oppdagbart med begrenset forhåndsvisning; medlemskap krever administratorgodkjenning.
- Skjult: ikke oppdagbart for uvedkommende; medlemskap krever konto-bundet administratorinvitasjon.

### PS-ENV-002 — Miljønavn er ikke identitet
**Forankring:** [Opprettelse av miljø](../vision/03-miljoer.md)

Miljøer har intern unik identifikator. Navn trenger ikke være unike.

### PS-ENV-003 — Aktivt miljø har én eier
**Forankring:** VP-16; [Administrasjon](../vision/03-miljoer.md)

Et aktivt miljø har normalt minst én administrator og nøyaktig én eier. Eieren skal også være administrator. Bare eieren kan overføre eierskap, starte/avbryte frivillig avvikling og fjerne administratorrollen fra en annen administrator.

### PS-ENV-004 — Medlemskap har eksplisitt tilstand
**Forankring:** [Krav ved innmelding](../vision/03-miljoer.md), [Endring av medlemskrav](../vision/03-miljoer.md)

Medlemskap modelleres minst med tilstandene:

- **ventende** — innmelding eller invitasjon er ikke fullført
- **aktivt** — ordinære medlemsrettigheter
- **passivt/skjult** — ingen ny miljøaktivitet eller aktiv synlighet, men nødvendig historisk tilgang består
- **avsluttet** — medlemskap er opphørt

Utestengelse fra nytt forsøk er en separat adgangsbegrensning og skal ikke forveksles med passivt medlemskap.

### PS-ENV-005 — Nye medlemskrav gjelder ved aktivering
**Forankring:** [Ventende innmelding når regler eller miljøtype endres](../vision/03-miljoer.md)

Et medlemskap aktiveres etter reglene som gjelder på aktiveringstidspunktet. Vesentlig skjerpede krav krever at søkeren ser og oppfyller eller aksepterer dem før aktivering. Lempede krav kan brukes straks.

### PS-ENV-006 — Eksisterende medlemmer får overgang ved nye krav
**Forankring:** [Endring av medlemskrav](../vision/03-miljoer.md)

Aktive medlemmer skal varsles og få en overgangsfrist når nye krav krever handling. Pilotstandard er **14 dager** med mindre kravet av sikkerhets- eller lovlighetsgrunner må tre i kraft raskere. Manglende oppfyllelse ved frist utløser passivt medlemskap, ikke sletting eller utestengelse.

### PS-ENV-007 — Strengere miljøtype kan innføres uten individuell godkjenning
**Forankring:** VP-08, VP-09; [Endring av miljøtype](../vision/03-miljoer.md)

Overgang åpent→lukket, lukket→skjult og åpent→skjult kan gjennomføres uten individuelt samtykke. Strengere synlighetsregler gjelder fra endringen, uten å oppheve allerede godkjente lån.

### PS-ENV-008 — Svakere personvern krever medlemsmedvirkning
**Forankring:** VP-08, VP-09; [Endring av miljøtype](../vision/03-miljoer.md)

Lukket→åpent krever individuell aksept for at medlemmet skal forbli aktivt; ikke-svar gir passiv status. Skjult→lukket krever at minst 2/3 av alle aktive medlemmer aktivt aksepterer den nye synligheten; bare de som aksepterer, fortsetter. Skjult→åpent kan ikke skje direkte.

For lukket→åpent settes svarfristen til **7 dager**, i samsvar med visjonen.

For skjult→lukket får medlemmene også **7 dager** til aktivt å akseptere den nye synligheten eller forlate miljøet. Manglende svar er ikke samtykke. Vedtas endringen, **fjernes** medlemmer som ikke har akseptert, når fristen utløper (medlemskapet blir avsluttet, ikke passivt), etter de vanlige reglene for utmelding. Vedtas den ikke, forblir miljøet skjult og ingen fjernes. (Produkteier, 6. oktober 2026, OD-0012.)

### PS-ENV-009 — Historisk personvern følger tidligere kontekst
**Forankring:** VP-09

En overgang til mindre restriktiv miljøtype skal ikke retroaktivt gjøre tidligere miljøspesifikk aktivitet mer synlig. Ny aktivitet kan følge ny synlighet først etter medlemmets relevante aksept.

### PS-ENV-010 — Skjulte invitasjoner er konto-bundne
**Forankring:** VP-08; [Invitasjoner og tips](../vision/03-miljoer.md)

Bare administratorer kan invitere til skjult miljø. Invitasjonen kan bare sendes til en eksisterende konto, kan ikke overføres eller deles som lenke, og tilhører miljøfunksjonen slik at den normalt består selv om avsenderadministrator forsvinner.

### PS-ENV-011 — Objektforhåndsgodkjenning er publiseringsstatus
**Forankring:** [Moderering av objekter i et miljø](../vision/03-miljoer.md)

Når forhåndsgodkjenning er aktiv, har miljøpublisering minst statusene **venter**, **godkjent/aktiv**, **avvist** eller **sperret av separat tiltak**. Aktivering av kravet kan sette allerede publiserte objekter til ventende uten å påvirke eksisterende godkjente lån.

### PS-ENV-012 — Avvikling er kontrollert
**Forankring:** [Avvikling av miljø](../vision/03-miljoer.md)

Miljøet får egen tilstand **under avvikling**. Nye medlemmer og nye miljøbaserte lån stanses, publiseringer opphører kontrollert, eksisterende lån fortsetter, og nødvendig historikk/saker bevares. Frivillig avvikling har **7 dagers angrefrist** før den blir endelig.

### PS-ENV-013 — Midlertidig eierløshet skal løses eller ende i avvikling
**Forankring:** [Midlertidig eierløst miljø](../vision/03-miljoer.md)

Gjenværende administratorer får **7 dager** til å melde interesse for å overta eierskap. Ved flere kandidater får den med lengst sammenhengende administratortid eierskapet. Hvis ingen overtar, går miljøet til avvikling.

### PS-ENV-014 — Manglende administrasjon skal ikke gi uvedkommende myndighet
**Forankring:** [Kontinuitet ved avvikling, utestengelse og manglende administrasjon](../vision/03-miljoer.md)

Prosesser som krever administrator kan stå på vent dersom ingen habil administrator finnes. De skal ikke omgå autorisasjon eller automatisk eskaleres til plattformforvalter.

### PS-ENV-015 — Aktive medlemmer ser hverandre og hvem som eier tingene
**Forankring:** [Lukket miljø og passivt medlem](../vision/03-miljoer.md), [Vennskap](../vision/02-brukere-roller-og-relasjoner.md)

Aktive medlemmer ser miljøets medlemsliste og eierne av tingene som er publisert i miljøet, og kan derfra åpne en persons profil og sende venneforespørsel. Som eiere vises bare de medeierne som selv er aktive medlemmer av miljøet; en medeier utenfor miljøet vises ikke for miljøets medlemmer (PS-OBJ-006). Passive medlemmer vises ikke, og ikke-medlemmer ser verken medlemsliste eller eiere. Historisk personvern (PS-ENV-009) gjelder for begge: et medlemskap eller en publisering fra en strengere miljøtype vises ikke bredere før medlemmet har akseptert den nye typen. (Produkteier, 6. oktober 2026, OD-0024.)

### PS-ENV-016 — Omtrentlig medlemstall før medlemskap
**Forankring:** [Lukket miljø](../vision/03-miljoer.md)

Den som finner et åpent eller lukket miljø, ser et omtrentlig antall aktive medlemmer, aldri det nøyaktige. Under 10 vises som «under 10 medlemmer»; ellers rundes tallet til nærmeste ti («ca. 140 medlemmer»), så én person inn eller ut sjelden endrer det som vises. Avrundingen skjer på serveren, og det nøyaktige tallet sendes ikke til klienten. (Produkteier, 10. oktober 2026, OD-0048.)

### PS-ENV-017 — Søkeren får vite at søknaden er avgjort
**Forankring:** [Lukket miljø og passivt medlem](../vision/03-miljoer.md)

Den som har søkt om å bli medlem, eller om å bli aktiv igjen som passivt medlem, får et varsel i appen både når søknaden godkjennes og når den avslås. Varselet om godkjenning leder til miljøet med velkomsten ved første besøk derfra. Avslaget sier nøytralt at søknaden ikke ble godkjent, uten begrunnelse og uten hvem som avgjorde den, og sier heller ikke om søkeren er utestengt fra nytt forsøk (PS-ENV-004). (Produkteier, 10. oktober 2026, OD-0050.)

## Miljøtilstand

Normal livssyklus:

`aktivt → under avvikling → arkivert → slettet`

Midlertidig eierløshet er en unntakstilstand innen aktiv drift og skal enten løses med ny eier eller lede til avvikling.

## Innmeldingsflyt

- **Åpent:** krav/egenerklæring → selvbetjent aktivering.
- **Lukket:** søknad → eventuell mer informasjon → administrator godkjenner/avslår.
- **Skjult:** administratorinvitasjon → medlem fyller eventuelle obligatoriske data/godtar regler → aktivering.

Personopplysninger som kreves for medlemskap skal ha konkret formål og skal ikke automatisk bli profil- eller kartdata.
