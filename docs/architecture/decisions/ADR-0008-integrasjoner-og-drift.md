# ADR-0008 — Første leverandører for e-post, push, kart og observability

**Status:** Vedtatt  
**Forankring:** ADR-0004, ADR-0005, PS-COM-001–PS-COM-003, PS-NFR-008, PS-NFR-010–PS-NFR-013

## Beslutning

### E-post

**Resend** brukes som første e-postleverandør.

- Supabase Auth bruker Resend som custom SMTP.
- Applikasjonsgenererte transaksjonelle e-poster sendes gjennom et internt e-postadapter over Resend API.
- Auth-e-post og øvrig transaksjonell e-post skal kunne få separate sending identities når produksjonsdomenet er etablert.
- E-postpayload skal inneholde minst mulig privat kontekst.

### Push

Første webimplementasjon bruker **standard Web Push** med service worker og VAPID-nøkler, uten OneSignal eller tilsvarende mellomleverandør.

Varslingsmodellen i databasen er sannhetskilden. Push inneholder bare minimumsinformasjon og peker klienten tilbake til autorisert innhold.

Native push velges først når en native klient faktisk bygges.

### Kart og geokoding

Kartklienten bruker **MapLibre GL JS**.

For Norge brukes i første omgang **Kartverket**:

- Adresse REST-API for adressesøk/geokoding
- Kartverkets WMTS/cache som kartgrunnlag

Kart- og geokodingstilgang kapsles bak adaptere. Full privat adresse eller skjult miljøkontekst skal ikke sendes til karttjenester med mindre funksjonen uttrykkelig krever det.

### Bakgrunnsarbeid

Transactional outbox i ADR-0004 behandles av idempotente worker-endepunkter i samme backend. **Vercel Cron** brukes som første scheduler for tidsstyrt prosessering.

Et separat køprodukt innføres ikke i Fase 0. Hvis volum, tidskrav eller retry-behov senere gjør database-outbox + worker utilstrekkelig, kan køleverandør legges til bak worker-grensen.

### Observability

Baseline er:

- strukturerte JSON-logger med sentral redaksjon av secrets og persondata
- Vercel Runtime Logs/Observability for teknisk drift
- helse-/readiness-endepunkt uten sensitive data
- ingen tredjeparts feilrapportering som mottar request bodies eller brukerinnhold i Fase 0

OpenTelemetry eller ekstern feilrapportering kan legges til senere dersom behovet oppstår, men må følge dataminimeringskravene.

## Begrunnelse

Disse valgene dekker pilotbehovet med få eksterne leverandører og lav leverandørlåsing. Web Push er en nettstandard. MapLibre skiller kartklienten fra kartdataleverandøren, og Kartverket tilbyr norske adresse- og karttjenester uten at Lånbort bindes til Google/Mapbox.

Vercel Cron er tilstrekkelig som enkel scheduler fordi den autoritative retry-/leveringsstatusen ligger i databasen, ikke i cron-systemet.

## Konsekvenser

- Alle integrasjoner får interne adaptergrenser og kan erstattes.
- Provider-webhooks må verifiseres kryptografisk der leverandøren tilbyr signering.
- Scheduler-endepunkter skal beskyttes med egen hemmelighet og være idempotente.
- Kart-/push-/e-postleverandører er aldri sannhetskilde for domenestatus eller tilgang.
