# Gjeldende designreferanser for Lånbort

> **Status 9. oktober 2026.** Dette er det aktive grunnlaget for videre **UI-design**, ikke dokumentasjon av en ferdig implementert brukerflate. Tidligere varianter er fjernet fra `design/`, men finnes fortsatt i git-historikken.

## Hva som er vedtatt

- **Informasjonsarkitektur:** Fem hovedområder (Hjem, Finn, Lån, Mine ting, Samtaler), kontekstuell navigasjonsstabel og handlingsorientert Hjem. Fase 2, iterasjon 3, særlig 3a/3b, illustrerer dette.
- **Visuelt uttrykk:** «Lune flater» (retning 1B) ble valgt som utgangspunkt, med den tydelige ikonbruken fra retningene 1A/1D. Paletten er videreført som **Tomat**: varm, lys og relativt dempet, med klarere signalrødt for destruktive handlinger. Den dekorative prikken under aktivt hovedmenyvalg er fjernet.
- **Kontinuitet:** Nye flyter skal se ut som de hører til samme app. Gjenbruk typografi, farger, ikoner, kort, knapper, statusuttrykk, avstander og navigasjon fra de gjeldende prototypene; lag ikke et nytt designspråk for hver flyt.

## Aktive filer

| Rolle | Gjeldende fil | Status |
| --- | --- | --- |
| Struktur og navigasjon | [Fase 2 IA-retninger iterasjon 3.html](<Fase 2 IA-retninger iterasjon 3.html>) | Vedtatt navigasjonsretning; bruk spesielt 3a og 3b |
| Visuelt uttrykk | [Fase 4 Tomat finjustering.html](<Fase 4 Tomat finjustering.html>) | Vedtatt visuell retning |
| Kjerneflyt 1 – låneforløpet | [Lånbort Kjerneflyt v2.html](<Lånbort Kjerneflyt v2.html>) | Gjeldende prototype |
| Kjerneflyt 2 – registrere ting | [Lånbort Registrere ting v2.html](<Lånbort Registrere ting v2.html>) | Gjeldende prototype |
| Kjerneflyt 3 – finne og bli med i miljø | [Lånbort - Finne og bli med i et miljø v2.html](<Lånbort - Finne og bli med i et miljø v2.html>) | Siste finjusterte v2 (tidligere eksportert som `v2 (2)`) |
| Kjerneflyt 4 – Hjem og varsler | [Lånbort - Hjem og varsler v3.html](<Lånbort - Hjem og varsler v3.html>) | Gjeldende v3; siste rydding og UX-lenkekorreksjon i [PR #80](https://github.com/peohol/lanbort/pull/80) |
| Kjerneflyt 5 – Samtaler og enheter | [Lånbort - Samtaler og enheter v3.html](<Lånbort - Samtaler og enheter v3.html>) | **Til sluttgodkjenning.** U1–U11 er gjennomgått mot spesifikasjonen, ADR-0010 og koden 9. oktober 2026. De tre produktvalgene ble avgjort samme dag (OD-0043–OD-0045) og står i PS-COM-017–019 og ADR-0010. Det som er vedtatt, men ikke bygget, er merket i prototypen |
| Kjerneflyt 6 – Personer, venner og tillit | [Lånbort - Personer, venner og tillit v1.html](<Lånbort - Personer, venner og tillit v1.html>) | **Til siste gjennomgang, ennå ikke godkjent.** Dekker WP-86 (personens side, tillit i rollen, venneforespørsler, fjerning, blokkering og Konto-visningene). Produktvalgene fra første utkast ble avgjort 9. oktober 2026 (OD-0027–OD-0032) og står i PS-USR-002, PS-USR-011–012, PS-TRUST-017, UX-IA-020 og UX-PRIV-012. Skrevet som vanlig HTML, ikke som bundle |
| Kjerneflyt 7 – Lånets side og anmeldelser | [Lånbort - Lånets side og anmeldelser v1.html](<Lånbort - Lånets side og anmeldelser v1.html>) | **Til gjennomgang, ennå ikke godkjent.** Dekker WP-87 (status og tidslinje, endringer i avtalen, kansellering, ansvarlig utlåner, avvik, skade, mekling, anmeldelser og tilsvar), med to telefoner som deler samme lån. Produktvalgene ble avgjort 9. oktober 2026 (OD-0033–OD-0036) og står i PS-LOAN-023, PS-TRUST-003, PS-TRUST-005 og UX-PRIV-013. Skrevet som vanlig HTML, ikke som bundle |
| Kjerneflyt 8 – Rapportering, saker og konfliktløsning | [Lånbort - Rapportering, saker og konfliktløsning v1.html](<Lånbort - Rapportering, saker og konfliktløsning v1.html>) | **Til gjennomgang, ikke godkjent.** Dekker WP-88: rapportere en person, en ting eller en anmeldelse, kontakte administratorene, be om mekling, sakens side for partene og for administratorene (kø, forklaringsrunder, deling, tiltak, habilitet og lukke) og Konto › Saker. Plattformforvalternes flater er ikke med før OD-0023. Produkteier avgjorde OD-0038–OD-0042 9. oktober 2026 (PS-COM-020–022, PS-TRUST-018, UX-EXC-011); prototypen viser beslutningene, og det som ikke er bygget, er merket. Skrevet som vanlig HTML, ikke som bundle |
| Fase 7 – Administrere et miljø (administrator og forvalter) | [Lånbort - Administrere et miljø v1.html](<Lånbort - Administrere et miljø v1.html>) | **Til gjennomgang, ikke godkjent.** Dekker miljøadministrasjonen fra WP-85 som oppgaver (innmeldinger, ting, medlemmer og utestengelse, roller og eierskap, innstillinger og krav, miljøtype og avvikling) og retningen for plattformforvalternes kø og tiltak, som ikke vises før OD-0023. Saksbehandlingen er i kjerneflyt 8. Nye produktvalg er registrert som OD-0051–OD-0053; OD-0025 og OD-0026 er vist som forslag. Skjermbilder i `skjermbilder/fase-7-administrasjon/`. Skrevet som vanlig HTML, ikke som bundle |

**Foreslått neste designbolk:** Produktvalgene i kjerneflyt 6 er avklart (OD-0027–OD-0032) og skal ikke tas opp igjen. Neste bolk velges etter fase 6 i `docs/planning/ui-design-plan.md`.

## Konkrete stilankre

Disse verdiene kommer fra de siste Tomat-prototypene. De er utgangspunkt for videre konsistent design, ikke en erstatning for å studere skjermene:

- Typografi: **Atkinson Hyperlegible Next** i brødtekst og **Quicksand** i overskrifter.
- Primærfarge **`#B0563A`**, mørk primær **`#8A3E26`**, lys primær **`#FBE8DF`**.
- Destruktiv handling **`#C4122F`** (tydelig forskjellig fra primærfargen).
- Tekst **`#1E2733`**, sekundærtekst **`#56606E`**, bakgrunn **`#F3F4F7`**, skillelinje **`#DEE1E8`**, fokusmarkering **`#2B4A8A`**.
- Myke kortflater, tydelige ikoner, store berøringsmål og konsekvent mobilnavigasjon. Ikke gjeninnfør dekorativ indikatorprikk under aktivt menypunkt.

De eksporterte HTML-filene er innpakket som selvstendige bundles. Designets faktiske HTML/CSS ligger inne i `<script type="__bundler/template">` som en JSON-kodet streng; et verktøy må lese/parse denne før visuelle regler hentes ut. Ikke trekk slutninger fra bare innpakningen eller den komprimerte ressursmanifesten.

## Regel for designagenter

1. Les denne filen, de aktuelle prototypene og `docs/planning/ui-design-plan.md` **før** ny design lages. Bruk de siste kjerneflytene som primær kilde til komponent- og skjermuttrykk; bruk Fase 2/Fase 4 for grunnretningen.
2. Produktatferd, roller, samtykke, personvern, tilstander og unntak styres av `docs/vision/`, `docs/product-spec/`, `docs/ux/`, `docs/architecture/` og `docs/open-decisions.md` – **ikke** av fritekst eller uavklarte forslag i HTML-mockupene.
3. Standalone HTML-filene er interaktive **designreferanser**, ikke produksjonskode eller et nytt kravgrunnlag. Fiktive navn, datoer og data er kun eksempler.
4. Nye prototyper skal lagres i `design/` og gjennomgås som egne PR-er. Ikke implementer i `apps/` som en del av ren designutforskning. Før ny prototype opprettes, identifiser hva som videreføres fra eksisterende.
5. Foreldede iterasjoner skal ikke legges tilbake i aktiv mappe. Ved behov finnes de i git-historikken.
