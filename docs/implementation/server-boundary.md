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

## Vennskap og blokkering

- Sosiale kommandoer navngir bare den andre brukeren. Den som kaller er alltid den ene parten, så ingen input kan nå andres relasjoner. Alle endringer for samme par låses mot hverandre i databasen.
- En bruker som har blokkert den som spør, skal se ut som en bruker som ikke finnes (`not_found`), både i svar og i lister. Om den andre har blokkert deg, returneres aldri, og blokkerings- og lukkingshendelser er audit-hendelser uten payload.
- Nye domener som oppretter ny kontakt eller nye forpliktelser (direkte vennelån, chat, medeierskap, oppdagelse), sjekker relasjonen med `socialRelationBetween` i samme transaksjon som beslutningen. Etablerte lån, saker og anmeldelsesretter skal ikke sjekkes mot blokkering på nytt (PS-USR-007).

## Innlogging og sesjon

Supabase Auth brukes bare gjennom `packages/auth`. Nettleseren snakker aldri med Supabase direkte og får ingen token: sesjonen ligger i HttpOnly-cookies, og en `proxy` fornyer utløpte tilgangstokener. Endrende forespørsler må komme fra appens egen origin.

## Miljøer

- Hver miljøpolicy starter med samme synlighetsregel: åpne og lukkede miljøer kan leses av alle innloggede, mens et skjult miljø bare finnes for egne medlemmer og inviterte. Alle andre får `not_found`, akkurat som for et miljø som ikke finnes (PS-NFR-002). Administrasjon krever rollen og et aktivt medlemskap.
- Kommandoer som endrer medlemskap eller krav i et miljø låser miljøraden, så innmelding, godkjenning og kravendring ikke kan krysse hverandre.
- Et medlemskrav endres aldri. Endret tekst blir et nytt krav, og aktivering skjer etter kravene som gjelder da. Svar må dekke nøyaktig de gjeldende kravene, ellers gir kommandoen `conflict`.
- Et aktivt medlem med utløpt overgangsfrist regnes som passivt med en gang. Den planlagte jobben `/api/internal/environment-memberships` registrerer overgangen etterpå.

## Privilegert tilgang, ny innlogging og habilitet

- **Plattformforvalter** (PS-USR-008) er en eksplisitt rolle i `app.platform_role_grants`. Rollen leses fra databasen på hver forespørsel og hentes aldri fra Supabase-metadata, utviklertilgang eller databasetilgang. Tilbakekalling stempler raden, så historikken består, og den virker umiddelbart.
- **Tildeling og fjerning** skjer foreløpig bare med driftskommandoen `pnpm ops:platform-role grant|revoke --email <adresse> --reason "<begrunnelse>"`. Den kjører som systemprosessen `ops.platform_roles` gjennom samme kommando- og policygrense og lager audit-hendelser. Begrunnelsen lagres bare på raden. Endringen er idempotent: kommandoen skriver ut nøkkelen før den kjører, og et nytt forsøk med `--idempotency-key <nøkkel>` gir samme resultat uten ny endring eller hendelse. Kommandoen bruker `DATABASE_URL`, lokalt fra `.env`. Hvem som skal kunne utnevne plattformforvaltere inne i appen, er ikke bestemt.
- **Handlinger som plattformforvalter** starter policyen med `platformStewardAccess`: aktiv konto, rollen og en sesjon med sterkere autentisering (`aal2`). Avslag gir `forbidden` eller `stronger_authentication_required`.
- **Habilitet** (PS-USR-009): policyer for administrativ behandling skal ha `requireNotInvolved(...)` med alle som er part, rapportert eller ellers direkte berørt. Regelen gir `conflict_of_interest` uansett rolle eller sesjonsstyrke. Hva som skjer når ingen habil forvalter finnes, er åpent (OD-0008).
- **Ny innlogging** for sensitive handlinger: `requireRecentAuthentication()` krever at brukeren har bevist identiteten (for eksempel med e-postkode) de siste 10 minuttene, ellers `reauthentication_required`. Klienten løser dette med en ny e-postkode via `/api/auth/reauthenticate`, og koden går alltid til kontoens egen adresse.
- **Sterkere autentisering** er mekanismenøytral: hvilken mekanisme som gir `aal2`, er ikke bestemt (OD-0010), og vanlige brukere har ikke noe MFA-krav. Derfor godtar `resolveUserActor` ingen metode som sterkere ennå, uansett hva auth-leverandøren rapporterer, og lokal Supabase tilbyr ingen andre faktor. Handlinger som plattformforvalter avvises dermed (fail closed) til en mekanisme er besluttet i OD-0010 og implementert. OD-0010 er en sperre for å ta slike handlinger i reell bruk, ikke for dette grunnlaget. TOTP, passkeys/WebAuthn, Vipps eller annet skal ikke innføres uten den beslutningen. Den valgte mekanismen må legges til i `account/identity.ts` sammen med en revisjonslogget måte å ta den i bruk på, der oppsettet er loggført før en sterkere sesjon godtas.

