# Backup og gjenoppretting

> **Status:** Gjeldende fra WP-72, tilpasset gratisplanen i utviklingsfasen (ADR-0009). Forankret i [datalivssyklus, backup og gjenoppretting](../architecture/09-datalivssyklus-backup-og-gjenoppretting.md), [threat model](../architecture/08-sikkerhet-og-threat-model.md) («Backup-/restore-lekkasje») og PS-NFR-014. Kort sagt: en gjenoppretting skal få tjenesten tilbake uten at noe som var slettet eller begrenset, blir synlig igjen.

## Strategi i utviklingsfasen

Hostede miljøer ligger på Supabase Free, som ikke har automatisk backup ([ADR-0009](../architecture/decisions/ADR-0009-backup-i-utviklingsfasen.md)). Det er akseptert i denne fasen. Betalt backup er ingen forutsetning for noen arbeidspakke eller kvalitetsport før produkteier har vurdert backupnivået på nytt før et eksternt brukerpanel (Port D).

| Situasjon | Hva som gjøres |
| --- | --- |
| Databasen er tapt eller ødelagt, og det finnes ingen dump | Bygg den opp igjen fra migrasjonene i repoet (`pnpm exec supabase db push --db-url "$DB_URL"` mot et tomt prosjekt). Skjema, regler og lagringsbøtter kommer tilbake; innholdet er tapt. |
| Det finnes en manuell dump | Gjenopprett dumpen etter [fremgangsmåten](#fremgangsmåte) under. Alt etter dumpen går tapt, bortsett fra slettinger og begrensninger som journalen gjør på nytt. |
| Avledede data (søkeindeks) er feil | `pnpm ops:restore finish` eller den planlagte jobben bygger dem på nytt fra domenetabellene. |

Pilotmålene i [arkitektur 09](../architecture/09-datalivssyklus-backup-og-gjenoppretting.md) (RPO ≤ 24 timer, RTO ≤ 8 timer) gjelder fra piloten, ikke nå. Etterarbeidet (`pnpm ops:restore finish`) tok rundt to sekunder i øvelsen, så RTO avhenger i praksis av hvor lang tid selve gjenopprettingen tar.

Verken en dump eller en Supabase-backup inneholder filene i Supabase Storage (objektbilder), bare databasen. Ved gjenoppretting i samme prosjekt blir en fil lastet opp etter backupen foreldreløs og slettes av etterarbeidet. Ved gjenoppretting til et nytt prosjekt blir filene liggende i det gamle prosjektet, som derfor avvikles (steg 8 i fremgangsmåten). En fil som er slettet, kommer aldri tilbake.

## Manuell dump ved milepæler

Ta en dump før en risikabel endring på et hostet miljø med data som er verdt å beholde, for eksempel før en stor migrasjon. Supabase CLI (som følger med repoet) virker mot gratisplanen. Bruk tilkoblingsstrengen fra **Connect** i prosjektet (Session pooler hvis nettverket bare har IPv4):

```sh
pnpm exec supabase db dump --db-url "$DB_URL" -f roles.sql --role-only
pnpm exec supabase db dump --db-url "$DB_URL" -f schema.sql
pnpm exec supabase db dump --db-url "$DB_URL" -f data.sql --use-copy --data-only
pnpm exec supabase db dump --db-url "$DB_URL" -f history_schema.sql --schema supabase_migrations
pnpm exec supabase db dump --db-url "$DB_URL" -f history_data.sql --use-copy --data-only --schema supabase_migrations
```

De to siste filene er migrasjonshistorikken, som `pnpm ops:restore finish` sjekker mot repoet. Noter tidspunktet dumpen ble tatt.

Dumpen inneholder personopplysninger og alt som var slettet frem til da. Den skal derfor krypteres, lagres utenfor repoet og utenfor Supabase-prosjektet, og eldre dumps slettes når en ny er tatt.

## Fremgangsmåte

Fremgangsmåten er den samme om backupen er en manuell dump eller, senere, en backup Supabase har tatt. Bare steg 4 er forskjellig.

1. **Velg backup.** Bruk siste dump eller backup før hendelsen. Noter tidspunktet.
2. **Steng appen.** Sett Vercel-prosjektet på pause, så verken brukere eller planlagte jobber skriver til databasen mens den gjenopprettes og før den er sjekket.
3. **Ta ut journalen fra databasen som erstattes**, hvis den fortsatt kan leses:
   `pnpm ops:restore journal --since <backupens tidspunkt minus én time> --out <fil>`
   med `DATABASE_URL` mot den. Journalen inneholder bare ID-er og koder for det som ble slettet eller begrenset etter backupen, aldri navn, kontaktopplysninger eller fritekst. Filen overskrives aldri. Den må tas ut **før** en gjenoppretting i samme prosjekt, fordi den overskriver databasen.
4. **Gjenopprett**, helst til et nytt prosjekt, aldri over en database som er i bruk:
   - **Manuell dump:** i et nytt, tomt prosjekt med `DB_URL` mot det:
     ```sh
     psql --single-transaction --variable ON_ERROR_STOP=1 \
       --file roles.sql --file schema.sql \
       --command 'SET session_replication_role = replica' --file data.sql \
       --dbname "$DB_URL"
     psql --single-transaction --variable ON_ERROR_STOP=1 \
       --file history_schema.sql --file history_data.sql --dbname "$DB_URL"
     ```
     Sett deretter appens miljøvariabler til det nye prosjektet.
   - **Backup tatt av Supabase** (bare på betalt plan): Database → Backups. Prosjektet er utilgjengelig mens det pågår.
5. **Fullfør:** `pnpm ops:restore finish --journal <fil>` med `DATABASE_URL` mot den gjenopprettede databasen. Kommandoen
   - stopper med en gang hvis databasen ikke har akkurat migrasjonene i repoet (kjør da migrasjonene først),
   - gjør slettinger og begrensninger fra journalen på nytt med domenets egne kommandoer, som systemprosessen `ops.restore`,
   - bygger søkeindeksen på nytt fra domenetabellene,
   - sjekker at slettede kontoer ikke har data igjen og at søkeindeksen stemmer.

   Kommandoen kan kjøres flere ganger; det som er gjort, gjøres ikke igjen. Svarer den `Ready to open`, er databasen klar.
6. **Åpne appen** ved å oppheve pausen. Outbox-arbeideren sletter da innloggingsidentitetene til slettede kontoer og foreldreløse bildefiler.
7. **Fortell brukerne** hvilket tidsrom som gikk tapt, så de kan gjøre det de gjorde da, på nytt.
8. **Avvikle det gamle prosjektet** når det nye er åpnet og fungerer, hvis gjenopprettingen gikk til et nytt prosjekt. Det gamle inneholder fortsatt slettede data og bildefiler som det nye ikke kjenner til, og som etterarbeidet derfor ikke kan slette. Kopier først over bilder som fortsatt hører til objekter i den gjenopprettede databasen, og slett deretter prosjektet. Sletting kan ikke angres og gjøres bare etter klarsignal fra produkteier.

`pnpm ops:restore verify` kjører bare migrasjonssjekken og sjekkene, for eksempel etter en vanlig vedlikeholdsjobb.

## Hva som gjøres på nytt, og hva som går tapt

Alt som skjedde etter backupen, går tapt (RPO), bortsett fra det som ville gjort slettet eller begrenset data synlig igjen. Det gjøres på nytt: slettede kontoer og objekter, fjernede bilder, blokkeringer, avsluttede vennskap, kontostans, suspensjon og kontrollert avslutning, avsluttede eller passive medlemskap, utestengelser, fjernede administratorroller, strengere miljøtype, medeieres sperrer mot nye lån, arkiverte objekter, tilbaketrukne, avviste, blokkerte eller pausede publiseringer og fjernede plattformroller.

Det som går tapt, er nytt innhold og nye relasjoner, redigeringer, lån og saker i tidsrommet. En redigering som fjernet tekst fra et objekt, går også tapt, slik at den tidligere teksten er tilbake. Det samme gjelder opphevede begrensninger: de forblir på, og brukeren kan oppheve dem igjen.

Hver hendelsestype er klassifisert i koden som enten gjentatt (`restoreReplays`) eller mulig tap (`restoreLosses`). En ny hendelsestype må klassifiseres før testene går gjennom.

## Når noe må håndteres

Kan en journalpost ikke gjøres trygt på nytt, sier kommandoen `Needs handling` med hendelsestype og ID, og svarer `Not ready to open`. Appen skal da ikke åpnes. Det skjer når den gjenopprettede databasen er i en tilstand som ikke tillater endringen, for eksempel en slettet konto som fortsatt har et lån i backupen, eller et miljø som byttet eier etter backupen. Løs saken med domenets vanlige kommandoer og kjør `finish` igjen.

## Kjente begrensninger

- **Ingen automatisk backup i utviklingsfasen.** Alt etter siste manuelle dump kan gå tapt, og uten dump er alt innhold tapt (ADR-0009).
- **Databasen som erstattes, kan ikke leses.** Da finnes ingen journal, og det som ble slettet etter backupen, kommer tilbake. Slettinger brukerne ba om i tidsrommet, må da gjøres på nytt for hånd. Jo nyere backupen er, desto kortere er tidsrommet.
- **Bildefiler** har ingen egen backup. Gjenopprettes databasen til et nytt prosjekt, følger bildene ikke med og må kopieres fra det gamle prosjektet hvis det fortsatt finnes. Separat sikkerhetskopi av mediefiler (arkitektur 09) avhenger av oppbevaringstidene i OD-0002.
- **E-postvarsler** som var sendt etter backupen, kan sendes én gang til.

## Øvelsen

`packages/domain/src/restore/restore.integration.test.ts` kjører i CI-jobben `database`. Den tar en ekte backup (`pg_dump`) av en isolert database, gjør slettinger og begrensninger etter backupen, tar ut journalen, gjenoppretter backupen (`pg_restore`) til en ny isolert database og fullfører. Deretter sjekker den at ingenting slettet eller begrenset er tilbake, at Finn bare finner det som fortsatt er tilbudt, at sjekkene består, at tiden er innenfor RTO, og at en ny kjøring ikke gjør noe to ganger.

### Gjenstår

- **Når et hostet miljø med data finnes:** ta den første manuelle dumpen og gjenopprett den én gang til et isolert prosjekt etter fremgangsmåten over, med `finish` og en journal, og noter faktisk tid mot RTO. Kommandoene for dump og gjenoppretting følger Supabases egen veiledning, men er ennå ikke øvd mot et hostet prosjekt.
- **Før et eksternt brukerpanel (Port D):** produkteier beslutter backupnivået for piloten på nytt (ADR-0009), for eksempel betalt plan med daglig backup, planlagte krypterte dumps på gratisplanen eller lengre RPO for en liten pilot.
