# Grunnlag for den uavhengige kryptografiske gjennomgangen av privat chat

> **Status:** Intern gjennomgang gjort 10. oktober 2026. **Den erstatter ikke** den uavhengige kryptografiske gjennomgangen av protokollbruken som [Port C](quality-gates.md#port-c--før-privat-chat-aktiveres) krever. Privat chat er av for ekte brukere til Port C er oppfylt (`CHAT_ENABLED`, se [servergrensen](server-boundary.md#privat-chat-wp-43)).

Dokumentet er skrevet for den som skal gjøre den uavhengige gjennomgangen. Designet står i [ADR-0010](../architecture/decisions/ADR-0010-e2ee-protokoll-enheter-og-recovery.md); her står hva som skal vurderes, hvor koden er, hvilke tester som viser hva, hva den interne gjennomgangen fant, og hva vi vet er svakt.

## Hva gjennomgangen skal vurdere

1. Bruken av MLS (RFC 9420) gjennom ts-mls 1.6.4: gruppeoppsett, autentiseringstjenesten (hvem som godtas som medlem), commit-regler, sletting av brukte nøkler og bruken av bibliotekets interne funksjoner.
2. Identitetsmodellen: kontonøkkel, enhetssertifikater, tilbakekallinger, tillitslager (trust on first use med festede nøkler) og sikkerhetskoden.
3. Kobling av ny enhet (link v2): hemmeligheten på skjermen, forpliktelsen, den doble krypteringen av pakken og hva serveren kan gjøre med den.
4. Gjenopprettingsnøkkelen, sikkerhetskopien og historikkarkivet.
5. Lagring på enheten og hva webklienten realistisk kan love (ADR-0010 punkt 10 og 13).
6. At serveren ikke har noen vei til klartekst, og at ingen administratorfunksjon har en skjult «dekrypter alt»-vei.

## Hvor koden er

| Del | Filer | Merknad |
| --- | --- | --- |
| Kryptografien | `packages/e2ee/src/` | Eneste kode som bruker ts-mls. `suite.ts` (ciphersuite), `identity.ts` (kontonøkkel, sertifikat, tilbakekalling), `trust.ts` (tillitslager), `conversation.ts` (MLS-gruppen og autentiseringstjenesten), `linking.ts` (kobling), `account-package.ts` (pakken med kontonøkkel og festede nøkler), `recovery.ts`, `archive.ts`, `safety.ts` (sikkerhetskode), `secret.ts` (`Secret` og `wipe`), `persist.ts` (lagringsformat) |
| Klientmotoren | `apps/web/src/chat/engine.ts`, `store.ts`, `history-transfer.ts` | Kjører i nettleseren. Bestemmer deltakere, behandler katalogen fra serveren, lagrer kryptert i IndexedDB |
| Serveren | `packages/domain/src/chat/` | Leveringstjeneste: lagrer offentlig materiale og ciphertext, ordner commits, håndhever hvem som får sende til hvem. Importerer aldri `@lanbort/e2ee` (`boundary.test.ts`) |
| Databasen | `supabase/migrations/*chat*.sql` | Tabellene i `app`-skjemaet; nettleseren har ingen direkte tilgang |
| Sikkerhetshoder | `apps/web/src/security-headers.ts`, `apps/web/src/proxy.ts` | CSP med nonce og `strict-dynamic` |

## Trusselmodell i korte trekk

Angripere vi forsvarer mot (ADR-0010 punkt 13 og [trusselmodellen](../architecture/08-sikkerhet-og-threat-model.md)):

- **Serveren og databasen**, også en som avviker fra protokollen: kan endre, holde tilbake, bytte ut og legge til alt den lagrer og leverer, men leverer ikke ondsinnet klientkode.
- **En deltaker** i samtalen med en endret klient.
- **Noen med en stjålet innloggingssesjon**, eller som har overtatt e-postkontoen.
- **En tapt eller stjålet enhet** etter at den er tilbakekalt.

Utenfor det vi kan love: kompromittert webleveranse (byggekjede, hosting), XSS, ondsinnede nettleserutvidelser, kompromitterte enheter og metadata (hvem som snakker med hvem, når og omtrent hvor mye).

## Byggesteinene

| Hva | Valg |
| --- | --- |
| Ciphersuite | `MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519` |
| Kontonøkkel og enhetsnøkler | Ed25519. Signaturer har formålsmerke: `Lanbort device-certificate v1`, `Lanbort device-revocation v1` |
| Deltakere | Nøyaktig to kontoer per samtale, festet første gang klienten ser samtalen |
| Kobling (v2) | 128-bit hemmelighet S vist som QR (`LANBORT-LINK:2:<kode>`) eller 26 tegn Crockford base32. Forpliktelse = HMAC-SHA256(HKDF(S, `Lanbort link commitment v2`), enhets-ID, enhetsnøkkel, koblingsnøkkel). Pakken: AES-256-GCM under HKDF(S, `Lanbort link package key v2`) innerst, HPKE (RFC 9180) til koblingsnøkkelen ytterst; `info` = `Lanbort link package v2`, begge lag bundet til forespørselens nøkler |
| Kontopakke (v3) | Kontonøkkel, eventuell historikkarkivnøkkel og kontaktenes festede kontonøkler (høyst 1000) |
| Gjenopprettingsnøkkel | 256 tilfeldige bit, 52 tegn. HKDF-SHA256 gir nøkkel-ID (`Lanbort recovery key id v1`, 128 bit) og sikkerhetskopinøkkel (`Lanbort recovery backup key v1`); AES-GCM med kontoens ID i tilleggsdata |
| Historikkarkiv | Tilfeldig 256-bit nøkkel, AES-256-GCM i nummererte biter (`Lanbort history archive v1`) |
| Lagring på enheten | IndexedDB, kryptert med en ikke-eksporterbar AES-GCM-nøkkel fra WebCrypto |
| Sikkerhetskode | Etter Signals «safety number»: iterert SHA-512, 60 sifre |

## Testgrunnlaget

Alle kjøres i CI på hver endring. Lokalt: se [lokal utvikling](local-development.md).

| Nivå | Hvor | Viser blant annet |
| --- | --- | --- |
| Kryptografi | `packages/e2ee/src/*.test.ts` (`pnpm --filter @lanbort/e2ee test`) | At begge kontoers enheter leser og serveren aldri ser klartekst; korte meldinger polstres; endrede meldinger avvises; ny enhet leser ikke det som ble sendt før den kom med; tilbakekalt og fjernet enhet stenges ute; bare én av to samtidige commits gjelder; spøkelsesenheter, enheter fra kontoer utenfor samtalen og en tredje konto avvises; en deltaker kan ikke fjerne en annens enhet uten tilbakekalling; endret kontonøkkel godtas ikke uten kvittering; kobling avviser byttede nøkler og pakker fra noen som ikke så koden; sikkerhetskopien åpnes bare med nøkkelen; nøkkelmateriale kan ikke skrives ut |
| Klientmotoren | `apps/web/src/chat/*.test.ts` | Historikkoverføring, og at en avsender ikke kan erstatte en melding som allerede står i historikken |
| Serveren | `packages/domain/src/chat/chat.integration.test.ts` (`pnpm test:integration`) | Hvem som når hvilke enheter, samtaler og arkiver; commit-rekkefølge; tilbakekalling og tilbakestilling; gjenoppretting; at en commit bare tar ut enheter serveren allerede har stengt ute; grensen på 100 enheter |
| Tilgang | `packages/domain/src/security/pilot-access.integration.test.ts`, `apps/web/e2e/authorization.spec.ts` | At fremmede får samme svar som for ID-er som ikke finnes, også for chatrutene |
| Databasen | `supabase/tests/0033`, `0035`, `0043`, `0046`, `0047`, `0052` (`pnpm db:test`) | Grenser og regler i tabellene, også at en enhet bare kan flyttes til ny sesjon og ellers bare tilbakekalles én gang |
| Nettleser | `apps/web/e2e/chat.spec.ts`, `smoke.spec.ts` | To venner chatter, kobling med kode, gjenoppretting med nøkkel, lånelogistikk ved blokkering; streng CSP med nonce på alle sider og kamera bare på godkjenningssiden |

## Funn i den interne gjennomgangen

| Funn | Status |
| --- | --- |
| Serveren kunne legge en tredje konto inn i katalogen for en samtale («spøkelsesdeltaker») | Rettet (#154): klienten fester de to kontoene |
| Meldinger fra en tilbakekalt enhet kunne vises før commiten som fjerner den | Rettet (#154) |
| En deltaker kunne erstatte en melding i historikken ved å sende samme meldings-ID på nytt | Rettet (#154) |
| Koblingskoden beskyttet bare mot forveksling: serveren kunne bytte nøklene i forespørselen eller lage en falsk pakke | Rettet (#160): link v2 |
| En ny eller gjenopprettet enhet startet uten de festede kontaktnøklene og stolte blindt på serveren igjen | Rettet (#160): festede nøkler i kontopakken og sikkerhetskopien |
| Ny innlogging for å bekrefte identiteten (reautentisering) koblet chat-enheten fra sesjonen | Rettet (#168) |
| En deltaker kunne få serveren til å slutte å levere til den andres levende enhet | Rettet (#168) |
| Ingen øvre grense på antall enheter, så en gjenoppretting kunne mislykkes | Rettet (#168): høyst 100 |
| Sider utenfor chat hadde `unsafe-inline` for skript, men deler opprinnelse og IndexedDB med chatsidene; COOP og CORP manglet | Rettet (#172) |
| Utlogging sletter ikke enhetens chattilstand og tilbakekaller ikke enheten, slik ADR-0010 punkt 7 sier | Under arbeid i tråden for chat-grensesnittet |
| En lesbar kopi av chatmeldinger sendt inn til en sak (WP-46) kunne oppgi en vilkårlig person som avsender og vise personens ekte navn | Rettet (#155): kopien må komme fra en samtale innsenderen selv er med i |

## Kjente begrensninger og spørsmål til gjennomgangen

- **Første kontakt er trust on first use.** Serveren kan bytte kontonøkkel før to kontoer har sett hverandre. Sikkerhetskoden avdekker det, men bare hvis brukerne sammenligner den.
- **Kompromittert webleveranse** kan lese alt (ADR-0010 punkt 13). CSP og låste avhengigheter reduserer XSS-risikoen, men ikke dette.
- **Ingen Web Worker ennå.** Nøkler og tilstand ligger i hovedtrådens minne (ADR-0010 punkt 10 sier «bør»).
- **Tidspunktet som vises for en mottatt melding, kommer fra serveren**, ikke fra avsenderen inne i den krypterte meldingen. Serveren kan derfor endre det.
- **Sikkerhetskopien har ingen versjon.** Serveren kan gi tilbake en eldre sikkerhetskopi under samme kontonøkkel. Det gir eldre historikk og eldre festede nøkler ved gjenoppretting, aldri en annen kontonøkkel.
- **Kontonøkkelen ligger på hver enhet.** En kompromittert enhet som ikke er tilbakekalt, kan sertifisere nye enheter. Kontoeieren får sikkerhetsvarsel på e-post ved hver ny kobling.
- **Gjenoppretting krever ikke ny e-postkode.** Den krever gjenopprettingsnøkkelen, som bare brukeren har; tilbakestilling krever begge deler. Vurder om dette er riktig avveining.
- **Interne funksjoner i ts-mls:** `unprotectPrivateMessage` brukes for å lese avsender før tilstanden endres (ADR-0010 punkt 2), og brukte nøkler nullstilles først etter at tilstanden er byttet, fordi listen deler referanser med den gamle tilstanden.
- **Serveren kan holde tilbake en tilbakekalling fra en kontakt** (ADR-0010 punkt 7, akseptert restrisiko).
- **Vedlegg** (ADR-0010 punkt 11) er ikke bygget.

## Hva som gjenstår før Port C

- Den uavhengige kryptografiske gjennomgangen, med rettelser av det den finner.
- Utlogging som sletter chattilstanden og tilbakekaller enheten.
- At Port C-punktene om XSS/CSP/supply chain, UX for nøkkel- og enhetstap og ingen «dekrypter alt»-vei bekreftes av produkteier etter gjennomgangen.
