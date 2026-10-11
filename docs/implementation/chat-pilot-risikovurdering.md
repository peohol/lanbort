# Risikovurdering: privat chat i den lukkede piloten uten uavhengig gjennomgang

> **Status:** Besluttet av produkteier 11. oktober 2026 (OD-0056). Et bevisst, midlertidig unntak fra [Port C](quality-gates.md#port-c--før-privat-chat-aktiveres) for den lukkede piloten, for å finne ut om Lånbort har livets rett før betydelige private midler brukes. **Det er ikke en generell sikkerhetsgodkjenning.** Den uavhengige kryptografiske gjennomgangen står fortsatt som krav før bred lansering (Port E).

## Hva unntaket gjelder

Privat chat (ADR-0010, WP-43) slås på i produksjon for de inviterte pilotdeltakerne, selv om Port C-kravet om uavhengig kryptografisk designreview ikke er oppfylt. Alt annet i Port C er bygget og sjekket internt ([status](quality-gates.md#port-c-oppfylt-med-unntak-for-den-lukkede-piloten)).

## Forutsetninger som er oppfylt før aktivering

| Forutsetning | Hvordan | Sjekket |
| --- | --- | --- |
| Ingen kjente, alvorlige svakheter står uadressert | Alle funn fra den interne gjennomgangen er rettet (#154, #155, #160, #161, #168, #172, #189; [funnene](e2ee-gjennomgangsgrunnlag.md#funn-i-den-interne-gjennomgangen)). Ingen åpne saker eller sikkerhetsmeldinger på repoet. `pnpm audit` uten funn. ts-mls er på 1.6.4, som retter bibliotekets eneste publiserte sårbarhet (GHSA-gwp3-968w-m7gv, august 2026: en commit med bare én fjerning lot den fjernede lese videre). Ingen nyere stabil versjon finnes. I tillegg leveres en adversariell sikkerhetsrevisjon av krypteringen (bestilt 11. oktober 2026) før bryteren settes, og funn som må rettes før pilot, rettes først | 11. oktober 2026; revisjonen før aktivering |
| Deltakerne får vite hva de tar i bruk, og bekrefter aktivt | Før første gangs bruk sier «Slå på privat chat» at krypteringen er laget og testet internt, men ikke uavhengig gjennomgått, at det kan finnes uoppdagede svakheter, at sensitive opplysninger bør unngås, og at chat kan slås av på kort varsel. Knappen er sperret til deltakeren har krysset av for å ha lest og forstått, og serveren nekter å registrere en chatnøkkel for en konto som ikke har bekreftet ([PS-COM-023](../product-spec/05-kommunikasjon-varsler-og-saker.md#ps-com-023--privat-chat-i-piloten-tas-i-bruk-med-åpne-øyne)). Resten av piloten virker uten chat | Test |
| Chat er bare for inviterte | `CHAT_ENABLED=pilot` holder chat på bare så lenge innloggingstjenesten ikke lager kontoer for nye adresser ([lukket pilot](pilot-operations.md#hvem-som-kommer-inn)). Åpnes Lånbort, lukkes chat av seg selv | Test; produksjon når bryteren settes |
| Chat kan slås av raskt | Fjern `CHAT_ENABLED` i Vercel og publiser på nytt: alle chatruter svarer «finnes ikke», og sidene sier at chat ikke er tilgjengelig. Meldingene står igjen kryptert på enhetene; serveren har bare chiffertekst ([alvorlige hendelser](pilot-operations.md#alvorlige-hendelser)) | Test; produksjon når bryteren settes |
| Eksisterende sikkerhetstiltak står | Kryptering (MLS), tilgangskontroll på serveren, CSP med nonce, fartsgrenser, blokkering, og kopi til sak bare fra egen samtale er uendret | Test |

## Risikoene ved å åpne uten uavhengig gjennomgang

| Risiko | Sannsynlighet | Konsekvens | Hvorfor det er forsvarlig i piloten |
| --- | --- | --- | --- |
| En protokollfeil i vår bruk av MLS som den interne gjennomgangen ikke så (feil i hvem som godtas, nøkkelrotasjon, epoker) | Lav til middels. Biblioteket følger RFC 9420, og de kjente feilklassene er testet (spøkelsesenheter, fjerning, commit-kappløp, kontonøkkelbytte) | En annen deltaker, eller noen med serveren, kan lese meldinger de ikke skulle | Få deltakere, invitert av produkteier; deltakerne er bedt om å unngå sensitive opplysninger; serveren og databasen drives av produkteier alene |
| En feil i selve ts-mls | Lav. Én sårbarhet er publisert og rettet; versjonen er låst | Som over | Vi følger bibliotekets sikkerhetsmeldinger; chat kan slås av på minutter |
| Kompromittert webleveranse eller XSS | Lav. CSP med nonce og `strict-dynamic`, ingen tredjepartsskript, låste avhengigheter, Gitleaks og `pnpm audit` i CI | Nøkler og klartekst på enheten kan leses | Gjelder uansett gjennomgang (ADR-0010 punkt 13). Bare produkteier og Claude kan skrive til repoet |
| Første kontakt er trust on first use: serveren kan bytte kontonøkkel før to kontoer har sett hverandre | Krever at serveren er fiendtlig | Serveren kan lese én samtale | Serveren drives av produkteier; sikkerhetskoden i «Om samtalen» avslører det |
| Metadata (hvem skriver med hvem, når, hvor mye) er synlig for serveren | Sikkert | Serveren ser samtalemønstre | Utenfor det E2EE lover; står i personvernsiden og ADR-0010 |
| En deltaker opplever at chat forsvinner når den slås av | Lav | Meldinger blir utilgjengelige i appen til den slås på igjen | Deltakerne er fortalt det før de tar chat i bruk |

Samlet: risikoen er begrenset til de inviterte deltakerne, som er informert og har bekreftet, og til opplysninger de selv velger å skrive. Den største risikoen, en uoppdaget protokollfeil, gir i verste fall innsyn for en annen deltaker eller den som driver serveren, ikke for allmennheten. Det står i forhold til en liten pilot der chat er valgfri.

## Hva som fortsatt gjenstår

- Den uavhengige kryptografiske gjennomgangen ([grunnlaget](e2ee-gjennomgangsgrunnlag.md)), med rettelser av det den finner, før bred lansering (Port E). Spørsmålene til gjennomgangen i grunnlaget står ved lag.
- Unntaket faller bort når Lånbort åpnes for andre enn inviterte: da må Port C være oppfylt, eller chat være av.

## Hvis noe skjer

Følg [alvorlige hendelser](pilot-operations.md#alvorlige-hendelser). For chat betyr det: slå av chat først, sikre loggene, og vurder om deltakerne skal få beskjed om at meldinger kan ha blitt lest.
