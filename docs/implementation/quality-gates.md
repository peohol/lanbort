# Kvalitetsporter

> **Status:** Obligatoriske porter før de angitte milepælene. Hvor hver port står, er samlet i [status 11. oktober 2026](#status-11-oktober-2026).

## Port A — Før domeneutvidelse etter fase 1

Må være oppfylt:
- migrasjoner kan kjøres fra tom database
- autorisasjon har både positive og negative automatiserte tester
- alle sensitive API-er går gjennom samme policygrense
- secrets/dependencies skannes i CI
- audit/outbox-baseline fungerer
- retry av samme idempotente testkommando gir ikke duplikat

## Port B — Før lånekjernen regnes som ferdig

Må være oppfylt:
- parallelle godkjenninger kan ikke dobbeltbooke samme objekt
- tilgang som forsvinner før godkjenning stopper lånet
- tilgang som forsvinner etter godkjenning fjerner ikke nødvendig lånetilgang
- avtalesnapshot påvirkes ikke av senere objektredigering
- tidlig retur frigjør kun faktisk fri periode
- gjenåpnet returhistorikk sletter ingen gammel hendelse
- alle overgangene i PS-LOAN er dekket av domenetester

## Port C — Før privat chat aktiveres

Må være oppfylt:
- OD-0005 er avgjort og dokumentert ([ADR-0010](../architecture/decisions/ADR-0010-e2ee-protokoll-enheter-og-recovery.md))
- chatsidene har CSP uten `unsafe-inline` for skript og ingen tredjepartsskript
- uavhengig kryptografisk designreview av protokollbruken
- server/database kan ikke lese privat meldingsklartekst under normal drift
- nøkkel-/enhetstap har definert UX
- XSS/CSP/supply-chain-tiltak er testet
- ingen administratorfunksjon har skjult «dekrypter alt»-vei

Grunnlaget for den uavhengige gjennomgangen, med funnene fra den interne gjennomgangen, står i [e2ee-gjennomgangsgrunnlag.md](e2ee-gjennomgangsgrunnlag.md).

**Unntak for den lukkede piloten (OD-0056, produkteier 11. oktober 2026):** privat chat er på for inviterte deltakere før den uavhengige gjennomgangen, etter [en egen risikovurdering](chat-pilot-risikovurdering.md), med aktiv bekreftelse fra hver bruker før første gangs bruk (PS-COM-023), bare mens piloten er lukket, og med rask avslåing. Unntaket er midlertidig og ingen generell sikkerhetsgodkjenning; den uavhengige gjennomgangen kreves fortsatt før bred lansering (Port E).

## Port D — Før lukket pilot med reelle brukere

Må være oppfylt:
- alle fase 1–3-kritiske flyter er ende-til-ende-testet
- autorisasjons-/personverntest WP-70 er grønn
- samtidighets-/idempotensstresstest WP-71 er grønn
- backup/restore WP-72 er gjennomført, også én gjenoppretting mot et hostet miljø
- backupnivået for piloten er besluttet av produkteier (ADR-0009), satt opp i produksjon og verifisert med en gjenoppretting; før denne beslutningen er betalt backup ingen forutsetning for noen port
- rate limiting og misbruksvern er aktivert
- sikkerhetskritiske henvendelser har en betjent kanal: `CONTACT_EMAIL` i produksjon er en adresse produkteier leser, og GitHubs private sårbarhetsmeldinger er slått på ([pilot-operations](pilot-operations.md#henvendelser-om-sikkerhet-og-personvern))
- produksjonshemmeligheter er skilt fra utvikling
- OD-0002 har minst en eksplisitt pilot-retentionpolicy
- OD-0006 er avgjort ([PS-OBJ-018](../product-spec/03-utlansobjekter.md))
- WebAuthn for plattformforvaltere ([ADR-0011](../architecture/decisions/ADR-0011-webauthn-for-plattformforvaltere.md), avgjør OD-0010) er implementert før privilegerte plattformforvalterhandlinger aktiveres; til da er de avvist
- en konservativ pilotpolicy begrenser risikofylte objekter ([PS-OBJ-019](../product-spec/03-utlansobjekter.md))
- representanttilgang ved død eller varig utilgjengelighet er deaktivert og testet utilgjengelig, så lenge OD-0003 ikke er avgjort
- kjente mangler er dokumentert og vurdert

## Port E — Før bred/offentlig lansering

I tillegg til pilotport:
- OD-0001 er ferdig juridisk/sikkerhetsmessig
- OD-0002 har endelige retentionregler
- OD-0007 juridisk lanseringsgjennomgang er fullført
- OD-0008 er løst dersom organisasjonen har behovet
- uavhengig sikkerhetsgjennomgang/penetrasjonstest
- særskilt E2EE-review dersom chat er aktiv
- tilgjengelighetsgjennomgang mot gjeldende krav
- driftsberedskap, restore og hendelseshåndtering er dokumentert

## Status 11. oktober 2026

Hver rad sier hva slags sjekk påstanden hviler på:

- **Test:** databasetester (pgTAP), integrasjonstester og nettlesertester, som kjører i CI på hver endring.
- **Produksjon:** lest fra eller kjørt mot det hostede oppsettet (Supabase, Vercel og www.lånbort.no).
- **Uavhengig:** gjort av noen utenfor prosjektet. Ingen slik gjennomgang er gjort ennå. Alt under er bygget og sjekket av Claude.

### Port A og B

Oppfylt. Port A er beskrevet under Fase 1 i [implementeringsplanen](README.md). Port B dekkes av domenetestene for WP-31–35 og WP-45, også PS-LOAN-018–019 og PS-LOAN-022 (pgTAP 0054). Sjekk: test.

### Port C: oppfylt med unntak for den lukkede piloten

Privat chat er klar til å slås på i produksjon for inviterte deltakere (`CHAT_ENABLED=pilot` i Vercel), med det midlertidige unntaket for den uavhengige gjennomgangen som er besluttet i OD-0056 og vurdert i [risikovurderingen](chat-pilot-risikovurdering.md). Den adversarielle sikkerhetsrevisjonen produkteier bestilte 11. oktober 2026 er levert, og funnene er rettet og i produksjon (#204, #207, 14. oktober 2026). Bryteren settes bare med produkteiers uttrykkelige ja; til da svarer chatrutene «finnes ikke».

| Krav | Status | Sjekk |
| --- | --- | --- |
| OD-0005 avgjort | Ja ([ADR-0010](../architecture/decisions/ADR-0010-e2ee-protokoll-enheter-og-recovery.md)) | – |
| CSP uten `unsafe-inline` for skript, ingen tredjepartsskript | Ja, på alle sider, ikke bare chatsidene (#172) | Test; produksjon (CSP-hodet på www.lånbort.no) |
| Uavhengig kryptografisk designreview | Gjenstår; unntatt i piloten (OD-0056). Grunnlaget er klart ([e2ee-gjennomgangsgrunnlag](e2ee-gjennomgangsgrunnlag.md)). Ingen kjente, alvorlige svakheter står uadressert | Uavhengig; til da intern gjennomgang og [risikovurdering](chat-pilot-risikovurdering.md) |
| Brukerne bekrefter merknaden før første gangs bruk (PS-COM-023) | Ja. Serveren avviser en chatnøkkel uten bekreftelse | Test |
| Chat bare for inviterte, og rask avslåing | Ja. `pilot` virker bare mens nye adresser ikke får konto; fjernes bryteren, svarer chat «finnes ikke» ([drift](pilot-operations.md#alvorlige-hendelser)) | Test; produksjon når bryteren settes |
| Serveren kan ikke lese klartekst | Bygget slik og prøvd internt | Test; bekreftes av den uavhengige gjennomgangen |
| Nøkkel- og enhetstap har definert UX | Bygget: fjerne og avvise enheter, gjenopprettingsnøkkel, tilbakestilling, og utlogging som fjerner enheten der chatten kjører. Der chatten ikke kan åpnes, slettes den lokalt, og serveren stenger enheten ute | Test |
| XSS, CSP og supply chain er testet | Internt: CSP-tester, `pnpm audit` og Gitleaks i CI | Test; bekreftes etter gjennomgangen |
| Ingen «dekrypter alt»-vei | Ingen finnes. Saksdokumentasjon (WP-46) er en kopi brukeren selv velger og sender | Intern gjennomgang; bekreftes av den uavhengige |

### Port D: oppfylt etter de interne sjekkene

Piloten åpnes først når produkteier legger inn de første deltakerne ([drift av piloten](pilot-operations.md#slik-legger-produkteier-til-en-deltaker)).

| Krav | Status | Sjekk |
| --- | --- | --- |
| Fase 1–3-kritiske flyter er ende-til-ende-testet | Ja. Hele nettleserpakken var grønn på desktop 10. oktober 2026 (302 tester). Hovedflytene var grønne på mobil (Pixel 7, 97 tester): lån, retur, uenighet, anmeldelser, blokkering, moderering, kontolivssyklus, saker og vanskelige tilstander. 11. oktober 2026 ble hele pakken kjørt mot produksjonsbygget med privat chat og plattformforvaltning av, som i produksjon: 293 tester var grønne, blant dem registrering, venner, miljøer, utlån, retur, rapportering og varsler. De 20 som feilet eller ikke kjørte, krever chat eller forvaltning slått på. Rapport til administratorene, tilbaketrekking og lukking ble i tillegg kjørt til ende uten forvaltning, og Lånbort vises da som ikke tilgjengelig | Test |
| WP-70 er grønn | Ja | Test |
| WP-71 er grønn | Ja | Test |
| Backup/restore med gjenoppretting mot et hostet miljø | Ja. En ekte backup av produksjon er gjenopprettet til et isolert miljø 10. og 11. oktober 2026. Gjenoppretting av Supabases egen backup er ikke øvd | Produksjon |
| Backupnivå besluttet, satt opp og verifisert | Ja, «To lag» (OD-0022). Det er verifisert med gjenoppretting 11. oktober 2026 | Produksjon |
| Fartsgrenser og misbruksvern | Ja (WP-73). Bildeopplastinger har egen grense (#187) | Test |
| Betjent kanal for sikkerhetshenvendelser | Ja. `CONTACT_EMAIL` (sikkerhet@lånbort.no) videresendes til produkteier, og GitHubs private sårbarhetsmeldinger er på | Produksjon |
| Produksjonshemmeligheter skilt fra utvikling | Ja. De ligger bare i Vercel og GitHub | Produksjon |
| OD-0002 har en pilotpolicy | Ja ([oppbevaring](retention.md)) | Test; jobben kjører i produksjon |
| OD-0006 avgjort | Ja | – |
| WebAuthn før privilegerte forvalterhandlinger | Bygget (ADR-0011), men av i produksjon. `PLATFORM_STEWARDS_ENABLED` finnes ikke i Vercel, og forvalterrutene svarer «finnes ikke». Uten bryteren får ingen sesjon `aal2`, så alle privilegerte handlinger avvises. Forvalteren får sikkerhetsvarsel, også på e-post, når passkeys endres og når rollen trekkes tilbake (#197) | Test; produksjon 11. oktober 2026 |
| Pilotpolicy for risikofylte objekter | Ja (PS-OBJ-019) | Test |
| Representanttilgang er av og testet utilgjengelig | Ja (pgTAP 0030) | Test |
| Kjente mangler er dokumentert og vurdert | Ja ([kjente mangler](pilot-operations.md#kjente-mangler)) | – |

I tillegg er trusselmodellen revidert før piloten ([sikkerhet og trusselmodell](../architecture/08-sikkerhet-og-threat-model.md)). Alle migrasjonene på main er kjørt i produksjon, og det er sjekket 11. oktober 2026.

### Port E: gjenstår

| Krav | Status |
| --- | --- |
| OD-0001 ferdig juridisk og sikkerhetsmessig | Åpen. Pilotgrensen gjelder til da |
| OD-0002 endelige oppbevaringsregler | Åpen. Pilotpolicyen gjelder |
| OD-0007 juridisk lanseringsgjennomgang | Åpen |
| OD-0008, dersom behovet finnes | Åpen |
| Uavhengig sikkerhetsgjennomgang eller penetrasjonstest | Ikke gjort |
| Særskilt E2EE-review dersom chat er aktiv | Ikke gjort. Den er den samme som i Port C, og chat er aktiv i piloten med unntaket i OD-0056 |
| Tilgjengelighetsgjennomgang mot gjeldende krav | Automatisk sjekk (axe) på mobil og desktop i CI. Manuell gjennomgang med skjermleser og det endelige WCAG-målet (PS-NFR-010) gjenstår |
| Driftsberedskap, restore og hendelseshåndtering dokumentert | Dokumentert for piloten ([drift](pilot-operations.md), [backup](backup-restore.md)). Punktene under «Gjenstår før bred lansering» i [trusselmodellen](../architecture/08-sikkerhet-og-threat-model.md#gjenstår-før-bred-lansering) står igjen |
