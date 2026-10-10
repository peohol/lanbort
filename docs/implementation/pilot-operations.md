# Drift av den lukkede piloten

> **Status:** Gjelder den lukkede piloten (Port D, PS-NFR-015). Hvem som får være med, bestemmer produkteier.

## Hvem som kommer inn

Produksjon lager ikke kontoer for nye e-postadresser (`enable_signup = false` under `[remotes.production.auth]` i `supabase/config.toml`). Bare adresser som allerede finnes i Supabase Auth, får en kode:

- Innloggingssiden sier at Lånbort foreløpig bare er åpent for inviterte, og svarer likt for alle adresser («Er … invitert, har vi sendt en kode dit»), så ingen kan finne ut hvem som er med (`newAccountsOpen` i `@lanbort/auth`, som leser Auths egen innstilling).
- En invitert logger inn med engangskode som vanlig. Ved første innlogging lager appen kontoen og går videre til registreringen (alder og navn), som før.
- Settes `enable_signup` tilbake (eller fjernes), er Lånbort åpent for alle igjen, og siden sier det samme som lokalt.

Lokalt og i testene er nyregistrering åpen.

### Slik legger produkteier til en deltaker

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
