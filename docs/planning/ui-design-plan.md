# Plan for UI-designfasen

> **Status:** Vedtatt arbeidsplan. Fase 1–3 er fullført; kjerneflyt 1–4 har gjeldende HTML-prototyper, og kjerneflyt 5 («Samtaler og enheter») og 6 («Personer, venner og tillit») er arbeidsutkast med åpne produktspørsmål (9. oktober 2026). Prototypene er ennå ikke implementert som samlet UI i appen. Se [gjeldende designreferanser](../../design/README.md). Planen innfører ikke nye produktkrav eller UX-regler.

## Formål

UI-designfasen skal oversette den eksisterende produktspesifikasjonen og UX-modellen til et enkelt, sammenhengende og visuelt tydelig grensesnitt uten å gjenåpne allerede vedtatte produktvalg.

Målet er ikke å gjøre systemet enkelt internt, men å gjøre kompleksiteten håndterbar for brukeren. Vanlige brukere skal møte et lett og forståelig produkt, mens administrator- og forvalterflater skal organisere avansert funksjonalitet uten å eksponere mer kompleksitet enn situasjonen krever.

## Autoritet og arbeidsdeling

Den eksisterende dokumentasjonen er styrende i denne rekkefølgen:

1. `docs/vision/`
2. `docs/product-spec/`
3. `docs/ux/`
4. `docs/architecture/`

UI-design kan foreslå bedre måter å uttrykke vedtatte regler på, men skal ikke stille endrede produktregler som ferdige designbeslutninger.

Dersom designarbeidet avdekker et reelt hull eller en konflikt:

- produktatferd avklares i produktspesifikasjonen
- UX-regler avklares i UX-laget
- tekniske spørsmål avklares i arkitekturen
- uavklarte detaljvalg registreres i `docs/open-decisions.md`

En mockup eller prototype er aldri i seg selv kilde til ny produktlogikk.

### Roller i arbeidsflyten

- **Claude Design eller Claude Code Projects** kan lage og revidere designprototyper. Begge skal følge gjeldende designreferanser i `design/README.md`, slik at tidligere designbeslutninger videreføres.
- **Claude Code** kan også implementere godkjente designbolker i den faktiske appen, men designprototyper og produksjonsimplementering er separate oppgaver.
- **Repoets kanoniske dokumentasjon** er kilde til produktatferd, tilstander, roller, personvern og avvikshåndtering.
- **Produktgodkjenning** skjer på nivåer der ulike valg faktisk gir vesentlig forskjellig brukeropplevelse eller produktatferd.

## Arbeidsprinsipper

- Mobil utformes først, men samme mentale modell skal fungere på større skjermer.
- Normalforløpet prioriteres visuelt; sjeldne handlinger og avvik avdekkes kontekstuelt.
- Design skal redusere behovet for menyhierarkier og flytte handlinger nær objektet eller situasjonen de gjelder.
- Visuelle løsninger skal bygge på eksisterende brukerreiser og tilstander fremfor å lage parallelle UI-modeller.
- Designsystemet skal vokse ut av reelle behov i produktet, ikke konstrueres fullstendig på forhånd.
- Design og implementering kjøres i korte, vertikale bolker slik at løsninger kan prøves i faktisk nettleser før hele appen er ferdigdesignet.
- Tilgjengelighet, lesbarhet og tydelig statuskommunikasjon er del av selve designet, ikke etterarbeid.

## Fase 1 — Skjerm- og flytinventar

**Status:** Ferdig.

Før visuell design skal det lages et eksplisitt inventar over nødvendige flater, sentrale tilstander og hovedflyter.

Inventaret grupperes minst i:

- ordinær bruker
- miljøadministrator
- forvalter

For hver sentral flate skal vi vite:

- hvilken brukeroppgave den støtter
- hvilke viktige tilstander den må representere
- hvilke roller som kan se eller handle der
- hvilke eksisterende `PS-*`- og `UX-*`-regler som er relevante
- om den inngår i et normalforløp eller hovedsakelig håndterer avvik

Inventaret er en dekningssjekk, ikke en spesifikasjon av visuell løsning.

Inventaret finnes i [skjerm- og flytinventaret](../ux/08-skjerm-og-flytinventar.md).

## Fase 2 — Visuell informasjonsarkitektur og navigasjon

**Status:** Ferdig 7. oktober 2026. Strukturen er låst i [skjermstruktur og navigasjon](../ux/01-informasjonsarkitektur-og-navigasjon.md#skjermstruktur-og-navigasjon) (UX-IA-009–015): den konsoliderte retningen, navigasjonsstabelen, hjemområdene, direkte innganger og oppgaver som åpner arbeidsflaten direkte. Designreferansen er `design/Fase 2 IA-retninger iterasjon 3.html`, særlig 3a og 3b. Eldre iterasjoner er bevart i git-historikken, men fjernet fra aktivt designgrunnlag. Ukjent nettverksutfall og ansvarserklæringen ved vennelån er fortsatt krav, men endrer ikke strukturen og designes i fase 4.

Den vedtatte informasjonsarkitekturen og navigasjonsmodellen oversettes til konkret skjermstruktur.

Arbeidet skal avklare hvordan blant annet følgende faktisk oppleves:

- Hjem
- Finn
- Mine ting
- lån og lånedetaljer
- samtaler
- profiler
- miljøer
- kontekstuelle administrative oppgaver

Fokus er hierarki, orientering, neste relevante handling og hvor lite global navigasjon som er nødvendig.

Ingen detaljert visuell stil låses før denne strukturen fungerer.

## Fase 3 — Alternative visuelle retninger

**Status:** Fullført. Retningen «Lune flater» (1B) ble valgt som grunnlag, med ikonbruk fra de andre foretrukne retningene. Den ble videreutviklet til en lysere, varmere og dempet Tomat-palett. Den aktive stilreferansen er `design/Fase 4 Tomat finjustering.html`; tidligere visuelle alternativer finnes i git-historikken.

Claude Design lager et lite antall tydelig forskjellige visuelle retninger for representative skjermer.

Retningene skal være reelt forskjellige i uttrykk og informasjonsbehandling, ikke bare varianter av farger og dekorasjon.

Representative flater bør minst omfatte:

- Hjem
- objektside
- aktivt lån

Vi vurderer blant annet:

- visuelt hierarki
- informasjonsmengde
- typografi
- bruk av kort og flater
- ikonografi
- statusuttrykk
- opplevd enkelhet og tillit
- egnethet for mobil

Én retning velges og videreutvikles før resten av appen designes.

## Fase 4 — Én komplett kjerneflyt

**Status:** Prototypet i `design/Lånbort Kjerneflyt v2.html`. Designet er ikke i seg selv implementert i appen.

Den valgte retningen brukes først på én sammenhengende ende-til-ende-flyt:

**oppdage objekt → objektside → låneforespørsel → godkjenning → reservert lån → overlevering → aktivt lån → retur**

Flyten skal dekke både normaltilstander og de viktigste situasjonene som påvirker brukerens forståelse av avtalen, uten at alle sjeldne avvik må ferdigdesignes samtidig.

Denne fasen skal bevise at:

- status er forståelig
- neste handling er tydelig
- forpliktelser og samtykke har passende friksjon
- overgangen fra godkjent/reservert lån gjennom fysisk overlevering til aktivt lån er forståelig
- samme lånemodell oppleves konsistent gjennom hele forløpet
- mobilopplevelsen fungerer uten å være avhengig av desktopplass

## Fase 5 — Utled designsystemet

Når kjerneflyten fungerer, dokumenteres og konsolideres de visuelle mønstrene som allerede har vist seg nyttige.

Dette omfatter etter behov:

- typografi
- spacing
- farger og semantiske statusuttrykk
- knapper og handlingstyper
- kort og lister
- skjemaelementer
- navigasjon
- dialoger og bekreftelser
- varsler og oppmerksomhetsnivåer
- tomtilstander og feiltilstander
- ikoner
- fokus-, hover- og tastaturtilstander
- responsive regler

Målet er et lite, konsistent system som dekker reelle behov. Nye komponentvarianter skal ha en konkret grunn.

## Fase 6 — Utvid ordinær brukerflate

**Status:** Pågår. Gjeldende prototyper i `design/` dekker registrering av ting (kjerneflyt 2), finne/bli med i miljø (3), Hjem/varsler (4), Samtaler/enheter (5, ennå ikke godkjent) og Personer, venner og tillit (6, WP-86, ennå ikke godkjent). Se `design/README.md` for eksakte aktive filnavn og status.

Deretter designes resten av sluttbrukeropplevelsen med gjenbruk av de etablerte mønstrene.

Prioritet gis til de hyppigste og viktigste brukerreisene før sjeldne historikk- og avviksflater.

Nye flater skal som hovedregel løses med eksisterende komponenter og interaksjonsmønstre. Hvis dette ikke fungerer, vurderes om designet eller selve mønsterbiblioteket bør utvides.

## Fase 7 — Administrator- og forvalterflater

Administrative funksjoner designes etter at den ordinære brukerflaten har etablert designspråket.

Målet er ikke å skjule nødvendig kompleksitet, men å organisere den rundt konkrete oppgaver og kontekst.

Administratorer og forvaltere skal så langt som mulig møte:

- arbeidsoppgaver fremfor abstrakte kontrollpaneler
- tydelig rolle og handlingsrom
- bare relevante handlinger i den aktuelle situasjonen
- progressiv avdekking av detaljer, historikk og sjeldne funksjoner
- samme grunnleggende språk og komponentmønstre som resten av appen

## Parallelt spor fra fase 4 — Vertikal implementering og validering

Dette er ikke et avsluttende trinn etter designfasene. Sporet starter så snart den første sammenhengende designbolken i fase 4 er stabil nok, og løper parallelt med fase 4–7.

Design skal dermed ikke ferdigstilles isolert før implementering begynner.

Når en sammenhengende bolk er stabil nok:

1. designet implementeres i appen
2. den faktiske løsningen prøves responsivt i nettleser
3. visuelle, interaksjonsmessige og tilgjengelighetsmessige svakheter korrigeres
4. forbedringer tilbakeføres til designmønstrene før neste bolk

Dette gjentas gjennom hele UI-fasen.

Implementeringen skal ikke bruke designet som grunnlag for å omgå eller endre vedtatt produktlogikk.

## Kvalitetsporter

En designbolk er klar for implementering når:

- den kan spores til eksisterende produkt- og UX-regler
- normale tilstander og sentrale statusendringer er forståelige
- primær handling og neste steg er tydelige
- sjeldne valg ikke dominerer normalforløpet
- personvern- eller forpliktelseskonsekvenser er synlige når de må være det
- løsningen fungerer prinsipielt på mobil og større skjermer
- grunnleggende tilgjengelighet er ivaretatt
- den ikke innfører uavklarte produktregler gjennom designet

## Når UI-designfasen er ferdig

Fasen regnes som moden når:

- alle nødvendige hovedflater er dekket av skjerm- og flytinventaret
- de viktigste ende-til-ende-reisene fungerer sammenhengende
- ordinær bruker, administrator og forvalter har komplette hovedarbeidsflater
- designsystemet er konsistent og dekker appens faktiske behov
- sentrale avvik og tom-/feiltilstander er designet
- løsningene er validert i implementert, responsiv form
- vesentlige funn fra designarbeidet er tilbakeført til riktig kanonisk dokumentasjonslag

