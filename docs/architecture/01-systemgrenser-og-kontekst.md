# Systemgrenser og kontekst

> **Status:** Systemarkitektur v0.1.

## Systemkontekst

Lånbort består logisk av:

1. **Klient** — nettleserbasert brukergrensesnitt på mobil/desktop.
2. **Applikasjonsgrense/API** — autorisasjon, validering og orkestrering av domeneoperasjoner.
3. **Transaksjonell domenedatabase** — autoritativ sannhet for kjerneobjekter og strukturerte hendelser.
4. **Fil-/medielager** — objektbilder, saksvedlegg og krypterte private vedlegg.
5. **Privat meldingstjeneste** — lagrer E2EE-ciphertext og nødvendig leveringsmetadata, ikke klartekst.
6. **Bakgrunnsarbeid** — varsler, e-post, opprydding, tidsfrister og avledede indekser.
7. **Søk/geografi** — avledet oppdagelsesindeks for tillatte objekter/miljøer.
8. **Revisjons-/sikkerhetslogging** — formålsbegrensede hendelser med separat tilgang.
9. **Eksterne leverandører** — identitets-/e-postlevering, kart/geokoding og eventuelle pushkanaler.

## Tillitsgrenser

### Klient ↔ API
Klienten er ikke betrodd for autorisasjon, pris-/periodekollisjon, rolle eller tilstand. Alle identifikatorer og ønskede tilstandsoverganger må valideres.

### API ↔ database
Domenelaget gjør eksplisitte kontroller, mens databasen håndhever invariants som kan beskyttes strukturelt, særlig unikhet, referanseintegritet og kolliderende reservasjoner.

### API ↔ eksterne leverandører
Leverandører skal få minst mulig data. Leveringssystemer for e-post/push skal ikke få skjult sosial kontekst de ikke trenger.

### Privat chat
Krypteringsgrensen går mellom klientene. Serverkomponenter kan håndtere ciphertext, levering, samtale-ID og begrenset metadata, men ikke ordinær meldingsklartekst.

## Ikke i systemgrensen

- betaling mellom brukere
- avgjørelse av privatrettslig skyld/erstatning
- generell identitetsgaranti utover eksplisitt verifiseringsnivå
- forsikring/depositum i første produkt
