# Datalivssyklus, backup og gjenoppretting

> **Status:** Systemarkitektur v0.1. Eksakte retention-tider er OD-0002.

## Klassifisering

Data skal klassifiseres minst som:
- aktive kontodata
- delte domene-/avtaledata
- kontekstbegrenset miljødata
- privat E2EE-ciphertext
- saks-/modereringdata
- sikkerhets-/revisjonsdata
- avledet cache/søkeindeks
- backups

Hver klasse skal ha egen tilgang, retention og slettestrategi.

## Sletting

Kontosletting orkestreres som en kontrollert jobb:
1. valider at blokkerende bindinger er løst
2. stans ny aktivitet
3. fjern aktive relasjoner og profil
4. slett/pseudonymiser data etter type
5. behold kun legitim felles historikk med redusert identitet
6. fjern/oppdater avledede søke-/cachedata
7. skriv nødvendig slutt-/revisjonshendelse uten unødvendige persondata

## Objekt- og miljøsletting

Aktiv data kan slettes først når produktinvariants tillater det. Historiske lånesnapshots skal være selvstendige nok til å forstå tidligere avtale selv om objekt/miljø senere er borte.

## Backup

**Utviklingsfasen** ([ADR-0009](decisions/ADR-0009-backup-i-utviklingsfasen.md)): hostede miljøer ligger på Supabase Free uten administrert backup. Databasen bygges opp igjen fra de versjonerte migrasjonene, og avledede data fra domenetabellene. Manuelle, krypterte dumps kan tas ved viktige milepæler. Betalt backup er ingen forutsetning i denne fasen.

Pilotmål, som gjelder fra et eksternt brukerpanel (Port D):
- kryptert automatisk databasebackup minst daglig
- RPO ≤ 24 timer
- RTO ≤ 8 timer for kjernefunksjoner
- periodisk restore-test til isolert miljø
- separat sikkerhetskopi/versjonering av nødvendige mediefiler i samsvar med retention

Hvordan målene nås, og om betalt backup eller kontinuerlig/PITR-backup skal brukes, besluttes av produkteier før piloten (ADR-0009).

## Restore

Restore skal:
- aldri gjøres direkte over aktiv produksjon uten kontrollert prosedyre
- validere migrationsversjon og integritet
- re-applisere kjente slettings-/tombstone-hendelser som ligger etter snapshotet dersom nødvendig
- bygge søkeindeks/cache på nytt fra autoritative kilder
- verifisere at skjulte kontekster fortsatt er utilgjengelige før åpning

## Avledede data

Søkeindeks, cache, thumbnails og leverandørkopier må ha mekanisme for oppdatering/sletting når kildedata endres. Avledet system skal kunne rebuildes uten å bli nødvendig sannhetskilde.

## Retention

Konkrete tider fastsettes i OD-0002 før bred lansering. Sikkerhetslogger bør ha klart kortere standardlevetid enn avtale-/saksdata med legitimt historisk behov.
