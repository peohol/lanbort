# Gjeldende designreferanser for Lånbort

> **Status 10. oktober 2026.** Dette er det aktive grunnlaget for **UI-design**. Kolonnen «Godkjent» sier om produkteier har godkjent designet. Kolonnen «I appen» sier hvor langt det er bygget. Hva som gjenstår, står i [UI-arbeidspakkene](../docs/implementation/ui-work-packages.md). En prototype viser hvordan noe skal se ut, ikke at det finnes i appen. Tidligere varianter er fjernet fra `design/`, men finnes fortsatt i git-historikken.

## Hva som er vedtatt

- **Informasjonsarkitektur:** Fem hovedområder (Hjem, Finn, Lån, Mine ting, Samtaler), kontekstuell navigasjonsstabel og handlingsorientert Hjem. Fase 2, iterasjon 3, særlig 3a/3b, illustrerer dette.
- **Visuelt uttrykk:** «Lune flater» (retning 1B) ble valgt som utgangspunkt, med den tydelige ikonbruken fra retningene 1A/1D. Paletten er videreført som **Tomat**: varm, lys og relativt dempet, med klarere signalrødt for destruktive handlinger. Den dekorative prikken under aktivt hovedmenyvalg er fjernet.
- **Kontinuitet:** Nye flyter skal se ut som de hører til samme app. Gjenbruk typografi, farger, ikoner, kort, knapper, statusuttrykk, avstander og navigasjon fra de gjeldende prototypene; lag ikke et nytt designspråk for hver flyt.

## Aktive filer

| Rolle | Gjeldende fil | Godkjent | I appen |
| --- | --- | --- | --- |
| Struktur og navigasjon | [Fase 2 IA-retninger iterasjon 3.html](<Fase 2 IA-retninger iterasjon 3.html>) | Vedtatt navigasjonsretning; bruk spesielt 3a og 3b | Bygget: navigasjonsstabel og direkte innganger (#88), Konto og Varsler som lag (#96) |
| Visuelt uttrykk | [Fase 4 Tomat finjustering.html](<Fase 4 Tomat finjustering.html>) | Vedtatt visuell retning | Bygget som felles designgrunnlag (#85, #108, #114) |
| Kjerneflyt 1 – låneforløpet | [Lånbort Kjerneflyt v2.html](<Lånbort Kjerneflyt v2.html>) | Gjeldende prototype | Bygget: tingens side for lånere (#112), forespørsel i to steg og forespørselens side (#100), lånets side (#91, #109). Tingens bilde ved tittelen (PS-OBJ-021) er under arbeid |
| Kjerneflyt 2 – registrere ting | [Lånbort Registrere ting v2.html](<Lånbort Registrere ting v2.html>) | Gjeldende prototype | Bygget: Mine ting som kort (#97), registrering i fire steg (#101), tingens side for eiere (#110) |
| Kjerneflyt 3 – finne og bli med i miljø | [Lånbort - Finne og bli med i et miljø v2.html](<Lånbort - Finne og bli med i et miljø v2.html>) | Siste finjusterte v2 (tidligere eksportert som `v2 (2)`) | Bygget: Finn (#102, #117), miljøsiden (#110, #115, #116), søknad og «Velkommen» (#113). Bygget også: medlemstall på miljøsiden (#120) og varsel når en søknad er avgjort (PS-ENV-017). Gjenstår: egen tilstand «Søknaden ble ikke godkjent» på miljøsiden |
| Kjerneflyt 4 – Hjem og varsler | [Lånbort - Hjem og varsler v3.html](<Lånbort - Hjem og varsler v3.html>) | Gjeldende v3; siste rydding og UX-lenkekorreksjon i [PR #80](https://github.com/peohol/lanbort/pull/80) | Bygget: Hjem (#92), varslingssenteret (#99, #106) |
| Kjerneflyt 5 – Samtaler og enheter | [Lånbort - Samtaler og enheter v3.html](<Lånbort - Samtaler og enheter v3.html>) | Godkjent 9. oktober 2026 (#83). Produktvalgene (OD-0043–OD-0045) står i PS-COM-017–019 og ADR-0010. Det som er vedtatt, men ikke bygget, er merket i prototypen | Bygget: samtaler (#89), enhetsflyter (#98), meldingsvarsler (#103), «Skriv til» på en venns side (#128), inngangene fra forespørsel og lån (#137) og fra et spørsmål om en ting (#134), overføring av meldinger ved kobling og gjenopprettingsnøkkelen (#140), lånet samtalen ble åpnet fra først og merknaden om når enheten ble koblet til (skjerm 13). En egen avvisning av en ventende enhet er ikke tegnet. Privat chat er av for ekte brukere til Port C |
| Kjerneflyt 6 – Personer, venner og tillit | [Lånbort - Personer, venner og tillit v1.html](<Lånbort - Personer, venner og tillit v1.html>) | Godkjent 9. oktober 2026 (#82). Produktvalgene (OD-0027–OD-0032) står i PS-USR-002, PS-USR-011–012, PS-TRUST-017, UX-IA-020 og UX-PRIV-012. Skrevet som vanlig HTML, ikke som bundle | Bygget: personens side (#90, #107), sperre etter avslag (#87), Venner og Blokkerte i Konto (#96, etter skjerm 18–20 fra 10. oktober) |
| Kjerneflyt 7 – Lånets side og anmeldelser | [Lånbort - Lånets side og anmeldelser v1.html](<Lånbort - Lånets side og anmeldelser v1.html>) | Godkjent 9. oktober 2026 (#86). Produktvalgene (OD-0033–OD-0036) står i PS-LOAN-023, PS-TRUST-003, PS-TRUST-005 og UX-PRIV-013. Skrevet som vanlig HTML, ikke som bundle | Bygget: lånets side (#91, #109), skade, mangel og tap (#95, #104), medeierens innsyn (#94, #105), varsel om anmeldelser (#93). Under arbeid: tidligere parters tilgang til egne anmeldelser |
| Kjerneflyt 8 – Rapportering, saker og konfliktløsning | [Lånbort - Rapportering, saker og konfliktløsning v1.html](<Lånbort - Rapportering, saker og konfliktløsning v1.html>) | Godkjent 10. oktober 2026 (#84). Dekker WP-88. Plattformforvalternes flater er ikke med før OD-0023. Produktvalgene (OD-0038–OD-0042) står i PS-COM-020–022, PS-TRUST-018 og UX-EXC-011. Skrevet som vanlig HTML, ikke som bundle | Under arbeid. Sakene er bygget etter WP-88 (#65), men ikke etter dette designet ennå |
| Administrator- og forvalterflater (fase 7) | [Lånbort - Administrere et miljø v1.html](<Lånbort - Administrere et miljø v1.html>) | **Godkjent** av produkteier og merget i design-PR [#118](https://github.com/peohol/lanbort/pull/118) 10. oktober 2026. Produktvalgene (OD-0025, OD-0026, OD-0050–OD-0053) ble avgjort 10. oktober 2026 og står i PS-ENV-017–021 og PS-ADM-015. Det som er vedtatt, men ikke bygget, er merket i prototypen og kan skjules med en bryter. Plattformforvalternes flater venter på OD-0023 | Miljøadministrasjonen er bygget etter dette designet som oppgavesider (#125). Varselet til søkeren (PS-ENV-017), spørsmålet til søkeren (PS-ENV-019) og egen tilstand for den som er stengt ute (PS-ENV-020) er bygget. Ikke bygget: invitasjon av andre enn venner, å avslutte et aktivt medlemskap og plattformforvalternes flater |

**Neste designbolk:** administrator- og forvalterflatene (#118). Produktvalgene i kjerneflytene 5–8 er avklart og skal ikke tas opp igjen.

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
