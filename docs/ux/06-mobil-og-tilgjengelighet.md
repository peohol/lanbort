# Mobil og tilgjengelighet

> **Status:** UX-modell v0.1.

### UX-A11Y-001 — Mobil er primær komposisjon
**Forankring:** UX-P12; PS-NFR-011

Kjerneflyter skal først kunne løses på smal mobilskjerm uten horisontal scrolling eller desktop-avhengige hovermønstre. Desktop kan vise flere paneler samtidig, men skal bruke samme begreper og handlinger.

### UX-A11Y-002 — Berøringshandlinger har synlig alternativ
**Forankring:** UX-P10

Sveip, langtrykk og andre gestbaserte snarveier kan brukes som tillegg, men ingen nødvendig handling skal bare være tilgjengelig via gest.

### UX-A11Y-003 — Tastaturnavigasjon dekker alle kjernefunksjoner
**Forankring:** UX-P10; PS-NFR-010

Interaktive kontroller skal kunne nås og aktiveres med tastatur, med forståelig fokusrekkefølge og synlig fokusmarkør.

### UX-A11Y-004 — Semantikk og status skal kunne formidles til hjelpemidler
**Forankring:** UX-P10

Overskrifter, skjemaetiketter, feilmeldinger, statusendringer og dialoger skal ha programmatisk semantikk. Viktige asynkrone endringer må kunne annonseres uten å kreve at brukeren oppdager en visuell endring.

### UX-A11Y-005 — Farge er aldri eneste signal
**Forankring:** UX-P10

Status, fare, godkjenning, frist og feil uttrykkes med tekst/ikon/struktur i tillegg til eventuell farge.

### UX-A11Y-006 — Berøringsmål skal være romslige og separerte
**Forankring:** UX-P10

Primære kontroller skal være enkle å treffe med finger og destruktive handlinger skal ikke ligge tett på vanlige handlinger uten tilstrekkelig separasjon.

### UX-A11Y-007 — Tekst og layout tåler forstørrelse
**Forankring:** UX-P10

Kjerneinnhold og handlinger skal fortsatt være tilgjengelige ved betydelig tekstforstørrelse. Fast høyde på tekstcontainere skal unngås.

### UX-A11Y-008 — Bevegelse skal ikke være nødvendig for forståelse
**Forankring:** UX-P10

Animasjoner kan forklare overgang, men informasjon og status skal være forståelig uten dem. Redusert bevegelse skal respekteres.

### UX-A11Y-009 — Nettverksstatus er tilgjengelig og ikke bare visuell
**Forankring:** UX-P22; PS-NFR-006

Offline/venter/feil/synkronisert skal uttrykkes med tekstlig status og relevante handlinger. Skjema-data bør bevares gjennom midlertidige feil.

## Responsiv modell

### Mobil
- fem hovedområder i bunnnavigasjon
- én hovedkolonne
- lokale handlinger nær innholdet
- detaljer/historikk åpnes progressivt

### Større skjerm
- samme hovedområder i side-/toppnavigasjon
- liste og detalj kan vises samtidig
- administrasjonskø kan bruke tabell-/flerspaltevisning
- ingen funksjon skal kreve desktop for ordinær bruker

Eksakte visuelle mål, typografi og designsystem fastsettes i detaljdesign/implementering, men må tilfredsstille disse modellkravene.
