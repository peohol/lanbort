# Oppbevaring og sletting i piloten

> **Status:** Pilotpolicy for OD-0002, gjeldende fra 10. oktober 2026. Endelige regler besluttes før bred lansering (Port E), etter juridisk gjennomgang (OD-0007). Forankret i PS-ADM-005–006, PS-ADM-011–012, PS-NFR-009, PS-NFR-013–014 og [datalivssyklus](../architecture/09-datalivssyklus-backup-og-gjenoppretting.md).

## Prinsipper

- **Formålsstyrt og kort.** Hver datatype har en grunn til å finnes og en tid den holdes; ingenting logges «for sikkerhets skyld» (PS-ADM-011).
- **Brukerens egne opplysninger går med kontoen.** Sletter noen kontoen sin, slettes profil, e-post, bilder, enheter og varsler med en gang (PS-ADM-006).
- **Felles historikk består med bare intern ID.** Lån, avtaler og saker som andre er part i, forklarer deres rettigheter og står derfor gjennom piloten, uten navn eller kontaktopplysninger for den som har slettet seg (PS-NFR-009).
- **Backup følger etter.** Det som slettes, er borte fra alle backuper innen 7 dager, og kommer ikke tilbake ved en gjenoppretting ([backup og gjenoppretting](backup-restore.md)).

## Regler

| Data | Hvor lenge | Slik slettes det |
| --- | --- | --- |
| Konto, profil, e-postadresse, profilbilde, varslingsvalg, chatenheter og -nøkler | Så lenge kontoen finnes | Med en gang kontoen slettes (`accountDeletionSteps`); innloggingsidentiteten kort etter (outbox) |
| Ting og bilder av dem | Til eieren sletter tingen eller kontoen | Tingslettingen og kontoslettingen; bildefilen kort etter (outbox) |
| Svar på et miljøs krav for å bli med | Til 90 dager etter at medlemskapet er avsluttet | Slettejobben |
| Lån, avtaler, overlevering, retur, skader og anmeldelser | Gjennom piloten | Står med bare intern ID når en part sletter kontoen |
| Saker, moderering og chatmeldinger som en part har lagt fram i en sak | Gjennom piloten | Bare de som behandler saken, ser dem |
| Funn om dobbeltkontoer og falsk identitet (WP-55) | Gjennom piloten, også etter kontosletting | Bare plattformforvaltere som ikke selv er part, ser dem |
| Blokkeringer | Gjennom piloten, også etter kontosletting (PS-USR-006) | — |
| Hendelsesloggen (`audit_events`): bare ID-er, koder og tidspunkter | Gjennom piloten | Trengs for historikken og for å gjenopprette uten at slettet data kommer tilbake |
| Privat chat på serveren (chiffertekst, nøkkelpakker, koblingsforespørsler, historikkarkiver) | Til alle enheter har hentet meldingen, senest 30 dager; resten etter [ADR-0010](../architecture/decisions/ADR-0010-e2ee-protokoll-enheter-og-recovery.md) §8 | `/api/internal/chat-retention` (hver time) |
| Varsler i appen, lest eller ulest | 180 dager. Varsler om et lån som fortsatt er reservert eller aktivt, står til lånet er over | Slettejobben |
| E-postleveranser (status, aldri adresse eller innhold) | 30 dager etter at de er sendt eller droppet | Slettejobben |
| Utførte outbox-meldinger | 30 dager. Feilede står til de er håndtert | Slettejobben |
| Lagrede svar på kommandoer (gjentar svaret ved et nytt forsøk) | 30 dager | Slettejobben |
| Fartsgrensetellere (bare nøkkelhasher) | Til de utløper | Hver bruk og slettejobben |
| Backuper | 7 dager | Supabase og den egne backupen sletter eldre selv |

Slettejobben er `/api/internal/retention` (`data.purge_expired`), som kjører hver natt. Tidene står ett sted i koden: `pilotRetention` i `packages/domain/src/retention/model.ts`.

## Logger hos leverandørene

Appens egne logger har bare hendelsesnavn, rute, status, varighet og feilkode, aldri navn, e-post, IP-adresse eller fritekst ([observability](../../packages/observability/src/index.ts)). Rutene kan inneholde interne ID-er. Leverandørene har egne logger med IP-adresser og, for e-post, mottakeradresser:

| Leverandør | Hva | Hvor lenge |
| --- | --- | --- |
| Vercel (Pro) | Forespørsler med IP-adresse og nettleser | 1 dag |
| Supabase (Pro) | API-, database- og innloggingslogger | 7 dager |
| Resend | Sendte e-poster med mottakeradresse | 30 dager |

Tidene er leverandørenes egne (dokumentasjonen deres, lest 10. oktober 2026), og Lånbort betaler ikke for lengre lagring. Ved en alvorlig hendelse må det som trengs, tas ut innen disse fristene ([alvorlige hendelser](pilot-operations.md#alvorlige-hendelser)).

## Ved pilotens slutt

Når piloten avsluttes, avgjør produkteier om dataene går videre til en bredere lansering eller slettes. Deltakerne får vite det før det skjer, og de endelige reglene for Port E gjelder fra da.

## Kjente begrensninger

- Fritekst i felles historikk (meldingen i en låneforespørsel, skaderapporter, saksinnlegg, anmeldelser, kopier av fjernede anmeldelser) står gjennom piloten. Databasen hindrer at den endres eller slettes, så en kortere frist krever en egen, revisjonslogget slettevei. Det avgjøres med de endelige reglene.
- Hendelsesloggen og slettede kontoers interne ID består gjennom piloten.
