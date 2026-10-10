# Backup og gjenoppretting

> **Status:** Gjeldende fra WP-72, med backupnivået for piloten fra OD-0022 (10. oktober 2026). Forankret i [datalivssyklus, backup og gjenoppretting](../architecture/09-datalivssyklus-backup-og-gjenoppretting.md), [threat model](../architecture/08-sikkerhet-og-threat-model.md) («Backup-/restore-lekkasje») og PS-NFR-014. Kort sagt: en gjenoppretting skal få tjenesten tilbake uten at noe som var slettet eller begrenset, blir synlig igjen.

## Strategi for piloten

Produksjonsprosjektet ligger i en Supabase-organisasjon på Pro-planen. Valget for piloten står i [OD-0022](../open-decisions.md); det gir tre lag uten nye løpende kostnader:

| Lag | Hva | Dekker | Hvor lenge |
| --- | --- | --- | --- |
| Supabases daglige backup | Hele databasen, tatt av Supabase hver natt (inkludert i planen) | Feil i data, en mislykket migrasjon, sletting ved en feil | 7 dager |
| Egen backup (arbeidsflyten «Backup») | Logisk dump av databasen og alle filene i Storage, lagret i et privat GitHub-repo utenfor Supabase | Det Supabases backup ikke har: bildene, og tap av hele prosjektet | 7 dager |
| Gjenoppbygging | Migrasjonene i repoet | Skjema, regler og lagringsbøtter, uten innhold | alltid |

Målene for piloten ([arkitektur 09](../architecture/09-datalivssyklus-backup-og-gjenoppretting.md)): RPO ≤ 24 timer (begge backupene er daglige) og RTO ≤ 8 timer. En backup holder det som var slettet da den ble tatt, så slettede data er borte fra alle backuper senest 7 dager etter slettingen. Journalen i [fremgangsmåten](#fremgangsmåte) hindrer at det kommer tilbake ved en gjenoppretting.

| Situasjon | Hva som gjøres |
| --- | --- |
| Data er feil eller slettet ved en feil, prosjektet finnes | Gjenopprett Supabases backup fra natten før (steg 4) og fullfør (steg 5). |
| Prosjektet er tapt, eller bildene er det | Gjenopprett den egne backupen til et nytt prosjekt (steg 4) og legg tilbake filene (`pnpm ops:storage import`). |
| Det finnes ingen backup | Bygg databasen opp igjen fra migrasjonene (`pnpm exec supabase db push --db-url "$DB_URL"` mot et tomt prosjekt). Innholdet er tapt. |
| Avledede data (søkeindeks) er feil | `pnpm ops:restore finish` eller den planlagte jobben bygger dem på nytt fra domenetabellene. |

Tilgang: Supabases backup kan bare hentes og gjenopprettes av medlemmer av Supabase-organisasjonen. Den egne backupen ligger som releaser i et privat repo som bare produkteier har tilgang til, og arbeidsflyten nekter å lagre i et offentlig repo. GitHub krypterer lagringen; en egen krypteringsnøkkel ville måtte ligge på samme sted for at gjenopprettingsøvelsen skal kunne bruke den, og ville derfor ikke beskytte mot noe mer.

### Egen backup og øvelse

`.github/workflows/backup.yml` gjør jobben og kalles av to arbeidsflyter:

- **«Restore drill»** i dette repoet, hver måned og ved behov: tar en backup av produksjon og gjenoppretter den til en isolert, midlertidig Supabase-stakk på GitHub-maskinen, slik en gjenoppretting til et nytt prosjekt går, med `finish`, filene og sjekkene. Ingenting lagres, og loggen har bare tider og antall. Produksjon blir bare lest.
- **Det private backup-repoet**, hver natt: lagrer backupen som en release, laster den ned igjen, sjekker at den er lik, øver gjenopprettingen av den lagrede kopien og sletter releaser eldre enn 7 dager. Repoet trenger hemmeligheten `SUPABASE_ACCESS_TOKEN`, og har bare denne arbeidsflyten:

  ```yaml
  name: Backup
  on:
    schedule:
      - cron: "41 2 * * *"
    workflow_dispatch:
  permissions:
    contents: write
  concurrency:
    group: backup
  jobs:
    backup:
      uses: peohol/lanbort/.github/workflows/backup.yml@main
      with:
        keep-days: 7
        drill: true
      secrets:
        SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
  ```

Verktøyene kan også kjøres for hånd: `scripts/ops/backup.sh dump|restore|stop` og `pnpm ops:storage export|import` (filene i alle bøttene, med sjekksummer; utskriften har bare antall). Arbeidsflyten «Supabase production» med `backups` viser Supabases daglige backuper.

## Fremgangsmåte

Fremgangsmåten er den samme om backupen er den egne eller Supabases. Bare steg 4 er forskjellig.

1. **Velg backup.** Bruk siste backup før hendelsen. Noter tidspunktet (den egne backupen har det i `database/taken-at`).
2. **Steng appen.** Sett Vercel-prosjektet på pause, så verken brukere eller planlagte jobber skriver til databasen mens den gjenopprettes og før den er sjekket.
3. **Ta ut journalen fra databasen som erstattes**, hvis den fortsatt kan leses:
   `pnpm ops:restore journal --since <backupens tidspunkt minus én time> --out <fil>`
   med `DATABASE_URL` mot den. Journalen inneholder bare ID-er og koder for det som ble slettet eller begrenset etter backupen, aldri navn, kontaktopplysninger eller fritekst. Filen overskrives aldri. Den må tas ut **før** en gjenoppretting i samme prosjekt, fordi den overskriver databasen.
4. **Gjenopprett**, helst til et nytt prosjekt, aldri over en database som er i bruk:
   - **Egen backup:** last ned releasen fra det private repoet og pakk den ut. I et nytt, tomt prosjekt med `DB_URL` mot det, fra mappen `database`:
     ```sh
     psql --single-transaction --variable ON_ERROR_STOP=1 \
       --file roles.sql --file schema.sql \
       --command 'SET session_replication_role = replica' --file data.sql \
       --dbname "$DB_URL"
     psql --single-transaction --variable ON_ERROR_STOP=1 \
       --file history_schema.sql --file history_data.sql --dbname "$DB_URL"
     ```
     Legg tilbake filene med `SUPABASE_URL` og `SUPABASE_SECRET_KEY` mot det nye prosjektet: `pnpm ops:storage import --from <mappen>/files`. Sett deretter appens miljøvariabler til det nye prosjektet. `scripts/ops/backup.sh restore` gjør det samme mot en lokal stakk.
   - **Supabases backup:** Database → Backups → Restore i prosjektet. Det overskriver databasen, og prosjektet er utilgjengelig mens det pågår. Filene i Storage berøres ikke.
5. **Fullfør:** `pnpm ops:restore finish --journal <fil>` med `DATABASE_URL` mot den gjenopprettede databasen. Kommandoen
   - stopper med en gang hvis databasen ikke har akkurat migrasjonene i repoet (kjør da migrasjonene først),
   - gjør slettinger og begrensninger fra journalen på nytt med domenets egne kommandoer, som systemprosessen `ops.restore`,
   - bygger søkeindeksen på nytt fra domenetabellene,
   - gir hver chatsamtale en ny gruppegenerasjon og sletter ventende chiffertekst og engangsnøkler fra før, siden enhetene kan være lenger fremme enn den gjenopprettede serveren (ADR-0010 §9); historikken på enhetene består,
   - sjekker at slettede kontoer ikke har data igjen og at søkeindeksen stemmer.

   Kommandoen kan kjøres flere ganger; det som er gjort, gjøres ikke igjen. Svarer den `Ready to open`, er databasen klar.
6. **Åpne appen** ved å oppheve pausen. Outbox-arbeideren sletter da innloggingsidentitetene til slettede kontoer og foreldreløse bildefiler.
7. **Fortell brukerne** hvilket tidsrom som gikk tapt, så de kan gjøre det de gjorde da, på nytt.
8. **Avvikle det gamle prosjektet** når det nye er åpnet og fungerer, hvis gjenopprettingen gikk til et nytt prosjekt. Det gamle inneholder fortsatt slettede data og bildefiler som det nye ikke kjenner til, og som etterarbeidet derfor ikke kan slette. Kopier først over bilder som fortsatt hører til objekter og profiler i den gjenopprettede databasen, og slett deretter prosjektet. Sletting kan ikke angres og gjøres bare etter klarsignal fra produkteier.

`pnpm ops:restore verify` kjører bare migrasjonssjekken og sjekkene, for eksempel etter en vanlig vedlikeholdsjobb.

## Hva som gjøres på nytt, og hva som går tapt

Alt som skjedde etter backupen, går tapt (RPO), bortsett fra det som ville gjort slettet eller begrenset data synlig igjen. Det gjøres på nytt: slettede kontoer og objekter, fjernede bilder, blokkeringer, avsluttede vennskap, kontostans, suspensjon og kontrollert avslutning, avsluttede eller passive medlemskap, utestengelser, fjernede administratorroller, strengere miljøtype, medeieres sperrer mot nye lån, arkiverte objekter, tilbaketrukne, avviste, blokkerte eller pausede publiseringer, fjernede plattformroller og tilbakekalte eller tilbakestilte chatenheter.

Det som går tapt, er nytt innhold og nye relasjoner, redigeringer, lån og saker i tidsrommet. En redigering som fjernet tekst fra et objekt, går også tapt, slik at den tidligere teksten er tilbake. Det samme gjelder opphevede begrensninger: de forblir på, og brukeren kan oppheve dem igjen.

Hver hendelsestype er klassifisert i koden som enten gjentatt (`restoreReplays`) eller mulig tap (`restoreLosses`). En ny hendelsestype må klassifiseres før testene går gjennom.

## Når noe må håndteres

Kan en journalpost ikke gjøres trygt på nytt, sier kommandoen `Needs handling` med hendelsestype og ID, og svarer `Not ready to open`. Appen skal da ikke åpnes. Det skjer når den gjenopprettede databasen er i en tilstand som ikke tillater endringen, for eksempel en slettet konto som fortsatt har et lån i backupen, eller et miljø som byttet eier etter backupen. Løs saken med domenets vanlige kommandoer og kjør `finish` igjen.

## Kjente begrensninger

- **Inntil et døgn går tapt** (RPO). Supabases Point-in-Time Recovery ville gitt minutter, men koster ekstra og er valgt bort for piloten (OD-0022).
- **Databasen som erstattes, kan ikke leses.** Da finnes ingen journal, og det som ble slettet etter backupen, kommer tilbake. Slettinger brukerne ba om i tidsrommet, må da gjøres på nytt for hånd. Jo nyere backupen er, desto kortere er tidsrommet.
- **Bildefiler** følger bare den egne backupen. Gjenopprettes Supabases backup, blir filene stående som de er; en fil lastet opp etter backupen blir foreldreløs og slettes av etterarbeidet, og en fil slettet etter backupen kommer ikke tilbake (bildet mangler da på tingen).
- **Den egne backupen avhenger av hemmeligheten** `SUPABASE_ACCESS_TOKEN` i det private repoet. GitHub sender e-post til eieren når den planlagte kjøringen feiler.
- **E-postvarsler** som var sendt etter backupen, kan sendes én gang til.

## Øvelsen

To øvelser holder gjenopprettingen i stand:

- `packages/domain/src/restore/restore.integration.test.ts` kjører i CI-jobben `database`. Den tar en ekte backup (`pg_dump`) av en isolert database, gjør slettinger og begrensninger etter backupen, tar ut journalen, gjenoppretter backupen (`pg_restore`) til en ny isolert database og fullfører. Deretter sjekker den at ingenting slettet eller begrenset er tilbake, at Finn bare finner det som fortsatt er tilbudt, at sjekkene består, at tiden er innenfor RTO, og at en ny kjøring ikke gjør noe to ganger.
- «Restore drill» (månedlig) og det private backup-repoet (hver natt) gjenoppretter en ekte backup av produksjon, med filene, til en isolert stakk og noterer tiden mot RTO i kjøringens sammendrag.

Ikke øvd: gjenoppretting av Supabases egen backup. Den skjer i selve prosjektet (eller til et nytt prosjekt, som koster ekstra), og blir derfor ikke øvd mot produksjon.
