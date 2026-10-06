# Arkitekturbeslutninger

> **Status:** Vedtatte arkitekturbeslutninger er listet nedenfor.

Konkrete teknologivalg og andre viktige arkitekturbeslutninger dokumenteres her når beslutningsgrunnlaget er modent. Denne mappen skal ikke brukes til å forskuttere teknologivalg før produktspesifikasjon og UX-modell gir tilstrekkelig grunnlag.

## Nummerering og forankring

Hver beslutning får et permanent løpenummer: `ADR-0001`, `ADR-0002` osv. Nummer gjenbrukes eller renummereres ikke.

ADR-en skal ha en kort `Forankring`-linje med ID-ene til produktkrav og UX-regler beslutningen skal oppfylle. Se [sporbarhetskonvensjonen](../../traceability.md).

## Vedtatte beslutninger

1. [ADR-0001 — Relasjonell transaksjonell kjerne med separat hendelseshistorikk](ADR-0001-relasjonell-kjerne.md)
2. [ADR-0002 — Backend-policy er autoritativ tilgangskontroll](ADR-0002-backend-autorisasjon.md)
3. [ADR-0003 — Privat E2EE-chat holdes adskilt fra strukturerte lånehendelser og saker](ADR-0003-e2ee-separasjon.md)
4. [ADR-0004 — Transactional outbox for asynkrone bivirkninger](ADR-0004-transactional-outbox.md)
5. [ADR-0005 — Søk er avledet indeks, aldri tilgangs- eller sannhetskilde](ADR-0005-sok-som-avledet-indeks.md)
6. [ADR-0006 — TypeScript/Next.js som modulær web- og API-applikasjon](ADR-0006-applikasjonsstack-og-runtime.md)
7. [ADR-0007 — Supabase for PostgreSQL, autentisering og fillagring](ADR-0007-supabase-data-auth-og-storage.md)
8. [ADR-0008 — Første leverandører for e-post, push, kart og observability](ADR-0008-integrasjoner-og-drift.md)
9. [ADR-0009 — Backup i utviklingsfasen: Supabase Free, gjenoppbygging og manuelle dumps](ADR-0009-backup-i-utviklingsfasen.md)
10. [ADR-0010 — E2EE-protokoll for privat chat: MLS, kontonøkkel, enheter og recovery](ADR-0010-e2ee-protokoll-enheter-og-recovery.md)
11. [ADR-0011 — Privilegert autentisering: WebAuthn som andre faktor for plattformforvaltere](ADR-0011-webauthn-for-plattformforvaltere.md)
