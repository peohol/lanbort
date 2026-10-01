# Utlånsobjekter

> **Status:** Arbeidsversjon av produktspesifikasjonen.

### PS-OBJ-001 — Objektet har global identitet og sannhet
**Forankring:** VP-03; [Grunnprinsipp](../vision/04-utlansobjekter.md)

Tittel, kategori, beskrivelse, bilder, generell tilgjengelighet og objektets faktiske besittelses-/lånesperrer gjelder globalt uavhengig av hvilke miljøer objektet er publisert i.

### PS-OBJ-002 — Minimumsdata for objekt
**Forankring:** [Påkrevde opplysninger](../vision/04-utlansobjekter.md)

Et objekt skal ha:
- tittel
- kategori fra felles kategoristruktur
- beskrivelse
- minst ett tilgjengelighetsintervall før det kan tilbys for nye lån

Objektet kan ha 1–5 bilder og valgfrie utlånsvilkår. Merke/modell, størrelse, tilstand og mangler kan beskrives i fritekst i første versjon; felt skal bare struktureres når de gir tydelig funksjonell verdi.

### PS-OBJ-003 — Tilgjengelighetsintervaller skal være konsistente
**Forankring:** [Tilgjengelighet og faktisk ledighet](../vision/04-utlansobjekter.md)

Objektet kan ha åpne eller avgrensede intervaller og flere separate intervaller. Intervaller skal ikke overlappe. Sammenhengende intervaller behandles som ett logisk tilgjengelighetsrom.

### PS-OBJ-004 — Godkjente lån sperrer globalt
**Forankring:** VP-07

En godkjent avtale sperrer kolliderende perioder på objektet på tvers av alle miljøer og alle medeiere.

### PS-OBJ-005 — Uavklart besittelse sperrer nye lån
**Forankring:** VP-05, VP-07

Når fysisk besittelse er reelt uavklart, er objektet ikke tilgjengelig for nye kolliderende lån. Dette opphever ikke allerede gyldig inngåtte senere lån; de håndteres som egne forpliktelser.

### PS-OBJ-006 — Publisering i miljø er separat fra objektet
**Forankring:** VP-03, VP-08

En miljøpublisering krever at minst én nåværende medeier har nødvendig adgang til miljøet. Hvis siste adgangsberettigede medeier mister adgang, avpubliseres objektet der og ikke-godkjente forespørsler avsluttes nøytralt. Godkjente lån fortsetter.

### PS-OBJ-007 — Medeierskap krever aksept
**Forankring:** [Medeierskap](../vision/04-utlansobjekter.md)

En ny medeier må uttrykkelig godta invitasjonen. Alle medeiere kan vedlikeholde objektet og kan inngå nye lån innenfor egen kontekstuelle adgang, men dette gir ikke rett til å gripe inn i allerede etablerte lån.

### PS-OBJ-008 — Medeier kan begrense, men ikke ensidig oppheve annen medeiers begrensning
**Forankring:** VP-06, VP-07; [Uenighet mellom medeiere om framtidig utlån](../vision/04-utlansobjekter.md)

Uttrykkelig begrensning av nye forpliktelser fungerer som veto til den trekkes tilbake av den som satte den eller medeierskapet avklares. Vanlig innholdsredigering følger ikke veto-modellen.

### PS-OBJ-009 — Blokkering mellom medeiere fryser nye utlån
**Forankring:** VP-11; [Blokkering og medeierskap](../vision/02-brukere-roller-og-relasjoner.md)

Hvis to medeiere blokkerer hverandre, skjules objektet fra ordinær oppdagelse og alle ikke-godkjente forespørsler avsluttes. Nye lån krever at medeierskapet først avklares til én registrert eier; bare å oppheve blokkeringen er ikke nok.

### PS-OBJ-010 — Medeiers uttreden kan ikke bryte ansvar
**Forankring:** [Uttreden og fjerning av medeiere](../vision/04-utlansobjekter.md)

En medeier kan trekke seg selv dersom minst én eier blir igjen. Ansvarlig utlåner kan ikke tre ut før lånet er avsluttet eller ansvar er gyldig overført. Ingen medeier kan ensidig fjerne en annen medeier.

### PS-OBJ-011 — Permanent sletting av medeid objekt krever alle eiere
**Forankring:** [Uttreden og fjerning av medeiere](../vision/04-utlansobjekter.md)

Permanent sletting krever samtykke fra alle registrerte medeiere og kan ikke gjennomføres mens objektet inngår i reservert, aktivt eller uavklart lån som krever oppfølging.

### PS-OBJ-012 — Endringer skal ikke omskrive eksisterende låneavtale
**Forankring:** VP-05, VP-15

Objektets metadata, vilkår og tilgjengelighet kan endres fremover, men relevant avtaleøyeblikksbilde for allerede godkjent lån skal bevares.

### PS-OBJ-013 — Objektendringer er sporbare ved medeierskap
**Forankring:** VP-15

Vesentlige endringer på medeid objekt skal kunne knyttes til aktør og tidspunkt. Gjenoppretting av tidligere innhold registreres som en ny versjon/hendelse, ikke ved sletting av senere historie.

### PS-OBJ-014 — Abonnement følger innsyn
**Forankring:** VP-08

En bruker kan abonnere på et objekt hen kan se. Abonnementet skal stoppe eller bli inaktivt dersom tilgangsgrunnlaget bortfaller, slik at varsler ikke lekker skjult informasjon.

### PS-OBJ-015 — Objektspørsmål er miljøspesifikke
**Forankring:** VP-08, VP-09

Spørsmål og svar følger den konkrete miljøpubliseringen og skal ikke flyte til andre miljøer. Ved avpublisering forsvinner de fra aktive flater; eventuell bevart historikk gir ikke ordinære medlemmer permanent innsyn.

### PS-OBJ-016 — Inaktivitet gir skjuling og arkivering, ikke automatisk sletting
**Forankring:** [Inaktivitet, skjuling og arkivering](../vision/04-utlansobjekter.md)

Pilotstandard:
- 30 dager uten nåværende eller fremtidig tilgjengelighet → objektet kan skjules fra oppdagelsesflater og eieren varsles.
- 180 dager → objektet kan flyttes til reversibelt arkiv.

Inaktivitet alene medfører aldri permanent sletting.

### PS-OBJ-017 — Lokal moderering har lokal virkning
**Forankring:** [Miljølokal moderering av samme objekt](../vision/04-utlansobjekter.md)

Avslag eller fjerning i ett miljø påvirker normalt bare denne publiseringen. Mulig ulovlighet eller alvorlig sikkerhetsrisiko kan eskaleres til plattformnivå og få global virkning etter separat vurdering.

## Publiseringsstatus per miljø

Minst:

`ikke publisert | venter på godkjenning | aktiv | avvist | avpublisert | sperret`

Den globale objekttilstanden og publiseringsstatusen skal ikke blandes sammen.

## Samtidig redigering

Første versjon skal bruke konfliktoppdagelse fremfor «siste lagring vinner» for medeide objekter: dersom objektet er endret siden redigeringsskjemaet ble åpnet, skal brukeren få se at nyere data finnes og måtte avklare før lagring overskriver samme felt. Den konkrete tekniske mekanismen fastsettes i arkitekturen.
