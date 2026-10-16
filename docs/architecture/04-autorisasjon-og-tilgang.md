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

Inntil OD-0003 er avgjort finnes ingen representative grant, og ingen kodevei gir en annen bruker tilgang til eller handlingsrom for en konto som er meldt død eller varig utilgjengelig. Melderen, en medeier eller plattformforvalteren som behandler meldingen, får ikke mer tilgang enn de hadde fra før.

## Sesjonssikkerhet

- sikre, HttpOnly-baserte nettlesersesjoner foretrekkes fremfor langlivede tokens eksponert for JavaScript
- rotasjon/revokering ved sikkerhetshendelser
- re-autentisering for kontosletting, eierskapsoverføring og andre sensitive handlinger
- vanlige brukere skal ikke ha et generelt krav om MFA i pilotmodellen; verifisert e-post er den etablerte basisen for konto og innlogging
- handlinger som plattformforvalter skal kreve et sterkere autentiseringsnivå enn vanlig innlogging; mekanismen er passkey/WebAuthn som andre faktor ([ADR-0011](decisions/ADR-0011-webauthn-for-plattformforvaltere.md)), der fysisk sikkerhetsnøkkel støttes, men ikke kreves
- tilgangsgrensen er fail closed: privilegerte plattformforvalterhandlinger avvises uansett hva identitetsleverandøren rapporterer, med mindre forvalteren nettopp har bekreftet sesjonen med en av sine egne passkeys og har minst to (OD-0023); i et miljø der forvaltere ikke er slått på (`PLATFORM_STEWARDS_ENABLED`), avvises de alltid. Mekanismen må være verifisert der før slike handlinger tas i reell bruk (produksjon eller pilot med reelle brukere)
- bare WebAuthn godtas som sterkere: TOTP/autentiseringsapp, SMS/telefon, gjenopprettingskoder, ny e-postkode og Vipps gir ikke sterkere autentisering og skal ikke innføres som standard eller krav uten en ny eksplisitt beslutning
- støtte for sterkere autentisering hos miljøadministratorer kan vurderes senere, men skal ikke gjøres obligatorisk uten en egen beslutning

## Målmodell etter pilot: Vipps og passkeys

Pilotens innlogging med e-postkode videreføres uendret. For ordinær drift er Vipps Logg inn eneste registreringsvei og kreves ved **første innlogging på hver ny enhet**. Senere kan godkjente enheter bruke passkey/WebAuthn.

- Vipps-identiteten valideres på serveren og kobles til en leverandørspesifikk bruker-ID, aldri bare navn eller e-post. Det verifiserte navnet er ikke brukerredigerbart.
- Godkjent innloggingsenhet er en egen, serverstyrt og tilbakekallbar tillitsstatus. At en passkey er sky-synkronisert til en annen enhet, kan ikke omgå Vipps. Nettleserfingeravtrykk alene er ikke tilstrekkelig.
- Lokal biometri eller PIN kan låse opp passkey, men er ikke alene en serverautentisering.
- Vipps og ordinære passkeys gir ingen automatisk adgang til private E2EE-nøkler. Chatenhetene følger [ADR-0010](decisions/ADR-0010-e2ee-protokoll-enheter-og-recovery.md).
- Plattformforvalternes separate og ferske WebAuthn-bekreftelse følger fortsatt [ADR-0011](decisions/ADR-0011-webauthn-for-plattformforvaltere.md). Vipps eller en vanlig bruker-passkey gir ikke denne myndigheten.
- Ingen ordinær fallback via e-postkode, passord eller support etter overgangen. Manglende bevis fører til avslag.

Utforming og recovery avklares i [OD-0057](../open-decisions.md#od-0057--enhetsgodkjenning-og-gjenoppretting-med-vipps) og [planen](../implementation/vipps-identitet-og-abonnement.md). Betalt lånerett er en separat backend-policy etter [PS-PAY-003](../product-spec/09-medlemskap-og-laneabonnement.md), ikke en følge av å være innlogget.
