# ADR-0006 — TypeScript/Next.js som modulær web- og API-applikasjon

**Status:** Vedtatt  
**Forankring:** PS-NFR-001–PS-NFR-006, PS-NFR-010, PS-NFR-012, UX-A11Y-001–UX-A11Y-009

## Beslutning

Første implementasjon bygges som en **modulær monolitt** i TypeScript:

- **Node.js 24.x**
- **Next.js 16.3** med App Router
- **Vercel** som første hostingplattform
- **pnpm workspace** som repoformat, uten Turborepo eller annen ekstra orkestrator i utgangspunktet
- **Next.js Route Handlers** som eksplisitt HTTP/API-grense for domenekommandoer og spørringer
- **Zod** eller tilsvarende runtime-validering ved alle eksterne innganger
- **Vitest** for raske enhets-/integrasjonstester og **Playwright** for nettleser-/ende-til-ende-tester

Web-UI og backend kan bo i samme deploy, men domeneregler og autorisasjon skal ligge i servermoduler bak API-/servicegrensen, ikke i React-komponenter eller klientlogikk. Server Actions kan brukes for rent UI-nære operasjoner, men skal ikke bli den eneste programgrensen for domenet.

Repoet organiseres slik at en senere mobilklient kan legges til uten å flytte den autoritative backendlogikken. Delte API-kontrakter kan ligge i en egen pakke; klienter skal ikke dele serverens autorisasjonslogikk.

## Begrunnelse

Dette gir én enkel deploybar enhet i den tidlige fasen, samtidig som API-grensen gjør det mulig å legge til en native klient senere. Next.js/Vercel gir moden webdrift uten egen serverforvaltning, mens Node-runtime beholder full kompatibilitet med Postgres-drivere, kryptografi og testverktøy.

En liten pnpm-workspace gir plass til webapp og delte pakker uten å innføre et ekstra monorepo-byggesystem før det finnes et reelt behov.

## Konsekvenser

- Node-versjon låses til 24.x i repo og CI.
- Next.js patchversjoner skal holdes oppdatert innen 16.3-serien eller senere kompatibel aktivt støttet serie; lockfil er autoritativ for faktisk installert versjon.
- Domenet skal ikke gjøres avhengig av Vercel-spesifikke API-er der et lite internt adapter kan holde grensen generell.
- Native mobilapp er ikke del av første implementasjon, men kan senere bruke samme HTTP-grense.
