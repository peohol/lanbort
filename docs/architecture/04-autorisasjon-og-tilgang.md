# Autorisasjon og tilgang

> **Status:** Systemarkitektur v0.1.

## Modell

Autorisasjon vurderes som:

**aktør + handling + ressurs + kontekst + gjeldende tilstand**

Globale rollelister alene er utilstrekkelige.

## Policy-lag

Backend skal ha en eksplisitt policyfunksjon per sensitiv handling, for eksempel:
- kan_se_objekt
- kan_sende_låneforespørsel
- kan_godkjenne_lån
- kan_se_miljø
- kan_behandle_sak
- kan_bekrefte_retur
- kan_se_anmeldelse

Policyen kan bygge på medlemskap, blokkering, medeierskap, opprinnelseskontekst, sakstilknytning og tilstand.

Databasen kan i tillegg bruke radnivå-/view-baserte forsvar der teknologien støtter det, men dette erstatter ikke domenepolicyen.

## Kritiske regler

### Skjult miljø
Uautorisert bruker skal ikke kunne skille «finnes men ingen adgang» fra en nøytral ikke-tilgjengelig ressurs gjennom API-svar, søk eller metadata.

### Medeier
Medeierskap gir objektrettigheter, men ikke automatisk tilgang til låntakeridentitet eller skjult opprinnelseskontekst. Loan-policy må kontrollere begge relasjonene.

### Eksisterende lån
Ved bortfalt vennskap/medlemskap kan loan-policy gi snever fortsatt tilgang til akkurat lånet uten å reaktivere profil-/miljøtilgang.

### Habilitet
Saksbehandlerpolicy må eksplisitt avvise aktør som er part, rapportert eller ellers inhabil, selv om aktøren har administrator-/plattformrolle.

### Representant
Representative grant må være bundet til eksplisitte ressurser og handlinger og ha revokering/utløp.

## Sesjonssikkerhet

- sikre, HttpOnly-baserte nettlesersesjoner foretrekkes fremfor langlivede tokens eksponert for JavaScript
- rotasjon/revokering ved sikkerhetshendelser
- re-autentisering for kontosletting, eierskapsoverføring og andre sensitive handlinger
- vanlige brukere skal ikke ha et generelt krav om MFA i pilotmodellen; verifisert e-post er den etablerte basisen for konto og innlogging
- handlinger som plattformforvalter skal kreve et sterkere autentiseringsnivå enn vanlig innlogging; den konkrete mekanismen er ikke besluttet og skal avklares i OD-0010
- tilgangsgrensen er mekanismenøytral og fail closed: så lenge ingen mekanisme er godkjent og implementert, avvises privilegerte plattformforvalterhandlinger uansett hva identitetsleverandøren rapporterer
- OD-0010 er en sperre for å ta privilegerte plattformforvalterhandlinger i reell bruk (produksjon eller pilot med reelle brukere), ikke for å bygge og integrere det mekanismenøytrale grunnlaget; den kan derfor stå åpen etter fase 1
- ingen konkret mekanisme er godkjent: TOTP/autentiseringsapp, passkeys/WebAuthn, Vipps og andre alternativer er mulige tekniske mekanismer, ikke vedtatte produktegenskaper, og skal ikke innføres som standard eller krav uten en eksplisitt beslutning i OD-0010
- støtte for sterkere autentisering hos miljøadministratorer kan vurderes senere, men skal ikke gjøres obligatorisk uten en egen beslutning

En framtidig overgang til eller supplering med en ekstern identitetsleverandør, herunder Vipps Login for norske brukere, er ikke del av pilotens nåværende innloggingsmodell. Muligheten skal utredes separat i OD-0011.
