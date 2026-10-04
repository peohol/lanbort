# Backup og gjenoppretting

> **Status:** Gjeldende fra WP-72. Forankret i [datalivssyklus, backup og gjenoppretting](../architecture/09-datalivssyklus-backup-og-gjenoppretting.md), [threat model](../architecture/08-sikkerhet-og-threat-model.md) («Backup-/restore-lekkasje») og PS-NFR-014. Kort sagt: en gjenoppretting skal få tjenesten tilbake uten at noe som var slettet eller begrenset, blir synlig igjen.

## Mål og hvordan de nås

| Mål (pilot) | Hvordan |
| --- | --- |
| RPO ≤ 24 timer | Supabase tar daglig backup av databasen på Pro-planen og oppover (Pro beholder 7 dager). Gratisplanen har ingen automatisk backup, så produksjon må ligge på minst Pro før pilot. Point-in-Time Recovery er et tillegg som gir RPO på omtrent to minutter; arkitekturen anbefaler det når kostnad og pilotnivå tillater det. |
| RTO ≤ 8 timer | Gjenopprettingen i Supabase tar tid etter databasens størrelse og er liten i pilot. Etterarbeidet (`pnpm ops:restore finish`) tok rundt to sekunder i øvelsen. Den første målingen i et hostet miljø gjøres i øvelsen under «Gjenstår». |
| Isolert restore-test | Øvelsen i CI gjenoppretter til egne, isolerte databaser. Hostet gjøres det til et nytt prosjekt, aldri over aktiv produksjon. |

Supabase-backupen inneholder ikke filene i Supabase Storage (objektbilder), bare databasen. En fil lastet opp etter backupen blir foreldreløs og slettes av etterarbeidet. En fil som er slettet, kommer aldri tilbake.

## Fremgangsmåte

1. **Velg tidspunkt.** Bruk siste backup før hendelsen. Noter backupens tidspunkt.
2. **Steng appen.** Sett Vercel-prosjektet på pause, så verken brukere eller planlagte jobber skriver til databasen mens den gjenopprettes og før den er sjekket.
3. **Ta ut journalen fra databasen som erstattes**, hvis den fortsatt kan leses:
   `pnpm ops:restore journal --since <backupens tidspunkt minus én time> --out <fil>`
   med `DATABASE_URL` mot den. Journalen inneholder bare ID-er og koder for det som ble slettet eller begrenset etter backupen, aldri navn, kontaktopplysninger eller fritekst. Filen overskrives aldri. Den må tas ut **før** en gjenoppretting på samme prosjekt, fordi den overskriver databasen.
4. **Gjenopprett i Supabase** (Database → Backups). Prosjektet er utilgjengelig mens det pågår.
5. **Fullfør:** `pnpm ops:restore finish --journal <fil>` med `DATABASE_URL` mot den gjenopprettede databasen. Kommandoen
   - stopper med en gang hvis databasen ikke har akkurat migrasjonene i repoet (kjør da migrasjonene først),
   - gjør slettinger og begrensninger fra journalen på nytt med domenets egne kommandoer, som systemprosessen `ops.restore`,
   - bygger søkeindeksen på nytt fra domenetabellene,
   - sjekker at slettede kontoer ikke har data igjen og at søkeindeksen stemmer.

   Kommandoen kan kjøres flere ganger; det som er gjort, gjøres ikke igjen. Svarer den `Ready to open`, er databasen klar.
6. **Åpne appen** ved å oppheve pausen. Outbox-arbeideren sletter da innloggingsidentitetene til slettede kontoer og foreldreløse bildefiler.
7. **Fortell pilotbrukerne** hvilket tidsrom som gikk tapt, så de kan gjøre det de gjorde da, på nytt.

`pnpm ops:restore verify` kjører bare migrasjonssjekken og sjekkene, for eksempel etter en vanlig vedlikeholdsjobb.

## Hva som gjøres på nytt, og hva som går tapt

Alt som skjedde etter backupen, går tapt (RPO), bortsett fra det som ville gjort slettet eller begrenset data synlig igjen. Det gjøres på nytt: slettede kontoer og objekter, fjernede bilder, blokkeringer, avsluttede vennskap, kontostans, suspensjon og kontrollert avslutning, avsluttede eller passive medlemskap, utestengelser, fjernede administratorroller, strengere miljøtype, medeieres sperrer mot nye lån, arkiverte objekter, tilbaketrukne, avviste, blokkerte eller pausede publiseringer og fjernede plattformroller.

Det som går tapt, er nytt innhold og nye relasjoner, redigeringer, lån og saker i tidsrommet. En redigering som fjernet tekst fra et objekt, går også tapt, slik at den tidligere teksten er tilbake. Det samme gjelder opphevede begrensninger: de forblir på, og brukeren kan oppheve dem igjen.

Hver hendelsestype er klassifisert i koden som enten gjentatt (`restoreReplays`) eller mulig tap (`restoreLosses`). En ny hendelsestype må klassifiseres før testene går gjennom.

## Når noe må håndteres

Kan en journalpost ikke gjøres trygt på nytt, sier kommandoen `Needs handling` med hendelsestype og ID, og svarer `Not ready to open`. Appen skal da ikke åpnes. Det skjer når den gjenopprettede databasen er i en tilstand som ikke tillater endringen, for eksempel en slettet konto som fortsatt har et lån i backupen, eller et miljø som byttet eier etter backupen. Løs saken med domenets vanlige kommandoer og kjør `finish` igjen.

## Kjente begrensninger

- **Databasen som erstattes, kan ikke leses.** Da finnes ingen journal, og det som ble slettet etter backupen, kommer tilbake. Point-in-Time Recovery gjør tidsrommet kort. Uten det må slettinger brukerne ba om i tidsrommet, gjøres på nytt for hånd.
- **Bildefiler** har ingen egen backup. Separat sikkerhetskopi av mediefiler (arkitektur 09) avhenger av oppbevaringstidene i OD-0002.
- **E-postvarsler** som var sendt etter backupen, kan sendes én gang til.

## Øvelsen

`packages/domain/src/restore/restore.integration.test.ts` kjører i CI-jobben `database`. Den tar en ekte backup (`pg_dump`) av en isolert database, gjør slettinger og begrensninger etter backupen, tar ut journalen, gjenoppretter backupen (`pg_restore`) til en ny isolert database og fullfører. Deretter sjekker den at ingenting slettet eller begrenset er tilbake, at Finn bare finner det som fortsatt er tilbudt, at sjekkene består, at tiden er innenfor RTO, og at en ny kjøring ikke gjør noe to ganger.

### Gjenstår når hostet miljø finnes

- Sett produksjon på minst Pro-planen og vurder Point-in-Time Recovery.
- Gjør øvelsen én gang mot hostet staging: gjenopprett en backup til et nytt prosjekt, kjør `finish` med en journal, og noter faktisk tid mot RTO.
