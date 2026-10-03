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

## Objekter og bilder

- Et objekt (PS-OBJ-001) har én global sannhet i `app.objects` og tilhører eierne i `app.object_owners`, aldri et miljø. Utenom en aktiv publisering (se under) ser bare eierne objektet; alle andre får `not_found`.
- Endringer krever `expectedVersion`. Er objektet endret siden, avvises endringen med `conflict` i stedet for å overskrive nyere data.
- Generell tilgjengelighet lagres som datointervaller som aldri overlapper; intervaller som berører hverandre slås sammen. Faktisk ledighet lagres aldri: den beregnes av `deriveAvailability` som tilgjengelighet minus sperrer. Nye domener som kan sperre nye lån (godkjente lån, uavklart besittelse, medeierbegrensninger), legger til en kilde i `availabilityBlockSources` i stedet for å lage egen ledig-status.
- Kategoristrukturen er åpen (OD-0006). Bare «Annet» finnes til den er besluttet; nye kategorier legges inn som data i en migrasjon.
- Bilder går bare gjennom `@lanbort/storage`. Serveren dekoder og koder hvert bilde på nytt til WebP uten metadata (også posisjon) før det lagres i den private bøtta `object-images`, og leverer det ut bare etter objektets lesepolicy. Nettleseren når aldri lagringen direkte. Før en fil lagres, registreres opplastingen i outbox, så en fil som aldri ble knyttet til objektet (for eksempel etter et krasj), slettes etter 15 minutter. Filen til et fjernet bilde slettes etter commit, også via outbox.

## Medeierskap

- En medeier er en vanlig rad i `app.object_owners`, og alle registrerte eiere har de samme objektrettighetene (PS-OBJ-007). Medeierskap gir ikke innsyn i miljøkontekster eller lånedetaljer: policyer for publisering (WP-25) og lån (Fase 3) må sjekke sin egen relasjon i tillegg til eierskapet.
- Man blir medeier bare ved å godta en invitasjon selv. Invitasjon og aksept tar parlåsen fra vennskap og blokkering mot hver eier (og ved aksept også mot de andre inviterte), så en samtidig blokkering enten stopper dem eller ser dem. En blokkering mellom den inviterte og en eier lukker invitasjonen, og ser ut som en konto eller invitasjon som ikke finnes.
- En blokkering mellom to medeiere fryser objektet for nye lån i samme transaksjon som blokkeringen (databasetrigger på `app.user_blocks`). Frysingen ender bare når objektet har én eier igjen, ikke når blokkeringen oppheves. Finn-flater utelater frosne objekter.
- Medeierbegrensninger (veto) og frysing er kilder i `availabilityBlockSources`, så faktisk ledighet aldri kan åpnes ved å redigere tilgjengeligheten. Bare den som satte en begrensning kan oppheve den; den opphører når vedkommende trer ut.
- Ingen kan fjerne en annen eier, bare tre ut selv, og den siste eieren kan ikke tre ut. Permanent sletting krever samtykke fra alle nåværende eiere.
- Forpliktelser som hindrer uttreden og sletting (reserverte, aktive og uavklarte lån), legges til av Fase 3 i `objectCommitmentSources`. Feiler en kilde, feiler kommandoen.
- Hver objektversjon har en uforanderlig rad i `app.object_revisions` med innhold, aktør og tidspunkt; databasen avviser en versjon uten. Gjenoppretting av tidligere innhold er en ny versjon. Fase 3 kan peke avtalesnapshot til en revisjon i stedet for dagens objekt (PS-OBJ-012).

## Publisering i miljøer

- En publisering (PS-OBJ-006) er en egen rad i `app.environment_publications`, aldri en del av objektet: publisering, godkjenning og avslutning endrer ikke objektet eller versjonen. Et objekt har høyst én gjeldende rad per miljø, og statusene er uavhengige mellom miljøer (PS-OBJ-017). En avsluttet publisering (`unpublished`) er historikk, og en ny publisering er en ny rad.
- Publisering krever eierskap og aktivt medlemskap. Ventende og aktive publiseringer krever i tillegg at minst én nåværende eier har aktivt medlemskap. Det håndheves i databasen: en trigger avslutter publiseringen (`access_lost`) i samme transaksjon som den siste eieren mister tilgang, uansett årsak til passiveringen, og nekter å gjøre en publisering levende uten tilgang. En utløpt overgangsfrist teller som tapt tilgang med en gang ved lesing.
- Forhåndsgodkjenning (PS-ENV-011) er et flagg på miljøet. Nye publiseringer starter som `pending` mens det er på. Å slå det på flytter aktive til `pending`, og å slå det av aktiverer bare `pending`. Avvisning (`rejected`) og blokkering (`blocked`) står til en administrator endrer dem, også gjennom tilgangstap, og er lokale: de er ikke plattformmoderering.
- `loadPublicationGate` er grensen Fase 3 skal bruke for nye låneforespørsler gjennom et miljø: `open` (aktiv), `on_hold` (venter på godkjenning) eller `closed`. Etablerte lån berøres aldri av publiseringsstatus.
- Hva et medlem finner i et miljø, avgjøres bare i `discoverablePublications`: aktive publiseringer av aktive, ufrosne objekter med en eier som har tilgang, og aldri et objekt der en eier og den som ser har blokkert hverandre, eller som ble publisert under en strengere type før den som ser ble aktiv (historisk personvern). Eierne vises ikke, og medeiere ser bare miljøer de selv kan se.
- Låserekkefølge: objekt, miljø, medlemskap, publisering.

## Låneforespørsler (WP-30)

- En låneforespørsel (PS-LOAN-001–005) er én rad i `app.loan_requests`, uansett om den kom gjennom et miljø eller direkte mellom venner. Bare opprinnelsen (`origin`) skiller dem. En miljøforespørsel peker på publiseringen den bygger på og har sin posisjon i miljøets historikk (PS-ENV-009). Ingenting reserveres, og forespørsler sperrer ikke ledighet; det er WP-31.
- `assessOrigin` er den ene sjekken av om tilgangen bak en forespørsel fortsatt står: objektet tar nye lån og låntaker er ikke eier, ingen blokkering mot noen eier, og enten vennskap med minst én eier (direkte) eller aktivt medlemskap og samme publisering med åpen port (miljø). En publisering som venter på godkjenning, eller et miljø under avvikling som ennå kan avbrytes, holder forespørselen (`on_hold`) i stedet for å avslutte den. Med `lock` tar den låsene i rekkefølgen objekt, miljø, medlemskap, publisering, sosiale par.
- Bortfall før godkjenning avslutter åpne forespørsler nøytralt i databasen, i samme transaksjon som årsaken (medlemskap, publisering, vennskap, blokkering, frysing, arkivering, eierskifte), uten hendelser. Årsakene (`access_lost`, `publication_ended`, `object_unavailable`) sier aldri hvem som gjorde hva. En avsluttet forespørsel endres aldri igjen.
- Den som ikke kan nå objektet gjennom opprinnelsen, får `not_found`. Gjennom et miljø avgjør `findsObject` det med samme regel som miljøets liste. En eier ser en forespørsel som utlåner bare med låntakerens relasjon til opprinnelsen: vennskap (direkte), eller aktivt medlemskap uten at forespørselen ble gjort under en strengere type før eieren ble aktiv (`visibleToLender`). Eierskap alene er ikke nok.
- `terms_version` peker på objektrevisjonen med vilkårene låntaker så og bekreftet. En ny revisjon med andre vilkår (`app.loan_terms_differ`, OD-0014) setter åpne forespørsler til `awaiting_terms_confirmation` til låntaker bekrefter gjeldende versjon.
- Direkte forespørsler har en ansvarserklæring med versjon (`responsibilityDeclarationVersion`). Låntaker godtar den når forespørselen sendes; en eier som er låntakers venn, godtar med egen kommando. Hver aksept er en uforanderlig rad. Godkjenning (WP-31) må sjekke at eieren som godkjenner har godtatt gjeldende versjon.
- Ønsket periode må få plass i ett sammenhengende intervall av faktisk ledighet (`earliestPeriod`). «Så snart som mulig» starter første ledige dag der hele varigheten, eller alle dager fram til ønsket sluttdag, er ledige uten brudd.
- Sletting av objektet stopper ikke på forespørsler. `app.release_loan_requests` avslutter de åpne nøytralt og løsner alle fra objektets rader før de slettes. Forespørslene består som historikk for begge parter uten objektets innhold, og eierne på slettetidspunktet (`former_owner_ids`) ser dem fortsatt med samme relasjonskrav.
- Meldingen lagres bare på forespørselen og kopieres aldri til hendelser eller logger (OD-0015).

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
- En invitasjon er ny kontakt mellom administratoren og den inviterte. Blokkering i én av retningene stopper den med samme `not_found` som for en konto som ikke finnes. Eksisterende medlemskap og invitasjoner berøres ikke av senere blokkering.
- Et aktivt medlem med utløpt overgangsfrist regnes som passivt med en gang. Den planlagte jobben `/api/internal/environment-memberships` registrerer overgangen etterpå.
- **Roller (WP-22):** En administrator- eller eierrolle blir aktiv først når mottakeren aksepterer invitasjonen. Eieroverføring er en slik invitasjon fra eieren, og selve overføringen skjer i aksepten. Eierens egne handlinger (overføre, avvikle, fjerne andre administratorer) krever eierrollen og aktivt medlemskap, og overføring og avvikling krever i tillegg nylig innlogging. Alle rolle- og kontinuitetskommandoer låser miljøraden, og databasen sjekker ved commit at eieren også er administrator, og at et aktivt miljø har eier eller en åpen eierløshet.
- **Kontinuitet:** Når en kontos roller må avsluttes (kontolivssyklus, senere WP), brukes `releaseEnvironmentRoles` i samme transaksjon eller systemkommandoen `environment.release_departed_user`. Hvis brukeren var eier, får gjenværende administratorer 7 dager til å melde interesse, og lengst sammenhengende administratortid vinner. Uten administratorer, eller uten interesserte, går miljøet til avvikling. Ingen andre får myndighet, og ingenting går videre til plattformforvalter. Den planlagte jobben `/api/internal/environment-continuity` avgjør utløpte frister og fullfører avviklinger.
- **Avvikling:** `acceptsNewActivity(environment)` er regelen for om et miljø tar imot noe nytt. Publisering (WP-25) og lån (Fase 3) skal bruke den i stedet for å lese tilstanden selv. Frivillig avvikling kan angres i 7 dager, så ventende prosesser settes bare på vent til da. Når avviklingen er endelig, avsluttes ventende søknader og invitasjoner nøytralt (hendelsen `environment.wind_down_finalized`), mens medlemskap, roller og historikk består.
- **Typeendringer (WP-23):** Typen har en uforanderlig historikk i `app.environment_type_periods`. Strengere type (åpent→lukket, lukket→skjult, åpent→skjult) gjelder straks via `environment.change_type`. Svakere type blir et forslag med frist: lukket→åpent krever hvert medlems eget ja, skjult→lukket krever ja fra minst 2/3 av alle aktive medlemmer, men kan ikke startes før avstemningsfristen er besluttet (OD-0012), og skjult→åpent avvises. Den planlagte jobben `/api/internal/environment-type-changes` avgjør forslag ved fristen. Medlemmer uten ja blir passive (`type_change_not_accepted`) og blir aktive igjen ved å melde seg inn på nytt. Databasen avviser en svakere type uten vedtatt forslag. Ventende søknader avsluttes nøytralt når miljøet blir skjult, og må bekreftes av søkeren etter lukket→åpent.
- **Historisk personvern (PS-ENV-009):** Bruk `widenedAfterCreation`/`widenedAfterPassivation` og `mayExposeHistory` fra `environment/privacy.ts` med typehistorikken (`typePeriods`) når miljøspesifikk aktivitet vises; lister som blas i databasen filtrerer med `concealedHistory` og `createdOutside`. Hva som skjedde først, avgjøres av posisjoner databasen deler ut fra `app.history_positions` (typeperioder, publiseringer, aktivering og passivitet), aldri av klokketid, så to hendelser med samme tidspunkt får likevel en entydig rekkefølge. Det som ble til under en strengere type, vises bare for medlemmer som var aktive før typen ble svakere, aldri for senere medlemmer eller utenforstående, uansett rolle. Medlems- og rollelistene bruker dette for passive medlemmer, og publiseringene for alt som vises av dem (funn, bilder, administratorlister, beslutninger, antall og eiernes oversikt). Lån (Fase 3) skal bruke samme regel.

## Privilegert tilgang, ny innlogging og habilitet

- **Plattformforvalter** (PS-USR-008) er en eksplisitt rolle i `app.platform_role_grants`. Rollen leses fra databasen på hver forespørsel og hentes aldri fra Supabase-metadata, utviklertilgang eller databasetilgang. Tilbakekalling stempler raden, så historikken består, og den virker umiddelbart.
- **Tildeling og fjerning** skjer foreløpig bare med driftskommandoen `pnpm ops:platform-role grant|revoke --email <adresse> --reason "<begrunnelse>"`. Den kjører som systemprosessen `ops.platform_roles` gjennom samme kommando- og policygrense og lager audit-hendelser. Begrunnelsen lagres bare på raden. Endringen er idempotent: kommandoen skriver ut nøkkelen før den kjører, og et nytt forsøk med `--idempotency-key <nøkkel>` gir samme resultat uten ny endring eller hendelse. Kommandoen bruker `DATABASE_URL`, lokalt fra `.env`. Hvem som skal kunne utnevne plattformforvaltere inne i appen, er ikke bestemt.
- **Handlinger som plattformforvalter** starter policyen med `platformStewardAccess`: aktiv konto, rollen og en sesjon med sterkere autentisering (`aal2`). Avslag gir `forbidden` eller `stronger_authentication_required`.
- **Habilitet** (PS-USR-009): policyer for administrativ behandling skal ha `requireNotInvolved(...)` med alle som er part, rapportert eller ellers direkte berørt. Regelen gir `conflict_of_interest` uansett rolle eller sesjonsstyrke. Hva som skjer når ingen habil forvalter finnes, er åpent (OD-0008).
- **Ny innlogging** for sensitive handlinger: `requireRecentAuthentication()` krever at brukeren har bevist identiteten (for eksempel med e-postkode) de siste 10 minuttene, ellers `reauthentication_required`. Klienten løser dette med en ny e-postkode via `/api/auth/reauthenticate`, og koden går alltid til kontoens egen adresse.
- **Sterkere autentisering** er mekanismenøytral: hvilken mekanisme som gir `aal2`, er ikke bestemt (OD-0010), og vanlige brukere har ikke noe MFA-krav. Derfor godtar `resolveUserActor` ingen metode som sterkere ennå, uansett hva auth-leverandøren rapporterer, og lokal Supabase tilbyr ingen andre faktor. Handlinger som plattformforvalter avvises dermed (fail closed) til en mekanisme er besluttet i OD-0010 og implementert. OD-0010 er en sperre for å ta slike handlinger i reell bruk, ikke for dette grunnlaget. TOTP, passkeys/WebAuthn, Vipps eller annet skal ikke innføres uten den beslutningen. Den valgte mekanismen må legges til i `account/identity.ts` sammen med en revisjonslogget måte å ta den i bruk på, der oppsettet er loggført før en sterkere sesjon godtas.

