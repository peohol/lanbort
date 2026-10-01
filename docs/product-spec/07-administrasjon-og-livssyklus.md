# Administrasjon og livssyklus

> **Status:** Arbeidsversjon av produktspesifikasjonen.

## Konto

### PS-ADM-001 — Konto har eksplisitte livssyklustilstander
**Forankring:** [Brukerkontoens livssyklus](../vision/08-sikkerhet-personvern-jus-og-datalivssyklus.md)

Minst:
- **aktiv**
- **inaktiv/dvale**
- **deaktivert** — ny aktivitet stoppet, eksisterende bindinger kan avsluttes
- **suspendert** — plattformtiltak med strengere regler
- **under kontrollert avslutning**
- **slettet**

Tilstand og årsak skal ikke blandes sammen; eksempelvis kan deaktivering være selvvalgt, inaktivitetsbasert eller del av kontrollert avslutning.

### PS-ADM-002 — Deaktivering bevarer minimumstilgang til eksisterende bindinger
**Forankring:** VP-10

Deaktivert bruker kan fortsatt se og utføre nødvendige handlinger i reserverte/aktive/uavklarte lån, åpne saker og kontrollert avvikling av eierskap. Ny sosial aktivitet og nye lån er stanset.

### PS-ADM-003 — Suspensjon stanser nye fysiske forløp
**Forankring:** VP-17

Ikke-godkjente forespørsler avsluttes nøytralt; reserverte lån før overlevering avsluttes administrativt. Allerede overleverte objekter følges til trygg kontrollert retur med minimumstilgang.

### PS-ADM-004 — Aktive bindinger blokkerer permanent sletting
**Forankring:** VP-05, VP-10

Sletting kan ikke gjennomføres mens brukeren har reserverte/aktive/uavklarte lån som trenger oppfølging, ansvarlig utlånerrolle, uavsluttede nødvendige saker, miljøeierskap, problematiske administrator-/medeierbindinger eller annet legitimt oppbevaringskrav.

En administrativt avsluttet uavklart historikk er ikke i seg selv en evig slettingsblokkering.

### PS-ADM-005 — Lettvektsrettigheter blokkerer ikke sletting
**Forankring:** [Ventende invitasjoner og anmeldelser ved kontosletting](../vision/08-sikkerhet-personvern-jus-og-datalivssyklus.md)

Ventende konto-bundne invitasjoner og ubenyttede anmeldelsesrettigheter faller bort ved sletting. Allerede innsendte anmeldelser og motpartens opptjente rett kan fullføre etter anonymiseringsreglene.

### PS-ADM-006 — Sletting reduserer identitet uten å omskrive felles historikk
**Forankring:** VP-15; [Hva kontosletting betyr](../vision/08-sikkerhet-personvern-jus-og-datalivssyklus.md)

Aktiv profil, vennskap, medlemskap og unødvendige persondata fjernes. Nødvendig felles historikk kan bestå med pseudonymisert/anonymisert fremstilling der identitet ikke lenger er nødvendig.

## Død eller varig utilgjengelighet

### PS-ADM-007 — Tredjepartsmelding starter verifikasjon, ikke kontoendring
**Forankring:** [Melding om mulig dødsfall eller varig utilgjengelighet](../vision/08-sikkerhet-personvern-jus-og-datalivssyklus.md)

En ubekreftet melding kan ikke deaktivere konto, overføre rettigheter eller avslutte lån.

### PS-ADM-008 — Representanttilgang er snever og oppgavebundet
**Forankring:** VP-10; [Begrenset representant ved dødsfall eller varig utilgjengelighet](../vision/08-sikkerhet-personvern-jus-og-datalivssyklus.md)

Etter tilstrekkelig verifikasjon kan representant få tilgang til bestemte lån/forpliktelser og bare de opplysningene/handlingene som trengs for kontrollert avslutning. Rollen er tids-/formålsbegrenset og reviderbar.

## Duplikat og falsk identitet

### PS-ADM-009 — Duplikatkontoer slås ikke magisk sammen
**Forankring:** [Duplikatkonto med historikk på begge kontoer](../vision/08-sikkerhet-personvern-jus-og-datalivssyklus.md)

Én konto kan videreføres og den andre avvikles. Historiske sosiale relasjoner, anmeldelser og kontekst flyttes ikke automatisk. Egen eiendom og aktive forpliktelser kan overføres kontrollert når grunnlaget er tilstrekkelig.

### PS-ADM-010 — Falsk identitet endrer ikke automatisk historisk faktum
**Forankring:** [Falsk identitet og kontokontinuitet](../vision/08-sikkerhet-personvern-jus-og-datalivssyklus.md)

Tidligere lån/anmeldelser slettes ikke bare på grunn av identitetsbruddet. Plattformen kan beholde nødvendig intern kobling for sikkerhet uten å gjenopprette sosial tillit på ny konto.

## Datalivssyklus

### PS-ADM-011 — Oppbevaring er formålsstyrt per datatype
**Forankring:** [Logging og sporbarhet](../vision/08-sikkerhet-personvern-jus-og-datalivssyklus.md)

Låne-/avtalehistorikk, forvaltningshistorikk, saksdata og sikkerhetslogger skal ha ulike oppbevaringsregler. «Logg alt for alltid» er ikke tillatt standard.

### PS-ADM-012 — Personlig skjuling er ikke underliggende sletting
**Forankring:** [Personlig sletting versus felles historikk](../vision/08-sikkerhet-personvern-jus-og-datalivssyklus.md)

Produktet skal skille tydelig mellom skjuling fra egen visning, arkivering, anonymisering/pseudonymisering og permanent sletting.

### PS-ADM-013 — Plattforminngrep skal være begrunnede og sporbare
**Forankring:** VP-15, VP-16

Kontrollert kontoavslutning, eierskapsoverføring, suspensjon og andre særinngrep skal registreres med grunnlag og aktør.

## Pilotregel for inaktivitet

Automatisk permanent kontosletting aktiveres **ikke** i pilotfasen. Inaktive kontoer kan skjules/deaktiveres etter varsling, men permanent sletting skjer selvbetjent eller gjennom kontrollert særprosess. Dette gjør det mulig å fastsette langtidsfrister etter reell bruk og juridisk vurdering.
