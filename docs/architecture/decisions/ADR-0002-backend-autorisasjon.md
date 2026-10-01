# ADR-0002 — Backend-policy er autoritativ tilgangskontroll

**Status:** Vedtatt
**Forankring:** PS-NFR-001, PS-NFR-002, PS-NFR-003

## Beslutning

All autorisasjon skal avgjøres på backend/datagrensen ut fra aktør, handling, ressurs, kontekst og tilstand. UI-kontroller er kun presentasjon. Databasen kan ha forsvar-i-dybden som row-level policies/constraints, men klienten er aldri tillitsanker.

## Begrunnelse

Kontekstuelle roller, skjulte miljøer, medeierskap og historisk minimumstilgang kan ikke uttrykkes sikkert som én enkel global rolle.
