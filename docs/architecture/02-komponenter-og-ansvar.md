# Komponenter og ansvar

> **Status:** Systemarkitektur v0.1.

## Webklient

Ansvar:
- presentasjon og lokale UX-tilstander
- skjema-/draftbevaring ved nettverksfeil
- lokal kryptering/dekryptering av E2EE-chat
- tilgjengelighetssemantikk
- aldri beslutte autorisasjon eller endelig domenestatus alene

## Identitet og sesjon

Ansvar:
- kontoautentisering
- verifisert e-post
- sesjonsutstedelse/tilbakekalling
- sterkere autentisering for privilegerte roller
- re-autentisering ved særskilt sensitive handlinger

Produktprofil og sosial identitet skal holdes logisk adskilt fra autentiseringshemmeligheter.

## Domene-API

Ansvar:
- kommandoer og spørringer for brukere, miljøer, objekter, lån, saker og anmeldelser
- policy-/autorisasjonskontroll
- tilstandsoverganger og invariants
- idempotens
- transaksjoner
- publisering av domenehendelser til outbox

API-et bør organiseres etter domeneområder, ikke etter UI-sider.

## Datakjerne

Ansvar:
- autoritativ strukturert tilstand
- relasjonelle constraints
- avtaleøyeblikksbilder
- append-only relevante hendelser
- transaksjonell outbox

## E2EE-meldingskomponent

Ansvar:
- samtale-/deltakeridentifikasjon
- lagring og levering av kryptert meldingsinnhold
- klientnøklenes nødvendige offentlige materiale
- krypterte private vedlegg
- ingen kobling som gir administrator generell lesetilgang

## Saks-/administrasjonskomponent

Ansvar:
- serverlesbar, strengt autorisert sakskommunikasjon
- separate første forklaringer
- dokumentasjon som bruker uttrykkelig sender inn
- saksbehandlertildeling og habilitet
- revisjonshendelser

## Varslingskomponent

Ansvar:
- bygge brukerrettede varsler fra committed domenehendelser
- klassifisere varslingsnivå
- respektere kanalpreferanser
- ikke endre domenestatus

## Søk/geografi

Ansvar:
- avledet indeks av kun oppdagbare data
- tekst- og geografisk søk
- rask fjerning ved avpublisering/tap av adgang
- ingen indeksering av skjulte miljøer for uvedkommende søk

Indeksen er aldri sannhetskilde for rettigheter eller faktisk ledighet.

## Medielager

Separate tilgangsmønstre:
- vanlige objektbilder
- administrative saksvedlegg
- klientkrypterte private chatvedlegg

De tre må ikke dele en «offentlig URL betyr adgang»-modell.

## Jobbkø/scheduler

Ansvar:
- tidsfrister og påminnelser
- gjennomføring av inaktivitets-/arkiveringsregler
- varseldistribusjon
- retry av idempotente bakgrunnsjobber
- housekeeping og sletting etter policy
