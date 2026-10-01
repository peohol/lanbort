# Sporbarhetskonvensjon

> **Status:** Vedtatt for planleggingsfasen 1. oktober 2026.

## Formål

Sporbarheten skal gjøre det mulig å svare på to spørsmål uten å bygge et eget administrativt system:

1. **Hvorfor finnes dette kravet eller valget?**
2. **Hva kan bli påvirket hvis en overordnet beslutning endres?**

Modellen er derfor bevisst enkel: normative utsagn får stabile ID-er når andre dokumenter kan trenge å vise til dem, og et konkret valg peker **oppover** til beslutningsgrunnlaget sitt.

Det føres ikke en manuell sporbarhetsmatrise og normalt heller ikke manuelle tilbakepekere.

## Énveis forankring

Avhengigheten dokumenteres i retning:

`visjon → produktkrav / UX-prinsipp og UX-regel → arkitektur / ADR`

Det konkrete, nedstrøms utsagnet har ansvaret for å vise hva det bygger på.

Eksempel:

```md
### PS-LOAN-012 — Endring av avtalt retur krever relevant samtykke

**Forankring:** VP-06, VP-07; [Låneforløpet – endring av avtale](../vision/05-laneforlop.md#...)
```

En UX-regel kan deretter vise til produktkravet:

```md
### UX-JRN-005 — Avtaleendring skal vise hvem som må godkjenne

**Forankring:** PS-LOAN-012, UX-P03
```

En viktig teknisk beslutning kan til slutt vise til kravene den skal oppfylle:

```md
# ADR-0007 — ...

**Forankring:** PS-LOAN-012, UX-JRN-005
```

## ID-er

### Visjon

De 18 styrende produktprinsippene bruker permanente ID-er `VP-01`–`VP-18`.

Andre deler av visjonen trenger ikke ID-er bare for sporbarhet. Når et krav bygger på en mer detaljert del av visjonen, brukes en vanlig Markdown-lenke til relevant dokument og overskrift.

### Produktspesifikasjon

Normative, selvstendige produktkrav får en stabil ID med prefiks `PS-` og områdekode:

- `PS-DOM-` — domeneregler
- `PS-USR-` — brukere, kontoer og relasjoner
- `PS-ENV-` — miljøer
- `PS-OBJ-` — utlånsobjekter
- `PS-LOAN-` — låneforløp
- `PS-COM-` — kommunikasjon, varsler og saker
- `PS-TRUST-` — tillit, anmeldelser og moderering
- `PS-ADM-` — administrasjon og livssyklus
- `PS-NFR-` — ikke-funksjonelle krav

Nummeret er tre sifre innen området, for eksempel `PS-LOAN-012`.

### UX

De vedtatte styrende UX-prinsippene bruker `UX-P01`–`UX-P23`.

Andre normative UX-regler bruker `UX-` med områdekode:

- `UX-IA-` — informasjonsarkitektur og navigasjon
- `UX-JRN-` — brukerreiser
- `UX-EXC-` — avvik, konflikter og unntaksforløp
- `UX-INT-` — interaksjonsmønstre
- `UX-PRIV-` — kontekst, roller og personvern
- `UX-A11Y-` — mobil og tilgjengelighet
- `UX-VAL-` — scenariovalidering

Nummeret er tre sifre innen området.

### Arkitektur

Vanlig arkitekturtekst trenger ikke ID-er bare for sporbarhet. Viktige tekniske veivalg som bør kunne forstås eller revurderes senere dokumenteres som ADR-er med permanente ID-er `ADR-0001`, `ADR-0002` osv.

Hvis det senere oppstår et reelt behov for å referere til en mindre arkitekturregel som ikke fortjener en ADR, kan regelen få en lokal `ARCH-*`-ID. Dette skal være unntaket, ikke standarden.

## Forankringslinjen

Et normativt utsagn som er avledet fra tidligere lag får en kort linje rett under overskriften:

`**Forankring:** ...`

Linjen skal bare inneholde de kildene som faktisk begrunner eller begrenser utsagnet. Det er ikke et mål å liste alle indirekte relaterte prinsipper.

- Bruk ID når kilden har en stabil ID.
- Bruk relativ Markdown-lenke når kilden er en detaljert visjonstekst uten ID.
- Et utsagn kan ha flere kilder.
- Ikke kopier begrunnelsen inn i flere dokumenter; lenk til den.

## Hva skal ha ID?

ID-er brukes på **normative utsagn som andre deler av planen kan trenge å referere til**.

ID-er brukes normalt ikke på:

- forklarende prosa
- eksempler
- begrunnelser
- overskrifter som bare grupperer innhold
- brukerreiser eller scenarioavsnitt som ikke fastsetter en regel
- tekniske beskrivelser som ikke representerer et selvstendig valg

Dette holder dokumentasjonen lesbar og hindrer at hvert avsnitt blir et kravobjekt.

## Stabilitet

En ID skal aldri skifte betydning.

- ID-er renummereres ikke for å fylle hull.
- En utgått ID gjenbrukes ikke.
- Hvis et krav erstattes, markeres det som erstattet og peker til den nye ID-en når historikken er relevant.
- Små redaksjonelle forbedringer kan gjøres uten ny ID så lenge den normative betydningen er den samme.

## Påvirkningsanalyse

Det opprettes ingen egen liste over «hvem peker på meg». Når et prinsipp eller krav vurderes endret, brukes reposøk på ID-en for å finne alle nedstrøms referanser.

Dette gir bidireksjonal *finnbarhet* uten bidireksjonell *vedlikeholdsbyrde*.

## Når modellen skal utvides

Mer avansert sporbarhet skal bare innføres hvis den enkle modellen faktisk blir utilstrekkelig, for eksempel hvis automatisert kravdekning, regulatorisk dokumentasjon eller svært mange kryssavhengigheter senere gjør det nødvendig.
