# ADR-0001 — Relasjonell transaksjonell kjerne med separat hendelseshistorikk

**Status:** Vedtatt
**Forankring:** PS-NFR-004, PS-NFR-009, PS-LOAN-006

## Beslutning

Bruk PostgreSQL som referanse og planlagt autoritativ database for strukturert kjernedata. Gjeldende tilstand lagres i ordinære relasjonelle tabeller. Viktige historiske domene-/revisjonshendelser lagres append-only i tillegg.

Full event sourcing brukes ikke som grunnmodell.

## Begrunnelse

Lånbort trenger sterke relasjonelle invariants, transaksjonell godkjenning av kolliderende tidsintervaller og effektiv lesing av gjeldende status. Samtidig krever produktet sporbar historikk uten stille omskriving. Denne kombinasjonen løses enklere med relasjonell nåtilstand + hendelseslogg enn med full event sourcing.
