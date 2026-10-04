# Systemarkitektur

> **Status:** Systemarkitektur v0.1. Systemgrenser, komponentansvar, sannhetskilder, autorisasjon, konsistens, historikk, kommunikasjon, sikkerhet, datalivssyklus og integrasjonsgrenser er definert.

Systemarkitekturen beskriver **hvordan Lånbort teknisk skal oppfylle produktkravene og UX-modellen**. Arkitekturen organiseres etter tekniske ansvarsområder, ikke etter skjermer.

Arkitekturen peker oppover til krav og UX-regler som den oppfyller. Viktige tekniske veivalg dokumenteres som `ADR-####` etter [sporbarhetskonvensjonen](../traceability.md); vanlig forklarende arkitekturtekst trenger ikke egne ID-er.

## Dokumenter

1. [Arkitekturprinsipper og kvalitetskrav](00-arkitekturprinsipper-og-kvalitetskrav.md)
2. [Systemgrenser og kontekst](01-systemgrenser-og-kontekst.md)
3. [Komponenter og ansvar](02-komponenter-og-ansvar.md)
4. [Datamodell og sannhetskilder](03-datamodell-og-sannhetskilder.md)
5. [Autorisasjon og tilgang](04-autorisasjon-og-tilgang.md)
6. [Transaksjoner, samtidighet og konsistens](05-transaksjoner-samtidighet-og-konsistens.md)
7. [Hendelser, historikk og revisjon](06-hendelser-historikk-og-revisjon.md)
8. [Chat, varsler og saker](07-chat-varsler-og-saker.md)
9. [Sikkerhet og threat model](08-sikkerhet-og-threat-model.md)
10. [Datalivssyklus, backup og gjenoppretting](09-datalivssyklus-backup-og-gjenoppretting.md)
11. [Eksterne integrasjoner](10-eksterne-integrasjoner.md)
12. [Arkitekturbeslutninger](decisions/README.md)

Tekniske utredninger som grunnlag for åpne beslutninger ligger i [`utredninger/`](utredninger/). De er ikke normative før beslutningen er tatt:

- [Mekanisme for privilegert autentisering (OD-0010)](utredninger/OD-0010-privilegert-autentisering.md)

Åpne tekniske valg som ennå ikke har tilstrekkelig beslutningsgrunnlag, registreres i [det felles beslutningsregisteret](../open-decisions.md). Når et viktig teknisk veivalg faktisk tas, dokumenteres det som ADR der det er relevant.

## Modenhet

Arkitekturen er konkret nok til å brytes ned i implementeringsarbeid uten å låse leverandørvalg som ikke påvirker domenemodellen. PostgreSQL er valgt som referanse og planlagt transaksjonell kjerne. Fem strukturelle beslutninger er dokumentert som ADR-er.

Åpne spørsmål som må løses før den relevante funksjonen eller bred lansering finnes i [`../open-decisions.md`](../open-decisions.md), særlig E2EE-nøkkelstyring, retention, regulerte objekter og juridisk lanseringsgjennomgang.
