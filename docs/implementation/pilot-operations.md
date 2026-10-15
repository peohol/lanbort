# Drift av den lukkede piloten

> **Status:** Gjelder den lukkede piloten (Port D, PS-NFR-015). Hvem som får være med, bestemmer produkteier.

## Hvem som kommer inn

Produksjon lager ikke kontoer for nye e-postadresser (`enable_signup = false` under `[remotes.production.auth]` i `supabase/config.toml`). Bare adresser som allerede finnes i Supabase Auth, får en kode, og de kommer dit bare når produkteieren inviterer dem fra appen (PS-USR-015):

- Innloggingssiden sier at Lånbort foreløpig bare er åpent for inviterte, og svarer likt for alle adresser («Er … invitert, har vi sendt en kode dit»), så ingen kan finne ut hvem som er med (`newAccountsOpen` i `@lanbort/auth`, som leser Auths egen innstilling).
- En invitert logger inn med engangskode som vanlig. Ved første innlogging lager appen kontoen og går videre til registreringen (alder og navn), som før.
- Settes `enable_signup` tilbake (eller fjernes), er Lånbort åpent for alle igjen, og siden sier det samme som lokalt.

Lokalt og i testene er nyregistrering åpen.

Privat chat følger den samme sperren: `CHAT_ENABLED=pilot` holder chat på bare så lenge nye adresser ikke får konto ([risikovurderingen](chat-pilot-risikovurdering.md)). Åpnes Lånbort, lukkes chat av seg selv til Port C er oppfylt. Invitasjonene fra appen endrer ikke dette: de lager brukeren gjennom innloggingstjenestens administrasjon, mens registreringen for alle andre fortsatt er stengt.

### Slik legger produkteier til en deltaker

I appen: **Konto › Venner › Inviter en person**. Skriv deltakerens e-postadresse, kryss eventuelt av for «Spør også om å bli venner», og trykk **Send invitasjon**. Deltakeren får en e-post med navnet ditt og en lenke til innloggingen, og registrerer seg der med en kode på e-post. Invitasjonen gjelder i 14 dager og kan trekkes tilbake under «Sendt på e-post» på Venner; da fjernes adressen fra innloggingen igjen hvis den ikke er tatt i bruk.

Hvem som kan invitere nye deltakere, står i miljøvariabelen `PILOT_INVITERS` i Vercel (Lånborts bruker-ID-er, adskilt med komma; satt til produkteierens konto). Andre ser «Venneforespørsel på e-post» i stedet, som bare når adresser som allerede har konto. Invitasjonene trenger `SUPABASE_SECRET_KEY`, `RESEND_API_KEY`, `NOTIFICATION_EMAIL_FROM` og `APP_URL`; uten dem venter de i køen og prøves igjen.

Virker ikke appen, kan en deltaker også legges til i Supabase:

1. Gå til <https://supabase.com/dashboard> og åpne Lånbort-prosjektet.
2. Velg **Authentication** i menyen til venstre, deretter **Users**.
3. Trykk **Add user** og velg **Create new user**.
4. Skriv deltakerens e-postadresse. Feltet for passord kan stå tomt hvis det er lov; må noe fylles inn, bruk en lang, tilfeldig tekst som ikke lagres noe sted, fordi Lånbort aldri bruker passord.
5. Kryss av for at brukeren skal bekreftes automatisk (**Auto Confirm User**), og trykk **Create user**.
6. Si fra til deltakeren at de kan gå til Lånbort og logge inn med e-postadressen sin.

Navnene på knappene er slik Supabase har beskrevet dem; dashbordet kan ha endret ordlyden.

Ikke slett brukere i Supabase-dashbordet. Det hopper over Lånborts egen kontosletting (PS-ADM-006). En deltaker som skal ut, sletter kontoen sin i appen.

## Grenser for innlogging

Auth ser bare serveren, så grensene per klient og per e-postadresse ligger i serveren (WP-73, [server-boundary](server-boundary.md#fartsgrenser-og-misbruksvern-wp-73)). Auths egne grenser per adresse er derfor like høye som lokalt. I produksjon sender Auth høyst 60 e-poster i timen for hele prosjektet, så innloggingskoder ikke bruker opp e-postplanen.

## Henvendelser om sikkerhet og personvern

Siden **Personvern og sikkerhet** under Konto (`/konto/personvern`) sier at innlogging skjer med engangskode på e-post og at Lånbort ikke bruker passord, hvem som driver Lånbort og er ansvarlig for opplysningene, hva som lagres og hvor lenge ([oppbevaring](retention.md)), hvilke leverandører som behandler dem, og hvor man melder fra om noe alvorlig eller ber om innsyn, retting og sletting. Navnet og adressen er `OPERATOR_NAME` og `CONTACT_EMAIL` i Vercel, ikke i repoet, som er offentlig. Produkteier leser adressen og tar kontakt med Claude når noe må gjøres.

Sikkerhetsfeil fra andre enn deltakerne meldes privat gjennom GitHubs «Report a vulnerability» på repoet ([SECURITY.md](../../SECURITY.md)), som `/.well-known/security.txt` peker til. Filen har en utløpsdato (`Expires`) som må flyttes fram før den passeres. Når plattformkøen åpnes (`PLATFORM_STEWARDS_ENABLED` og minst én forvalter med to nøkler), kan deltakerne også bruke «Rapporter til Lånbort» i appen.

### Adressen på lånbort.no

Produkteier har valgt at `CONTACT_EMAIL` skal være `sikkerhet@lånbort.no` (10. oktober 2026). Lånbort.no kan ikke ta imot e-post av seg selv: domenet har bare oppsett for å sende (Resend), og Vercel, som har DNS-en, videresender ikke e-post. Adressen går derfor gjennom gratisplanen til videresendingstjenesten ImprovMX, som sender alt videre til en innboks produkteier allerede leser. Det krever:

1. En konto hos tjenesten, laget av produkteier, med lånbort.no (`xn--lnbort-iua.no`) og aliaset `sikkerhet` som sendes videre til produkteiers adresse. Sjekk vilkårene for gratisplanen før den tas i bruk. ImprovMX er et amerikansk selskap som kan behandle e-posten i USA og Europa; siden **Personvern og sikkerhet** sier det.
2. Tre DNS-poster på selve domenet (`@`) i Vercel: MX `mx1.improvmx.com` med prioritet 10, MX `mx2.improvmx.com` med prioritet 20, og TXT `v=spf1 include:spf.improvmx.com ~all` (ImprovMX sin generelle veiledning, lest 10. oktober 2026). Resends poster ligger på underdomenet `send` og berøres ikke.
3. En test-e-post til adressen før den settes som `CONTACT_EMAIL`.

DNS-endringer gjøres bare med produkteiers uttrykkelige ja.

## Alvorlige hendelser

Med alvorlig hendelse menes at personopplysninger kan ha kommet på avveie, blitt endret eller blitt borte, at noen har kommet inn der de ikke skal, eller at Lånbort brukes til å skade noen. Produkteier er behandlingsansvarlig og eier hendelsen: avgjør, varsler og melder. Claude gjør de tekniske stegene.

1. **Stans skaden.** Det minste som virker, i denne rekkefølgen:
   - Angrep med mange forespørsler: slå på Vercels «Attack Challenge Mode» for prosjektet.
   - En lekket nøkkel: lag en ny og slett den gamle (Supabase-nøkler og databasepassord, `RESEND_API_KEY`, `SUPABASE_AUTH_SMTP_PASSWORD`, `SUPABASE_ACCESS_TOKEN`), og deploy på nytt der den brukes.
   - Feil i appen som viser eller endrer data den ikke skal: rull tilbake til forrige deploy i Vercel, eller sett prosjektet på pause til feilen er rettet.
   - En sikkerhetsfeil i privat chat: fjern `CHAT_ENABLED` fra prosjektets miljøvariabler i Vercel og publiser på nytt («Redeploy» på siste produksjonsdeploy). Da svarer alle chatruter «finnes ikke», og Samtaler sier at chat ikke er tilgjengelig; meldingene står igjen kryptert på deltakernes enheter. Å sette verdien til noe annet enn `pilot` virker likt. Prøvd 14. oktober 2026: chat var av 86 sekunder etter at ny publisering startet. Slå på igjen med `pilot` når feilen er rettet.
   - En deltaker som misbruker Lånbort: utestengelse i miljøet. Til plattformforvaltere kan sperre kontoer (de trenger sterkere innlogging først, ADR-0011), stenges innloggingen i Supabase ved å utestenge brukeren der («ban»). Brukeren slettes ikke.
2. **Sikre sporene med en gang.** Leverandørenes logger forsvinner av seg selv ([oppbevaring](retention.md#logger-hos-leverandørene)): Vercel etter 1 dag, Supabase og ImprovMX etter 7 og Resend etter 30. Ta ut det som gjelder hendelsen før det, og lagre det privat, aldri i dette repoet, som er offentlig.
3. **Vurder hvem og hva det gjelder**: hvilke opplysninger, hvor mange, og hvor alvorlig det kan bli for dem.
4. **Meld fra.**
   - Til Datatilsynet innen 72 timer etter at hendelsen ble kjent, med mindre det er usannsynlig at den gir risiko for noen (personvernforordningen artikkel 33), gjennom skjemaet [Meld avvik til Datatilsynet](https://www.datatilsynet.no/rettigheter-og-plikter/virksomhetenes-plikter/avvik/meld-avvik-til-datatilsynet/). Det som ikke er klart ennå, ettersendes.
   - Til dem det gjelder, uten unødig opphold, når hendelsen kan gi høy risiko for dem (artikkel 34). E-posten sier hva som skjedde, hva det betyr for dem, hva Lånbort har gjort, og hva de selv bør gjøre.
5. **Gjenopprett** om data er ødelagt eller borte, etter [backup og gjenoppretting](backup-restore.md).
6. **Skriv det ned.** Alle hendelser, også de som ikke meldes, føres i en privat avvikslogg (artikkel 33 nr. 5): hva skjedde, når det ble kjent, hva det gjaldt, hva som ble gjort og hvorfor det ble eller ikke ble meldt. Rett feilen og oppdater denne siden om den manglet noe.

## Kjente mangler

Port D krever at kjente mangler er dokumentert og vurdert. Dette er det som bevisst står igjen i den lukkede piloten, og hvorfor det er forsvarlig der:

| Mangel | Følge | Vurdering for lukket pilot |
| --- | --- | --- |
| Privat chat slås på uten uavhengig kryptografisk gjennomgang (`CHAT_ENABLED=pilot`, OD-0056) | Det kan finnes svakheter i krypteringen som den interne gjennomgangen ikke fant | Et bevisst, midlertidig unntak fra Port C for den lukkede piloten, med [egen risikovurdering](chat-pilot-risikovurdering.md): ingen kjente alvorlige svakheter står uadressert, hver deltaker bekrefter merknaden før første gangs bruk (PS-COM-023), chat er bare for inviterte, og den kan slås av raskt (under). Den uavhengige gjennomgangen ([grunnlaget](e2ee-gjennomgangsgrunnlag.md)) kreves før bred lansering |
| Plattformforvaltning er av (`PLATFORM_STEWARDS_ENABLED` er ikke satt) | Ingen plattformkø og ingen inngrep fra Lånbort; saker håndteres i miljøene. En konto som misbrukes, stenges i Supabase ([alvorlige hendelser](#alvorlige-hendelser)) | Privilegerte handlinger avvises til passkeys er tatt i bruk (ADR-0011) |
| Representanttilgang ved død eller varig utilgjengelighet er av (OD-0003 åpen) | Ingen kan handle på vegne av en avdød deltaker | Testet utilgjengelig (pgTAP 0030); saker løses manuelt |
| Ingen Point-in-Time Recovery (OD-0022) | Inntil 24 timers endringer kan gå tapt; gjenoppretting tar inntil 8 timer | Valgt av produkteier. Den egne backupen øves hver natt og hver måned; gjenoppretting av Supabases backup er ikke øvd ([backup](backup-restore.md#øvelsen)) |
| Resend på gratisplan | E-post stopper når dagens eller månedens tak er nådd, til neste periode | Holder for en liten pilot; følg med i Resend ved flere deltakere |
| Kontaktadressen videresendes av ImprovMX (USA), gratisplan | E-post til `CONTACT_EMAIL` passerer et selskap i USA | Står på personvernsiden; bare videresending, loggene slettes etter 7 dager |
| Ingen uavhengig sikkerhetsgjennomgang av hele appen | Funn som de automatiske testene ikke dekker, kan finnes | Krav før bred lansering (Port E); intern sikkerhetstest (WP-70) er grønn |
| `security.txt` utløper 1. oktober 2027 | Etter det regnes kanalen som utdatert | Flytt `Expires` fram før datoen |
| Migrasjoner må kjøres i produksjon rett etter at de er slått sammen | Ny kode går ikke ut før databasen har alle migrasjonene den er bygget med | Produksjonsbygget i Vercel venter inntil 20 minutter på `migrate` i «Supabase production» og feiler ellers, så forrige versjon fortsetter å svare; kjør `migrate` og publiser på nytt. Øvelsen legger manglende migrasjoner på den gjenopprettede kopien og varsler om dem |
