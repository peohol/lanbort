# Eksterne integrasjoner

> **Status:** Systemarkitektur v0.1. Leverandører er bevisst ikke låst.

## E-post

Behov:
- verifisering av kontaktkanal
- konto-/sikkerhetsvarsler
- tidskritiske lånevarsler etter preferanse/policy

Integrasjonen skal gå gjennom ett internt adapter slik at leverandør kan byttes. E-postmaler skal ikke røpe skjult miljøkontekst unødvendig.

## Kart og geokoding

Behov:
- søk etter åpne/lukkede miljøer geografisk
- representasjon av omtrentlig område
- eventuelt adresse→område/geokoding der brukeren eksplisitt trenger det

Kartleverandør skal ikke automatisk motta privat medlemsverifikasjonsadresse eller andre data utover søke-/kartformålet.

## Push

Web push og senere native push skal bruke intern varslingsmodell som kilde. Provider payload bør være minimal; appen henter autorisert detalj etter åpning.

## Objekt-/filstorage

Lagring må støtte private objekter og tidsbegrenset autorisert tilgang. E2EE-vedlegg lagres som ciphertext og skal ikke bruke samme «server kan lese»-antakelse som ordinære objektbilder.

## Overvåking/feilrapportering

Tredjeparts observability skal konfigureres med dataminimering:
- ingen private chatklartekster
- ingen auth-secrets
- unngå skjulte miljønavn/medlemsdata i feillogger
- scrub av request bodies og identifikatorer etter behov

## Ikke i første fase

- BankID
- betaling
- forsikring/depositum
- sosial feed-/annonseringsintegrasjoner

## Leverandørvalg

Konkret hosting, auth-, e-post-, kart-, push- og storageleverandør kan velges når implementeringsplanen starter. Interne grensesnitt skal holde domenekoden minst mulig bundet til leverandørspesifikke API-er.
