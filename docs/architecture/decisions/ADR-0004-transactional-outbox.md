# ADR-0004 — Transactional outbox for asynkrone bivirkninger

**Status:** Vedtatt
**Forankring:** PS-COM-002, PS-NFR-005, PS-NFR-012

## Beslutning

Varsler, e-post/push, søkeindeksering og andre asynkrone bivirkninger skal drives fra en transactional outbox eller tilsvarende mekanisme som skrives i samme transaksjon som domenetilstanden.

## Begrunnelse

Et gyldig lån skal ikke forsvinne fordi e-postleverandøren feiler, og et varsel skal ikke sendes for en transaksjon som aldri ble committed. Consumerne kan retries idempotent.
