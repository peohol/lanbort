# ADR-0009 — Backup i utviklingsfasen: Supabase Free, gjenoppbygging og manuelle dumps

**Status:** Vedtatt (produkteier, 4. oktober 2026)
**Forankring:** PS-NFR-014, ADR-0007, [datalivssyklus, backup og gjenoppretting](../09-datalivssyklus-backup-og-gjenoppretting.md)

## Beslutning

Lånbort blir på **Supabase Free** i utviklingsfasen.

- Supabase Pro, Point-in-Time Recovery og andre betalte backupfunksjoner kjøpes ikke og er ingen forutsetning for noen leveranse, arbeidspakke eller kvalitetsport i denne fasen.
- Det aksepteres at hostede miljøer ikke har administrert daglig backup. Data i et hostet miljø kan gå tapt tilbake til siste manuelle dump, eller helt.
- Databasen skal alltid kunne bygges opp igjen fra repoet: migrasjonene i `supabase/migrations/` er den autoritative skjemahistorikken (ADR-0007), og søkeindeksen og annen avledet tilstand bygges fra domenetabellene.
- Ved viktige milepæler kan det tas en manuell logisk dump med Supabase CLI (`supabase db dump`), som virker på gratisplanen og er det Supabase selv anbefaler for den. Fremgangsmåten står i [backup og gjenoppretting](../../implementation/backup-restore.md).
- Gjenopprettingen fra en dump følger samme kontrollerte etterarbeid som før (`pnpm ops:restore`), slik at slettet eller begrenset data ikke blir synlig igjen (PS-NFR-014).

## Revurdering før eksternt brukerpanel

Backupnivået vurderes på nytt og besluttes eksplisitt av produkteier før appen åpnes for et eksternt brukerpanel (Port D). Da vurderes minst:

1. Supabase Pro med daglig backup (7 dager), eventuelt med Point-in-Time Recovery
2. planlagte, krypterte dumps på gratisplanen tatt av en egen jobb
3. å godta lengre RPO for en liten pilot

Til den beslutningen er tatt, gjelder pilotmålene for RPO/RTO i arkitektur 09 som mål for piloten, ikke for utviklingsfasen.

## Begrunnelse

I utviklingsfasen finnes ingen reelle brukere, og alt som trengs for å gjenskape tjenesten ligger versjonert i repoet. En fast månedskostnad for backup gir derfor lite nå. Gjenopprettingslogikken (journal, etterarbeid og sjekker) er uavhengig av hvor backupen kommer fra og er øvd i CI med ekte `pg_dump`/`pg_restore`, så den er klar når backupnivået for piloten velges.

## Konsekvenser

- En hostet database på gratisplanen behandles som gjenoppbyggbar, ikke som eneste kopi av noe som må bevares.
- En manuell dump inneholder personopplysninger og slettede data frem til den slettes. Den krypteres, lagres utenfor repoet og utenfor Supabase-prosjektet, og eldre dumps slettes når en ny er tatt.
- Hvis produktet senere skal finansieres med sponsing eller betaling, kan driftskostnaden for betalt backup vurderes på nytt i den sammenhengen.
