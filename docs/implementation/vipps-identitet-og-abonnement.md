# Målmodell etter pilot: Vipps, enheter og låneabonnement

> **Besluttet av produkteier:** 16. oktober 2026. **Status:** Plan, ikke implementert. Pilotens innlogging og gratis lån forblir uendret. Normative krav: [PS-USR-016–019](../product-spec/01-brukere-kontoer-og-relasjoner.md#ps-usr-016--bare-vipps-kan-registrere-ordinære-kontoer) og [PS-PAY-001–006](../product-spec/09-medlemskap-og-laneabonnement.md).

## Samlet produktmodell

| Funksjon | Lukket pilot | Etter pilot |
| --- | --- | --- |
| Medlemskap | Gratis; bare personlig godkjente deltakere | Gratis; alle registreres med Vipps |
| Første innlogging på en ny enhet | E-postkode | Alltid Vipps Logg inn |
| Senere innlogging på godkjent enhet | E-postkode | Passkey/WebAuthn med lokal biometri eller PIN |
| Registrere og låne bort ting | Gratis | Gratis |
| Låne av andre | Gratis | 30 kr/mnd. i ordinært låneabonnement |
| Redusert pris ved svak økonomi | Ikke aktuelt | Mulig senere, ikke del av første betalte versjon |

Identitet er obligatorisk for **alle**; abonnement er bare nødvendig for å starte nye låneforespørsler. Betaling mellom låntaker og utlåner finnes ikke. Alle ordinære brukere har gått gjennom samme identitetsprosess, så brukerprofiler skal ikke ha et «verifisert»-merke. Vipps sier noe om identitetsopplysninger, ikke om hvorvidt personen er pålitelig.

## Registrering, navn og personvern

- Nye ordinære brukere må fullføre Vipps Logg inn. **Ingen alternativ registrering** med e-postkode, passord, andre identitetsleverandører eller passkey alene.
- Registreringen kobles til Vipps' unike `sub` innenfor riktig Vipps-tilknytning, ikke navn, telefonnummer eller e-postadresse alene. Én Vipps-identitet skal ikke kunne opprette flere aktive kontoer.
- Fullt navn hentes fra Vipps og kan ikke redigeres i profil eller API. Ved faktisk navneendring brukes en ny Vipps-verifisering.
- Fødselsnummer skal ikke lagres for kontokobling. Be om færrest mulig scopes: `openid` og `name` er sentrale; om `birthDate` skal brukes til gjeldende 18-årskrav avhenger av tilgang i valgt Vipps-plan og nødvendig personvernvurdering. Verifiserte kontaktopplysninger hentes bare ved faktisk behov.
- Vipps oppgir at navn og fødselsdato verifiseres mot Folkeregisteret for aktuelle scopes, men at **Vipps Login ikke er en elektronisk ID**. Unngå å markedsføre løsningen som BankID-ekvivalent eller en garanti for brukeratferd. [Vipps user information](https://developer.vippsmobilepay.com/docs/APIs/login-api/api-guide/user-info/) og [Vipps Login API](https://developer.vippsmobilepay.com/api/login).
- Minimer logger, oppbevaring og visning av personopplysninger. Vurder vilkår, GDPR, personvern og konsekvensene for personer uten Vipps før bred lansering. Dette skaper ingen alternativ registreringsvei.

## Invitasjoner fra eksisterende medlemmer

Invitasjoner og venneforespørsler sendt til en e-postadresse må fortsatt fungere etter at nyregistrering er stengt for e-postkode. En ny person følger Vipps-registrering før invitasjonen knyttes til vedkommendes konto. Kontroll over invitasjonsadressen må bekreftes separat, for eksempel med en verifisert e-postopplysning fra Vipps eller en avgrenset invitasjonsbekreftelse. Invitasjonslenken er **ikke en alternativ kontoopprettelse**, og den må ikke røpe om en adresse har konto, ble blokkert eller avslo en forespørsel (PS-USR-013). Piloten beholder dagens e-postflyt.

## Nye enheter og lokal innlogging

**Første gang på en ny eller ikke lenger godkjent enhet/nettleserinstallasjon skal alltid starte med Vipps**, selv om brukeren har en gyldig passkey som er synkronisert mellom egne telefoner og PC-er.

Etter autentisert Vipps-innlogging kan serveren registrere/godkjenne enheten. På denne enheten skal senere innlogging kunne skje med WebAuthn-passkey, låst opp med fingeravtrykk, ansikt eller lokal PIN der plattformen støtter det. Eksisterende gyldige sesjoner trenger ikke gjenta innlogging for hver handling.

Synkroniserte passkeys **kan ikke alene være bevis for at en enhet er kjent**. Teknisk løsning må derfor bevare en egen serververifisert og tilbakekallbar enhetsbinding. Nettleserfingeravtrykk alene er ikke nok. Ny nettleserinstallasjon, slettet lokalt lager, privat nettlesermodus, tapte eller tilbakekalte enheter håndteres konservativt som ukjente. Når alle godkjente enheter er tapt, er ny Vipps-verifisering veien tilbake; ordinær e-postkode, passord og support skal ikke gi bakdør.

**Innloggingsenheter er ikke identiske med kryptografiske chatenheter.** Et vellykket Vipps-bevis eller en passkey gir ikke tilgang til tidligere chattnøkler og E2EE-historikk. Eksisterende enhetssertifikater, nøkkeltilknytning, QR-kobling, tilbakekalling og recovery etter [ADR-0010](../architecture/decisions/ADR-0010-e2ee-protokoll-enheter-og-recovery.md) gjelder uavhengig. Forvalteres særskilte, ferske passkey-bekreftelse etter [ADR-0011](../architecture/decisions/ADR-0011-webauthn-for-plattformforvaltere.md) kan heller ikke erstattes av Vipps eller ordinær passkey.

**Teknisk modell er åpen:** [OD-0057](../open-decisions.md#od-0057--enhetsgodkjenning-og-gjenoppretting-med-vipps) skal avklares gjennom arkitektur- og sikkerhetsgjennomgang før implementering.

## Overgang for pilotbrukere

Pilotbrukernes interne kontoer beholdes. Før ordinær drift må brukeren dokumentere kontroll over både den eksisterende pilotkontoen og en ny gjennomført Vipps-flyt. Bare da kobles `sub` til den eksisterende kontoen. Lik e-post eller navn er ikke tilstrekkelig. Handlingene skal være atomiske, revisjonslogget og trygge ved avbrudd.

Migreringen skal bevare venner, miljøer, objekter, lån, medeiere, historikk og varsler. Private E2EE-nøkler og lokal historikk skal ikke byttes ut eller kopieres til serveren som del av kontokoblingen. Når særskilt enhetskobling eller recovery kreves, brukes gjeldende kryptografiske regler i ADR-0010. Kontoer med kolliderende Vipps-identitet skal ikke slås sammen automatisk. Ufullført Vipps-kobling gir ingen adgang til ordinær bruk etter at pilotens e-postinnlogging er stengt.

## Låneabonnement

- Gratis medlemskap og tilgang til å finne ting, legge ut ting, låne bort, kommunisere innenfor eksisterende adgang og administrere egne lån forblir uendret.
- Brukeren tilbys **30 kr/mnd.** først når hen vil sende en ny låneforespørsel. Vis totalpris inkludert eventuell MVA. Ingen avgift per lån eller prioritering over andre brukere.
- Lånerett registreres og håndheves av backend når **nye** forespørsler sendes. Et betalt abonnement kan sies opp; låneretten varer ut betalt periode. Ventende og pågående lån, retur, meldinger som er nødvendige for gjennomføring, saksbehandling og historikk kan ikke opphøre ved abonnementsslutt.
- Abonnementet må kjøpes aktivt etter tydelig informasjon om pris og vilkår. Pilotbrukere skal ikke automatisk trekkes ved overgang.
- Valg av leverandør, betalingsoppfølging, oppsigelsesflyt, refusjoner, fornyelser, mva., angrerett og håndtering av betalingsfeil er foreløpig åpne: [OD-0058](../open-decisions.md#od-0058--praktisk-abonnementshåndtering-ved-ordinær-drift).
- En prisreduksjon for personer med svak økonomi kan vurderes senere; ingen ny søknads- eller inntektskontroll nå.

Betalingsvarsler fra leverandøren må verifiseres, knyttes til riktig konto og behandles på en måte som tåler duplikater, forsinkelser og forsøk på forfalskning. Klientens visning av en kvittering skal ikke alene utløse lånerett.

## Implementeringsrekkefølge og sikkerhetsport

Gjennomføres i [WP-90–94](work-packages.md#fase-9--ordinær-registrering-og-abonnement-etter-pilot):

1. Undersøk gjeldende Vipps-avtaler/scopes, alderskontroll, OIDC-flyt, Supabase, enhetsbinding, passkeys og gjenoppretting. Avgjør OD-0057 og dokumenter arkitektur.
2. Bygg Vipps-only registrering, låst navn og førsteinnlogging på nye enheter, deretter passkey på godkjente enheter. Behold pilotflyten urørt til klar overgang.
3. Migrer test-pilotkontoer og verifiser at både vanlig data og E2EE-forutsetningene bevares ved avbrudd og feil.
4. Avklar OD-0058 og bygg abonnementsbetaling, gratis medlemskap og serverhåndhevet lånerett. Ingen belastning uten aktivt kjøpsvalg.
5. Gjennomfør negative tester: ingen alternativ registrering, ingen ukjent enhet via synkronisert passkey, ingen brukerredigerbar identitet, ingen sammenkobling ved lik e-post, ingen falsk betalingsaktivering, ingen låneforespørsel uten rett, og ingen tap av eksisterende lån eller private nøkler.
6. Kontroller flytene på mobil, nettbrett og PC, inkludert ulike nettlesere, tilbaketrekking og tap av enheter. Kontroller norske forbrukerregler og personvern. Aktiver ordinær registrering først når sikkerheten er demonstrert; aktiver betalingen **separat og senere** når piloten har vist nytte.

Dette er kun plan og produktbeslutning. **Ingen Vipps-integrasjon, registreringsendring eller betalingsplikt skal innføres gjennom denne dokumentasjonsendringen.**
