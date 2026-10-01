# Servergrense og autorisasjon

> **Status:** Gjeldende mønster fra Fase 1. Forankret i [ADR-0002](../architecture/decisions/ADR-0002-backend-autorisasjon.md), [ADR-0004](../architecture/decisions/ADR-0004-transactional-outbox.md) og [autorisasjonsarkitekturen](../architecture/04-autorisasjon-og-tilgang.md).

All lesing og endring av domenedata går gjennom samme vei:

```text
Route Handler (route.user / route.public / route.scheduler)
  → aktør fastslås (verifisert identitet → intern aktør)
  → kommando eller spørring (executeCommand / executeQuery)
     → policy: aktørregler → last nåtilstand → ressursregler
     → endring + hendelser + outbox + idempotent resultat i én transaksjon
```

## Regler for ny kode

1. **Route Handlers** lages bare med `route.user`, `route.public` eller `route.scheduler` fra `apps/web/src/server/http/route.ts`. En test finner alle `route.ts`-filer og feiler hvis en handler ikke er laget slik, eller hvis en offentlig eller planlagt rute ikke er oppført med begrunnelse.
2. **Domenedata** endres bare gjennom `defineCommand` og leses gjennom `defineQuery` i `packages/domain`. Begge krever en policy. Lint stopper direkte import av database- og auth-pakker utenfor `apps/web/src/server`.
3. **Policyer** lages med `definePolicy` og modellen aktør + handling + ressurs + kontekst + tilstand. Alt er avvist til en regel tillater det. Bruk `not_found` når eksistens ikke skal avsløres. Nye policyer legges i `allPolicies`, og `policies.test.ts` krever en testmatrise med minst ett tillatt og ett avvist tilfelle.
4. **Hendelser** defineres med `defineEvent` og et strengt payload-skjema med bare nødvendige ID-er og koder, aldri navn, e-post eller fritekst. Asynkrone bivirkninger blir outbox-consumers som må tåle at samme melding leveres flere ganger.
5. **Viktige mutasjoner** settes til `idempotency: "required"`. Klienten sender `Idempotency-Key` og gjenbruker nøkkelen ved nye forsøk.
6. **Feil** til klienten er bare koder fra `@lanbort/contracts` (`apiErrorCodes`). Meldinger, verdier og interne detaljer sendes aldri.

## Innlogging og sesjon

Supabase Auth brukes bare gjennom `packages/auth`. Nettleseren snakker aldri med Supabase direkte og får ingen token: sesjonen ligger i HttpOnly-cookies, og en `proxy` fornyer utløpte tilgangstokener. Endrende forespørsler må komme fra appens egen origin.
