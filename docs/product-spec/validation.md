# Konsistenssjekk mot produktvisjon v1.0

> **Status:** Gjennomført for produktspesifikasjonen 1. oktober 2026.

## Omfang

Produktspesifikasjonen er kontrollert mot:
- de 18 styrende produktprinsippene
- de tematiske visjonsdokumentene
- scenario-stresstesten 2–81
- visjonens eksplisitt utsatte detaljvalg

## Resultat

Det er ikke identifisert en motsetning som krever gjenåpning av produktvisjonen.

Konsistensrunden førte til at følgende ble gjort eksplisitt i spesifikasjonen:
- begge parters ensidige kanselleringsrett før fysisk overlevering
- tidlig bekreftet retur og frigjøring av ubrukt reservasjonsperiode
- modererte anmeldelser tas ut av synlige aggregater
- problematisk anmeldelsesfritekst kan modereres uten automatisk å ugyldiggjøre øvrig vurdering
- krav om uavhengig behandlingsvei for alvorlige saker om plattformforvaltningen før vesentlig skala

## Bevisst utsatte valg

Uavklarte detaljer som ikke endrer grunnmodellen er registrert i [åpne detaljbeslutninger](../open-decisions.md). De skal ikke tolkes som hull som kan fylles vilkårlig i implementasjonen.

## Flytklassifisering

Produktkravene skal leses i tre lag:
- **Normalforløp:** opprettelse/oppdagelse → forespørsel → godkjenning → overlevering → retur → anmeldelse.
- **Unntaksforløp:** blokkering, manglende overlevering/retur, uenighet, medeierkonflikt, bortfall av adgang, død/utilgjengelighet og lignende.
- **Administrative forløp:** medlemsbehandling, miljøforvaltning, moderering, saker, suspensjon, kontrollert avvikling og kontolivssyklus.

Unntaks- og administrasjonsregler skal ikke gjøre normalforløpet mer komplekst enn nødvendig.
