# Dokumentasjon

Dette området inneholder de kanoniske planleggingslagene for Lånbort.

## Autoritetsrekkefølge

1. `vision/` — hvorfor produktet finnes, grunnmodell, prinsipper og produktgrenser.
2. `product-spec/` — hva produktet konkret skal kunne og hvilke regler som gjelder.
3. `ux/` — hvordan produktmodellen skal uttrykkes og håndteres for brukeren.
4. `architecture/` — hvordan systemet teknisk skal oppfylle kravene.

`planning/` er arbeidsområdet for selve planleggingsprosessen og er ikke et eget kanonisk spesifikasjonslag.

Ved reell konflikt med produktets grunnmodell skal spørsmålet løftes tilbake til visjonslaget. Implementeringsplanlegging begynner først når produktspesifikasjon, UX-modell og systemarkitektur er tilstrekkelig konsistente.

## Sporbarhet

[Sporbarhetskonvensjonen](traceability.md) bruker stabile ID-er og énveis forankring fra et konkret valg til beslutningsgrunnlaget høyere opp. Det føres ikke en manuell sporbarhetsmatrise.

## Åpne detaljbeslutninger

Uavklarte valg som tilhører produktspesifikasjon, UX eller arkitektur registreres i [`open-decisions.md`](open-decisions.md). Reelle spørsmål om produktets grunnmodell hører i stedet hjemme i [`vision/open-questions.md`](vision/open-questions.md).

## Validering

[Tverrgående validering før implementering](validation.md) dokumenterer konsistenssjekken mellom produktspesifikasjon, UX og arkitektur, inkludert hvilke åpne detaljvalg som trygt kan utsettes.

## Implementering

[Implementeringsplanen](implementation/README.md) beskriver fase- og milepælrekkefølgen etter den validerte planleggingsfasen. [Kodeagent-arbeidspakkene](implementation/work-packages.md) er den konkrete arbeidskøen; [kvalitetsportene](implementation/quality-gates.md) angir hva som må være bevist før neste modenhetsnivå.
