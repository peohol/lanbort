# ADR-0010 — E2EE-protokoll for privat chat: MLS, kontonøkkel, enheter og recovery

**Status:** Vedtatt (lukker OD-0005)
**Forankring:** PS-COM-004–PS-COM-007, PS-COM-009, PS-COM-013, PS-NFR-007, PS-NFR-008, ADR-0002, ADR-0003, ADR-0007

## Beslutning i korte trekk

- Privat chat bruker **Messaging Layer Security (MLS, RFC 9420)**, IETF-standarden for ende-til-ende-kryptert gruppemeldinger. Vi lager ingen egen protokoll.
- Hver **enhet** er et eget medlem i MLS-gruppen. En samtale mellom to personer er en gruppe med alle enhetene til begge.
- Hver **konto** har en **kontonøkkel** som bare finnes på kontoens egne godkjente enheter. Den signerer hvilke enheter som tilhører kontoen. Kontakter husker kontonøkkelen og varsles hvis den endres.
- En **ny enhet** får tilgang til samtaler bare når en eksisterende enhet godkjenner den, og ser bare meldinger sendt etter at den kom med. Innlogging alene gir ingen tilgang.
- **Recovery** skjer med en gjenopprettingsnøkkel som bare brukeren har. Har brukeren mistet alle enheter og gjenopprettingsnøkkelen, får kontoen ny kontonøkkel, kontaktene varsles, og gammel historikk er tapt. Det finnes ingen servervei til klartekst.
- Serveren er bare **leveringstjeneste**: den lagrer ciphertext og offentlige nøkler, bestemmer rekkefølgen på gruppeendringer og håndhever hvem som får sende til hvem. Den har aldri en nøkkel som kan dekryptere en privat melding.
- Biblioteket er **ts-mls** (MIT, ren TypeScript), låst til eksakt versjon og kapslet i pakken `@lanbort/e2ee`. Ingen annen kode bruker ts-mls direkte.

## Krav beslutningen oppfyller

Fra produkteiers normative prinsipper (4. oktober 2026), PS-COM-005 og PS-NFR-007:

1. reell E2EE: server, database og plattformforvalter kan under normal drift ikke dekryptere privat meldingsinnhold
2. veletablert protokoll og bibliotek, konservative valg
3. eksplisitt modell for flere enheter, nøkkelbytte, enhetstap og recovery
4. ingen skjult serverbakdør i recovery; tapt historikk er bedre enn svekket E2EE
5. ny enhet får ikke gammel historikk bare fordi brukeren kan logge inn
6. ærlig beskrivelse av hva webklienten kan love
7. kryptografisk materiale havner aldri i logger, revisjonshendelser eller analyse

## 1. Protokoll: MLS (RFC 9420)

MLS er valgt fordi den er en publisert IETF-standard med formell sikkerhetsanalyse, og fordi modellen passer kravene uten tillegg:

- **Flere enheter er innebygd:** hver enhet er et medlem (blad) i gruppen, med egne nøkler.
- **Forward secrecy:** nøkler slettes etter bruk, så en senere kompromittert enhet kan ikke lese gamle meldinger fra serveren.
- **Post-compromise security:** når en enhet bytter nøkler (commit), mister en angriper som hadde stjålet gammel tilstand, tilgangen.
- **Ny deltaker ser ikke historikk:** et nytt medlem får nøkler fra og med epoken det ble lagt til i. Dette er nøyaktig regel 5.
- **Fjerning er kryptografisk:** et fjernet medlem får ikke nøklene til neste epoke.

**Ciphersuite:** `MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519` (RFC 9420s obligatoriske suite). Den er støttet av alle MLS-implementasjoner og krever ingen ekstra avhengigheter. Den står ett sted (`CIPHERSUITE` i `@lanbort/e2ee`). Overgang til en hybrid post-kvante-suite vurderes når en slik suite er endelig standardisert og støttet i biblioteket; det skjer ved at nye grupper opprettes med ny suite.

## 2. Bibliotek: ts-mls bak et eget adapter

| Alternativ | Vurdering |
| --- | --- |
| **ts-mls** (MIT, TypeScript) | **Valgt.** Implementerer hele RFC 9420, testes mot de offisielle MLS-testvektorene og i nettleser, bruker WebCrypto og `@hpke/core`, aktivt vedlikeholdt med sikkerhetsrettelser (1.6.3/1.6.4, august 2026). Ikke formelt revidert. |
| OpenMLS (Rust → WASM) | Mer moden kjerne, men npm-pakken `openmls-wasm` er eksperimentell (0.1.0) og ikke oppdatert siden 2025. |
| Wire core-crypto | Brukt i produksjon i nettleser, men GPL-3.0. Lisensen passer ikke en lukket webklient. |
| libsignal | AGPL-3.0 og bare innebygd Node-modul, ikke nettleser. Signals flerenhetsmodell (Sesame) er dessuten et tillegg utenfor kjerneprotokollen. |
| Matrix Olm/Megolm (vodozemac, Apache-2.0) | Revidert og moden, men bundet til Matrix sin datamodell og protokoll for nøkkeldeling. Megolm har svakere post-compromise-egenskaper enn MLS. |
| Egen konstruksjon med libsodium | Avvist. Det ville være å designe egen protokoll. |

**Konsekvenser av valget:**

- Versjonen låses eksakt i `packages/e2ee/package.json`. Oppgradering skjer bevisst, med adapterets tester som vakt. Sikkerhetsutgivelser i 1.x tas inn straks.
- ts-mls 1.x oppgir ikke avsender for applikasjonsmeldinger i offentlig API (2.x gjør det). Adapteret leser derfor avsenderen med bibliotekets egen dekryptering (`unprotectPrivateMessage`) på uendret tilstand, mens tilstanden bare endres av `processPrivateMessage`. Når 2.x er endelig utgitt, bytter vi til det offentlige feltet.
- Biblioteket er ikke revidert. Port C krever derfor uendret en **uavhengig kryptografisk gjennomgang av protokollbruken** før privat chat aktiveres for reelle brukere.
- Hvis biblioteket under implementering viser seg uegnet, gjøres en ny vurdering som dokumenteres her. Det velges ikke svakere sikkerhet for å bli ferdig. Fordi MLS-meldingsformatet er standard, berører et bytte bare `@lanbort/e2ee`.

## 3. Identitet: kontonøkkel og enhetsnøkler

**Kontonøkkel.** Et Ed25519-nøkkelpar per konto, laget på kontoens første enhet. Den private delen finnes bare på kontoens godkjente enheter og eventuelt kryptert under brukerens gjenopprettingsnøkkel (punkt 8). Den signerer:

- **enhetssertifikater:** «enhet D med signaturnøkkel K tilhører konto A»
- **tilbakekallinger:** «enhet D tilhører ikke lenger konto A»

Signaturene har et formålsmerke (`Lanbort device-certificate v1`, `Lanbort device-revocation v1`), så en signatur laget for ett formål aldri kan gjenbrukes til et annet.

**Enhetsnøkkel.** Hver enhet lager sitt eget signaturnøkkelpar for MLS. Den private delen forlater aldri enheten. Enhetssertifikatet er identiteten i enhetens MLS-legitimasjon (basic credential).

**Hvem en enhet stoler på.** Hver enhet har et eget tillitslager:

- Første gang den ser en kontos kontonøkkel, husker den nøkkelen (trust on first use).
- En annen kontonøkkel senere blir **ikke** godtatt automatisk. Brukeren får beskjed om at kontaktens sikkerhetskode er endret, og nøkkelen godtas først når brukeren har sett det.
- Kontakter kan sammenligne en **sikkerhetskode** utledet fra begge kontonøklene for å utelukke at serveren har byttet nøkkel ved første kontakt. Formatet følger Signals «safety number» (iterert SHA-512, 60 sifre); WP-43 bygger visningen.

**Adgangskontroll i hver gruppe (MLS authentication service).** En enhet godtas som medlem bare hvis enhetssertifikatet:

1. er signert med den kontonøkkelen mottakerens enhet har husket for kontoen
2. binder enhetens faktiske MLS-signaturnøkkel
3. gjelder en konto som er deltaker i samtalen etter serverens domeneregler
4. ikke er tilbakekalt

Dette sjekkes av hver klient for hvert medlem som legges til, hver nøkkeloppdatering og hele gruppen ved innmelding. En enhet serveren har lagt inn i nøkkelkatalogen uten kontoens kontonøkkel («spøkelsesenhet»), blir dermed avvist av alle ærlige klienter, også når en annen deltakers klient er lurt til å legge den til.

## 4. Samtaler og flere enheter

- En samtale er én MLS-gruppe. Gruppe-ID er samtalens ID (med generasjonsnummer, se punkt 9).
- Medlemmene er alle ikke-tilbakekalte enheter til samtalens deltakere.
- Når en konto får ny enhet, legger kontoens egne enheter den til i kontoens aktive samtaler. Kontaktene ser at Peder har en ny enhet i samtaleinformasjonen, men får ikke advarsel, fordi enheten er signert med Peders kjente kontonøkkel.
- Bare forslagene `add`, `remove` og `update` godtas i en commit. Alt annet MLS tillater (reinit, eksterne forslag, PSK, endring av gruppeutvidelser) avvises av klienten.
- En enhet kan bare fjernes når mottakerens egen enhet ikke lenger stoler på den: den er tilbakekalt med signatur fra sin kontonøkkel, kontoen har fått ny kontonøkkel, eller kontoen er ikke lenger deltaker. Hver mottaker sjekker dette selv og avviser ellers hele commiten, så én deltaker kan ikke kaste ut en annens enhet.
- Korte meldinger fylles opp til 1024 byte før kryptering, så lengden ikke røper innholdet.

## 5. Ny enhet (kobling)

1. Den nye enheten logger inn som vanlig. Det gir ingen chattilgang.
2. Den lager sin enhetsnøkkel og et engangs HPKE-nøkkelpar (RFC 9180, samme algoritmer som ciphersuiten) og viser en QR-kode med den offentlige HPKE-nøkkelen og et sjekksum av enhetsnøkkelen. Uten kamera vises i stedet en kode på 26 tegn (128-bit sjekksum av de samme nøklene) som tastes inn.
3. En eksisterende enhet skanner koden eller får koden tastet inn, viser hvilken enhet som ber om tilgang, og brukeren godkjenner.
4. Den eksisterende enheten signerer enhetssertifikatet og krypterer en pakke til den nye enhetens HPKE-nøkkel med kontonøkkelen og, hvis brukeren velger det, nøkkelen til et historikkarkiv (punkt 8). Pakken går via serveren, som bare ser ciphertext. Fordi den offentlige nøkkelen kom direkte fra skjermen, kan serveren ikke bytte den ut.
5. Den nye enheten legges til i kontoens samtaler (punkt 4) og ser meldinger fra nå av. Gammel historikk får den bare hvis brukeren valgte å overføre den i steg 4.

Koblingsforespørselen utløper etter kort tid og kan brukes én gang. En fullført godkjenning utløser dessuten sikkerhetsvarsel til kontoeieren både i app og på verifisert e-post, uavhengig av hvem som godkjente koblingen (PS-COM-016). Varselet leder til «Mine enheter», der ukjente enheter kan tilbakekalles; det inneholder ikke chatinnhold eller nøkkelmateriale.

## 6. Nøkkelbytte

| Hva | Når | Hvordan |
| --- | --- | --- |
| Gruppenøkler | hver gang medlemmer endres, og ellers jevnlig fra hver enhet | MLS-commit (`rotateKeys`) |
| Nøkkelpakker (key packages) | engangsbruk; enheten fyller på | ny pakke publiseres; hver pakke gjelder høyst 28 dager, og én reservepakke hindrer at katalogen tømmes |
| Enhetsnøkkel | ved mistanke om kompromittering | enheten fjernes og kobles på nytt |
| Kontonøkkel | når alle enheter og gjenopprettingsnøkkelen er tapt, eller ved mistanke om kompromittering | tilbakestilling, punkt 7 |

Hvor ofte en enhet skal rotere gruppenøkler uten medlemsendring, settes ett sted i WP-43.

## 7. Tap av enhet

**Brukeren har fortsatt en annen godkjent enhet:**

1. Brukeren fjerner den tapte enheten under «Mine enheter».
2. Den godkjente enheten signerer en tilbakekalling. Serveren logger den tapte enheten ut og slutter å levere til den og å godta meldinger fra den.
3. Tilbakekallingen leveres til alle deltakernes enheter. Deretter får alle samtaler den tapte enheten var med i, en commit som fjerner den; den godtas bare av enheter som har verifisert tilbakekallingen. Både kontoens egne og kontaktenes enheter gjør dette så snart de får tilbakekallingen, og alltid før de legger til nye medlemmer.
4. Klienter godtar ikke senere en tilbakekalt enhet, heller ikke fra en gammel nøkkelpakke.

Serveren kan holde en tilbakekalling tilbake fra en kontakt. Det gir ikke den tapte enheten tilgang: den er fjernet kryptografisk fra kontoens egne grupper, og serveren har stengt sesjonen. Dette er en kjent, akseptert restrisiko.

**Brukeren har mistet alle enheter:** se punkt 8.

**Utlogging** av en enhet som har chat, sletter enhetens chatttilstand og lokale historikk og tilbakekaller enheten. Brukeren varsles om dette før utlogging.

## 8. Recovery og historikk

**Historikk lagres på enheten.** På grunn av forward secrecy kan ciphertext på serveren ikke dekrypteres senere. Leste meldinger lagres derfor dekryptert i enhetens lokale lager (kryptert i ro, punkt 10). Serveren sletter ciphertext når alle mottakerenheter har hentet den, eller etter en øvre frist som settes ett sted i WP-43 og følger pilotpolicyen for oppbevaring (OD-0002).

**Historikkarkiv.** Én felles mekanisme for både kobling og sikkerhetskopi: historikken pakkes og krypteres med en tilfeldig 256-bit nøkkel (AES-256-GCM via WebCrypto, i biter). Bare nøkkelen avgjør hvem som kan lese den.

**Gjenopprettingsnøkkel (valgfri, tilbys brukeren):**

- 256 tilfeldige bit laget på enheten, vist én gang som 52 tegn i grupper. Brukeren skriver den ned eller lagrer den i en passordbehandler. Når og hvor den tilbys, står i PS-COM-019.
- Fra den utledes (HKDF-SHA256) en nøkkel som krypterer en sikkerhetskopi av kontonøkkelen og historikkarkivets nøkkel. Sikkerhetskopien og arkivet lagres hos serveren som ciphertext.
- **Passord eller PIN brukes aldri** som grunnlag. En laventropi-hemmelighet kan knekkes av den som har ciphertexten, og uten maskinvarebasert forsøksbegrensning (HSM) har vi ingen måte å hindre det på.

**Recovery-tilfellene:**

| Situasjon | Resultat |
| --- | --- |
| Én godkjent enhet igjen | Kobling (punkt 5). Ingen endring for kontaktene. |
| Alle enheter tapt, gjenopprettingsnøkkel finnes | Kontonøkkel og historikk hentes fra sikkerhetskopien. Gamle enheter tilbakekalles. Kontaktene ser ingen nøkkelendring. Kontaktenes enheter legger den nye enheten til i samtalene. |
| Alle enheter og gjenopprettingsnøkkel tapt | **Tilbakestilling:** ny kontonøkkel, alle gamle enheter utestengt. Kontaktene får beskjed om at sikkerhetskoden er endret og må godta det før samtalen fortsetter. Gammel historikk er tapt. |

Tilbakestilling krever nylig innlogging og eksplisitt bekreftelse, har fartsgrense (WP-73), gir en sikkerhetshendelse og et varsel til kontoens e-post. En som har overtatt e-postkontoen kan dermed tilbakestille, men får ingen gammel historikk, og kontaktene ser advarselen.

## 9. Serverens rolle (leveringstjeneste)

Serveren:

- lagrer kontonøkkelens og enhetenes **offentlige** materiale, sertifikater og tilbakekallinger, og sjekker signaturene som forsvar i dybden (klientene sjekker uansett selv)
- deler ut engangs nøkkelpakker atomisk, med fartsgrense
- tar imot og leverer ciphertext, velkomstmeldinger (welcome) og koblingspakker
- **bestemmer rekkefølgen:** nøyaktig én commit vinner hver epoke. En commit godtas bare hvis epoken i meldingshodet er samtalens nåværende epoke; ellers avvises den, og avsenderen henter vinneren og prøver igjen. Klienten tar i bruk sin egen commit først når serveren har godtatt den (`PendingCommit.accept()`), eller forkaster den (`discard()`). Mens den venter, sender og mottar enheten ingenting i samtalen, så commiten alltid gjelder tilstanden den ble laget fra.
- **autoriserer** etter ADR-0002: at sendende enhet tilhører sesjonens konto og ikke er tilbakekalt, at kontoen er deltaker, at samtalen er åpen, og at reglene for blokkering og første kontakt (PS-COM-006) er oppfylt
- sletter levert ciphertext (punkt 8)

Serveren importerer aldri `@lanbort/e2ee`. En test (`boundary.test.ts`) feiler hvis noen modul utenom klientkomponenter (`"use client"`) gjør det, også sider, layout og proxy i webappen, som kjører på serveren.

**Etter gjenoppretting fra backup** kan serverens epoker ligge bak klientenes. Alle samtaler får da en ny gruppe (ny generasjon av gruppe-ID-en), engangs nøkkelpakker, koblingsforespørsler og ventende ciphertext regnes som tapt, og enhetene publiserer nye nøkkelpakker. Lokal historikk på enhetene består.

## 10. Lagring på enheten

- Gruppetilstand, enhetsnøkkel, kontonøkkel og lokal historikk lagres i nettleserens IndexedDB, kryptert med en ikke-eksporterbar AES-GCM-nøkkel fra WebCrypto. Det gjør at enhetens chattdata kan slettes ved å slette én nøkkel, og at rådata ikke ligger lesbart på disk. Det beskytter **ikke** mot kode som kjører i appen (punkt 13).
- I minnet holdes nøkler i `Secret`, som ikke kan skrives ut som JSON, tekst, `inspect` eller kopieres med `structuredClone`. Brukte nøkkelbytes nullstilles (`wipe`).
- Krypteringsarbeidet bør kjøre i en egen Web Worker, slik at nøkler ikke ligger i hovedtrådens objekter. Det er forsvar i dybden, ikke en garanti.

## 11. Vedlegg

Hvert private vedlegg krypteres på enheten med en tilfeldig nøkkel per fil (AES-256-GCM i biter) og lastes opp som ciphertext til en egen privat bøtte for E2EE-vedlegg (ADR-0007). Nøkkelen og sjekksummen sendes inne i MLS-meldingen. Serveren kan ikke skanne innholdet; klienten begrenser filtyper og størrelse og behandler mottatte filer som ubetrodde.

## 12. Logging, revisjonshendelser og analyse

- Loggeren slipper bare gjennom felt på tillatelseslisten (`@lanbort/observability`); nøkler, sertifikater og ciphertext er ikke på den og skal aldri legges til.
- Revisjons- og domenehendelser for chat inneholder bare ID-er og tilstand (for eksempel samtale opprettet, enhet koblet, enhet tilbakekalt, kontonøkkel tilbakestilt), aldri nøkkelmateriale, sertifikater, ciphertext eller meldingsinnhold. Selve meldingssendingen er ikke en domenehendelse.
- Varsler om nye meldinger viser aldri meldingstekst, vedlegg eller hvilket lån det gjelder. I den innloggede appen viser varselet avsenderens navn og antall nye meldinger; e-post er generisk og viser verken avsender, lån eller innhold (PS-COM-018, ADR-0008).
- Chatsidene skal ikke ha analyse- eller tredjepartsskript.

## 13. Hva webklienten realistisk kan love

**E2EE i Lånbort beskytter mot:**

- at serveren, databasen, backupene eller noen med tilgang til dem leser private meldinger
- at en administrator- eller plattformforvalterrolle i appen gir innsyn
- at en database- eller backuplekkasje røper meldingsinnhold
- at en ny innlogging på kontoen gir tilgang til gammel historikk

**E2EE i en nettleser beskytter ikke mot:**

- **kompromittert klientkode:** webappen lastes fra serveren hver gang. Den som kontrollerer leveransen (en angriper i byggekjeden eller hostingen, eller en driftsansvarlig som bevisst endrer koden), kan levere kode som leser meldingene før kryptering eller etter dekryptering. Derfor står det «under normal drift».
- XSS, ondsinnede nettleserutvidelser og kompromitterte enheter
- at en deltaker tar skjermbilde eller videresender
- metadata: serveren vet hvem som snakker med hvem, når, omtrent hvor mye og fra hvor mange enheter

**Tiltak:** streng CSP uten `unsafe-inline` for skript på chatsidene (nonce- eller hash-basert), ingen tredjepartsskript, låste og kontrollerte avhengigheter, beskyttet deploy-prosess og egen sikkerhetsgjennomgang av nøkkelhåndteringen (Port C). Sterkere vern mot kompromittert webleveranse krever signert eller innebygd klient og vurderes særskilt hvis det blir et krav.

Produktteksten skal ikke love mer enn dette. Den kan si at meldingene er ende-til-ende-kryptert og at Lånbort ikke kan lese dem, og lenke til en forklaring av grensene.

## 14. Ingen lesebekreftelser

Klienten sender ingen «lest»- eller «skriver»-signaler (PS-COM-004). Enhetens kvittering til serveren om at ciphertext er hentet, brukes bare til sletting og vises aldri for andre deltakere.

## Hva de neste arbeidspakkene trenger

**WP-43 — privat E2EE-chat**

- Bygger på `@lanbort/e2ee` (`Conversation`, `createKeyPackage`, `createDevice`, `certifyDevice`, `revokeDevice`, tillitslageret) og utvider bare der.
- Servertabeller i `app`-skjemaet for: kontonøkler (gjeldende og tidligere), enheter med sertifikat og tilbakekalling, engangs nøkkelpakker, samtaler og deltakere (type, epoke, generasjon, åpen/stengt), meldingskø med per-enhet leveringsmarkør, velkomstmeldinger, koblingsforespørsler med kort levetid, sikkerhetskopier. Alt er ciphertext eller offentlig materiale.
- Commit-rekkefølge med epoke-sjekk i én transaksjon; fartsgrenser (WP-73) for meldinger, nøkkelpakker og koblinger.
- Første kontakt (PS-COM-006), blokkering og «Fjern fra mine samtaler» (PS-COM-009) håndheves på serveren.
- Lagring på enheten (punkt 10), koblingsflyt med QR og kode, «Mine enheter», tilbakestilling og sikkerhetskode. Permissions-Policy må tillate kamera på koblingssiden.
- CSP uten `unsafe-inline` for skript på chatsidene.
- Gjenopprettingsnøkkel med sikkerhetskopi kan leveres i WP-43 eller i en egen pakke rett etter, men chat aktiveres ikke for reelle brukere før kobling, fjerning av enhet og tilbakestilling virker og Port C er oppfylt.
- Nye hendelsestyper og tabeller klassifiseres for gjenoppretting (WP-72), i tråd med punkt 9.
- Meldingen i en låneforespørsel er del av den strukturerte forespørselen og omfattes ikke av ende-til-ende-krypteringen (PS-LOAN-004, avklart i OD-0015).

**WP-44 — lånelogistikk ved blokkering**

- Egen samtaletype (`loan_logistics`) med egen MLS-gruppe for de to lånepartene, samme krypto.
- Serveren åpner og stenger den etter lånets tilstand. Én part kan ikke stenge den mens lånet pågår (OD-0020, PS-COM-007). Stengt betyr at serveren ikke lenger godtar meldinger eller velkomster; klientene viser kanalen som lukket.
- «Korte meldinger» håndheves uten å lese innholdet: serveren avviser ciphertext over én polstringsstørrelse, og kanalen har ikke vedlegg.

**WP-46 — privat melding som saksdokumentasjon**

- «Send inn som dokumentasjon» er en aktiv handling: brukeren velger konkrete meldinger eller vedlegg i sin lokale, dekrypterte historikk, og klienten sender en lesbar kopi med meldings-ID, tidspunkt og avsender til saken som nye `case_entries` (WP-45).
- Det finnes ingen servermekanisme som åpner resten av samtalen, og ingen nøkkel som kan deles med saksbehandler.
- Kopien merkes som innsendt av parten. Plattformen kan ikke kryptografisk bevise at teksten er uendret; den andre parten får legge fram sitt syn i sakens egne forklaringsrunder.

## Konsekvenser

- OD-0005 er avklart. Port C har fortsatt krav om uavhengig kryptografisk gjennomgang, testet XSS/CSP/supply chain, definert UX for nøkkel- og enhetstap og ingen skjult «dekrypter alt»-vei.
- Pakken `@lanbort/e2ee` finnes med tester som viser kravene i praksis: to kontoer med flere enheter, at serveren aldri ser klartekst, at en ny enhet ikke kan lese eldre meldinger, at en tilbakekalt og fjernet enhet ikke kan lese nye, at spøkelsesenheter og enheter fra kontoer utenfor samtalen avvises, at en deltaker ikke kan fjerne en annens enhet uten gyldig tilbakekalling, at endret kontonøkkel ikke godtas uten brukerens kvittering, at bare én av to samtidige commits vinner, og at nøkkelmateriale ikke kan skrives ut.
- Privat chat er fortsatt ikke tilgjengelig i appen før WP-43 er bygget og Port C er oppfylt.

## Når beslutningen må vurderes på nytt

- når ts-mls 2.x er endelig utgitt (avsender i offentlig API), eller hvis biblioteket ikke lenger vedlikeholdes
- hvis den uavhengige gjennomgangen avdekker svakheter i biblioteket eller bruken
- når en hybrid post-kvante-ciphersuite er endelig standardisert
- hvis det blir krav om vern mot kompromittert webleveranse (signert eller innebygd klient)
