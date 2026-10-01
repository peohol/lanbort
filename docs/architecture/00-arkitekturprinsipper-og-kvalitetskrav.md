# Arkitekturprinsipper og kvalitetskrav

> **Status:** Systemarkitektur v0.1.

## Styrende prinsipper

### Transaksjonell kjerne
**Forankring:** PS-NFR-004, PS-NFR-005; PS-LOAN-006

Kjerneobjekter som lån, reservasjoner, roller og eierskap skal lagres i en transaksjonell datakilde som kan håndheve invariants også ved samtidige kall. Kritisk korrekthet skal ikke bero på at klienten «oppfører seg riktig».

### Autoritativ nåtilstand + append-only hendelseshistorikk
**Forankring:** PS-DOM-006, PS-NFR-009

Systemet bruker ordinære autoritative tilstandstabeller for effektiv lesing og append-only domene-/revisjonshendelser for det som må kunne forklares i ettertid. Full event sourcing er ikke nødvendig.

### Serveren stoler ikke på klientens rettighetsvurdering
**Forankring:** PS-NFR-001, PS-NFR-003

Klienten kan skjule eller deaktivere handlinger for UX, men enhver beskyttet lesing og mutasjon må valideres i backend/datagrense.

### Kontekstisolasjon er en datagrense
**Forankring:** PS-DOM-007, PS-NFR-002

Skjulte miljøer og andre begrensede kontekster må isoleres i spørringer, søkeindekser, cache, varsler, logger og feilsvar — ikke bare i skjermbildet.

### Asynkrone bivirkninger er avledet fra committed state
**Forankring:** PS-COM-002, PS-NFR-012

E-post, push, søkeindeksering og bakgrunnsjobber skal utløses fra en sikker hendelses-/outbox-mekanisme etter at den autoritative transaksjonen er lagret. Feil i varsling skal ikke rulle tilbake et ellers gyldig lån.

### Privat chat er et separat fortrolighetsdomene
**Forankring:** PS-COM-005, PS-NFR-007

Privat E2EE-chat skal ikke være den autoritative kilden til avtalevilkår eller lånestatus. Strukturerte hendelser og administrative saker lagres separat.

### Minimering foran bekvemmelighetskopiering
**Forankring:** PS-NFR-008

Data skal ikke kopieres inn i flere systemer uten nødvendig formål. Der avledede indekser/cacher finnes, må sletting og tilgangsendringer kunne propagere.

## Arkitekturmål

- korrekt håndheving av låne- og tilgangsinvariants
- personvern ved skjulte og historiske kontekster
- tydelig audit trail uten «logg alt»
- robusthet ved retry, samtidighet og nettverksbrudd
- mobilvennlig webklient med senere mulighet for native klient
- leverandørutskiftbare ytre integrasjoner der det er rimelig
