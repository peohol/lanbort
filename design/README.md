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
| Kjerneflyt 5 – Samtaler og enheter | [Lånbort - Samtaler og enheter v2.html](<Lånbort - Samtaler og enheter v2.html>) | **Arbeidsutkast, ikke godkjent produktatferd.** U1–U11 i prototypen er forslag som må avklares mot kanoniske regler / beslutningsregisteret |

**Foreslått neste designbolk:** Kjerneflyt 6 – **Personer, venner og tillit** (WP-86), med personprofil, venneforespørsler, fjerning/blokkering og kontekstuell tillitsinformasjon.

## Regel for designagenter

1. Les denne filen, de aktuelle prototypene og `docs/planning/ui-design-plan.md` **før** ny design lages. Bruk de siste kjerneflytene som primær kilde til komponent- og skjermuttrykk; bruk Fase 2/Fase 4 for grunnretningen.
2. Produktatferd, roller, samtykke, personvern, tilstander og unntak styres av `docs/vision/`, `docs/product-spec/`, `docs/ux/`, `docs/architecture/` og `docs/open-decisions.md` – **ikke** av fritekst eller uavklarte forslag i HTML-mockupene.
3. Standalone HTML-filene er interaktive **designreferanser**, ikke produksjonskode eller et nytt kravgrunnlag. Fiktive navn, datoer og data er kun eksempler.
4. Nye prototyper skal lagres i `design/` og gjennomgås som egne PR-er. Ikke implementer i `apps/` som en del av ren designutforskning. Før ny prototype opprettes, identifiser hva som videreføres fra eksisterende.
5. Foreldede iterasjoner skal ikke legges tilbake i aktiv mappe. Ved behov finnes de i git-historikken.
