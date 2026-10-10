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

### PS-OBJ-020 — Synlighet for venner er et eget publiseringsvalg
**Forankring:** VP-03, VP-06, VP-08; [Vennskap](../vision/02-brukere-roller-og-relasjoner.md); avklarer OD-0013 (produkteier, 6. oktober 2026)

Et objekt kan eksplisitt publiseres til venner som et eget publiseringsvalg ved siden av miljøpubliseringene (PS-OBJ-006). Valget er av som standard. Et objekt som er synlig for venner, vises for eierens venner på eierens profil og kan finnes gjennom filteret «Venner» i Finn, og en direkte låneforespørsel (PS-USR-004) startes derfra. Et objekt som ikke er synlig for venner, kan ikke forespørres direkte.

Som en miljøpublisering endrer valget ikke objektet selv. Det følger de samme grensene som andre måter å finne objektet på: den som ser må være venn med en nåværende eier, og verken blokkering mot en eier, frysing eller sperre for nye lån gjør objektet synlig. Slås valget av eller forsvinner vennskapet, avsluttes ikke-godkjente direkte forespørsler nøytralt (PS-LOAN-002). Godkjente lån fortsetter.

### PS-OBJ-021 — Den som ser tingens navn, ser også bildene
**Forankring:** PS-OBJ-001; avklarer OD-0049 (produkteier, 10. oktober 2026)

Alle som får se navnet på en ting, skal også kunne se bildene av den, slik de er nå. Det gjelder også gjennom et lån eller en låneforespørsel: partene ser tingens bilder så lenge de ser lånet eller forespørselen, også etter at det er avsluttet, og selv om de ikke lenger finner tingen der forespørselen kom fra. Bildene er ikke en del av avtalen (PS-OBJ-012); en slettet ting har ingen bilder.

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

### PS-OBJ-018 — Pilotens kategorier
**Forankring:** PS-OBJ-002; [Påkrevde opplysninger](../vision/04-utlansobjekter.md); avklarer OD-0006 for piloten

Piloten har én flat liste med hovedkategorier og ingen underkategorier:

Verktøy · Hage og uteområde · Friluftsliv og tur · Sport og trening · Sykler og sykkelutstyr · Barn og baby · Kjøkken og husholdning · Elektronikk og foto · Fest og selskap · Hobby og musikk · Bøker, spill og leker · Klær og kostymer · Annet

«Annet» er sikkerhetsventilen for vanlige, ufarlige ting som ikke passer andre steder. Ingen kategori, heller ikke «Annet», dekker det PS-OBJ-019 holder utenfor piloten. Strukturen tillater underkategorier, men de legges bare til når faktisk pilotinnhold viser at en hovedkategori blir for bred. En kategori som tas ut, beholdes for eksisterende objekter, men kan ikke velges for nye.

### PS-OBJ-019 — Pilotgrense for risikofylte objekter
**Forankring:** VP-17; [Objektsikkerhet og lovlighet](../vision/04-utlansobjekter.md); [Ulovlige og risikofylte objekter](../vision/08-sikkerhet-personvern-jus-og-datalivssyklus.md); konservativ pilotgrense for OD-0001

Piloten skal ikke dekke alt Lånbort en dag kan støtte. Den har ingen særvilkår eller unntaksordninger: det som er problematisk, holdes utenfor.

**Kan ikke lånes ut gjennom Lånbort:**

- våpen, våpendeler og ammunisjon, også luftvåpen, armbrøster og andre gjenstander laget for å skade (kniver til vanlig bruk, som kjøkkenkniver og tollekniver, er vanlige ting)
- fyrverkeri, sprengstoff og annen pyroteknikk
- legemidler, rusmidler, dopingmidler, alkohol, tobakk og nikotinprodukter
- farlige kjemikalier, drivstoff og fylte gassflasker, for eksempel plantevernmidler, løsemidler og propan (en gassgrill uten flaske er en vanlig ting)
- levende dyr
- ulovlige, stjålne eller forfalskede gjenstander

**Venter til senere (ikke i piloten):**

- motorkjøretøy og andre kjøretøy med registrerings- eller forsikringsplikt, for eksempel bil, motorsykkel, moped, ATV, snøscooter, elsparkesykkel og registrert tilhenger (vanlige sykler, også elsykler, sykkelvogner og trillevogner er vanlige ting)
- båter med motor og vannscootere
- droner
- medisinsk utstyr og hjelpemidler, for eksempel rullestol, rullator, krykker og måleapparater
- sikkerhetsutstyr der skjult svikt kan gi alvorlig skade: bilseter, hjelmer, klatreseler og -tau, skredutstyr og redningsvester
- motorsager, ryddesager, flishuggere og andre maskiner med særlig høy skaderisiko

Grensen vises for eieren der hen forvalter og registrerer ting. Et objekt som bryter den, kan rapporteres. Miljøets administratorer kan avvise eller sperre publiseringen i sitt miljø (PS-OBJ-017), og plattformforvaltere kan sperre objektet for nye lån overalt (PS-TRUST-013).

Grensen er ikke endelig policy for bred lansering. «Venter til senere» kan åpnes, eventuelt med særvilkår, først når OD-0001 er vurdert juridisk og sikkerhetsmessig.

### PS-OBJ-022 — Venner ser navnet på eiere de er venn med
**Forankring:** PS-OBJ-020, PS-ENV-015; avklarer OD-0054 (produkteier, 10. oktober 2026)

Når en ting finnes gjennom venner (PS-OBJ-020), vises navnet til eierne betrakteren selv er venn med nå. Ved medeierskap vises bare de medeierne betrakteren er venn med; en medeier betrakteren ikke er venn med, vises ikke. Regelen håndheves på serveren hver gang tingen vises, så et avsluttet vennskap eller en blokkering skjuler navnet med en gang. Den gjelder på tingens side, i oversikter der tingen er funnet gjennom venner, og i låneforespørsler som startes derfra. Gjennom et miljø gjelder PS-ENV-015.

## Publiseringsstatus per miljø

Minst:

`ikke publisert | venter på godkjenning | aktiv | avvist | avpublisert | sperret`

Den globale objekttilstanden og publiseringsstatusen skal ikke blandes sammen.

## Samtidig redigering

Første versjon skal bruke konfliktoppdagelse fremfor «siste lagring vinner» for medeide objekter: dersom objektet er endret siden redigeringsskjemaet ble åpnet, skal brukeren få se at nyere data finnes og måtte avklare før lagring overskriver samme felt. Den konkrete tekniske mekanismen fastsettes i arkitekturen.
