# Hendelser, historikk og revisjon

> **Status:** Systemarkitektur v0.1.

## Tre historikklag

### Domenehendelser
Hendelser som forklarer produktets faktiske forløp, f.eks.:
- låneforespørsel sendt
- lån godkjent/kansellert
- ansvarlig utlåner overført
- overlevering/retur bekreftet
- problem meldt etter tidligere bekreftelse
- medlems-/rolleendring med produktvirkning

Disse kan være brukersynlige når de hjelper forståelse.

### Revisjonshendelser
Administrative eller sikkerhetsrelevante handlinger som må kunne etterprøves:
- rolletildeling/fjerning
- moderering
- eierskapsoverføring
- tilgang til særlig sensitive administrative prosesser
- representanttilgang

Revisjonsloggen er normalt ikke bredt brukersynlig.

### Tekniske sikkerhetslogger
Innlogging, feil, rate-limit, mistenkelig tilgang og driftsdata. Disse har kortere, eksplisitt retention og skal ikke bli sosial historikk.

## Hendelsesformat

Relevante hendelser bør minst kunne inneholde:
- hendelses-ID
- type og versjon
- tidspunkt
- aktør (eller system)
- målressurs og kontekst
- korrelasjons-/request-ID
- minimal nødvendig payload
- eventuell årsak/forrige hendelse

Sensitive data skal ikke kopieres ukritisk inn i hendelsespayload.

## Append-only

Hendelser som er blitt autoritative slettes/endres ikke av ordinære produktoperasjoner. Korreksjon registreres som ny hendelse. Personvernkrav håndteres gjennom begrenset payload, pseudonymisering og tilgang — ikke ved å gjøre kritisk historikk vilkårlig muterbar.

## Transactional outbox

Domenehendelse og outbox-post opprettes i samme transaksjon som den autoritative tilstandsendringen. En separat worker distribuerer til:
- varslingsgenerator
- søkeindeks
- e-post/push
- analyse-/sikkerhetssystemer der formålet tillater det

Consumerne skal være idempotente.

## Brukersynlig tidslinje

Brukersynlig låne-/sakstidslinje bygges fra strukturerte domenehendelser og presentasjonsdata. Den er ikke en direkte dump av revisjons- eller sikkerhetslogger.
