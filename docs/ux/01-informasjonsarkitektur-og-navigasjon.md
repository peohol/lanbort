# Informasjonsarkitektur og navigasjon

> **Status:** UX-modell v0.1.

## Overordnet modell

Lånbort skal ha få stabile globale områder. Objekt-, miljø-, låne- og saksrelaterte handlinger skal først og fremst finnes i sin egen kontekst.

### UX-IA-001 — Fem globale hovedområder
**Forankring:** UX-P02, UX-P05, UX-P20; PS-DOM-003, PS-DOM-004

På mobil brukes fem hovedinnganger:

1. **Hjem** — personlig status- og handlingsflate.
2. **Finn** — målrettet søk og oppdagelse av objekter og oppdagbare miljøer, med filteret «Venner» for objekter venner har gjort synlige for venner (PS-OBJ-020).
3. **Lån** — brukerens egne låneforløp, både som låntaker og utlåner.
4. **Mine ting** — egne og medeide objekter.
5. **Samtaler** — private samtaler og aktive lånelogistikk-kanaler.

Desktop bruker de samme områdene i en romsligere navigasjonsform. Det skal ikke finnes en annen desktop-logikk.

### UX-IA-002 — Varsler er et eget oppmerksomhetslag
**Forankring:** UX-P08; PS-COM-001, PS-COM-003

Varslingssenter åpnes fra en stabil varselindikator og er ikke et sjette innholdsområde. Varsler leder til den relevante konteksten fremfor å duplisere hele funksjonen.

### UX-IA-003 — Profil og innstillinger er konto-kontekst
**Forankring:** UX-P05

Profil, personvernvalg, konto, blokkeringer og varslingspreferanser åpnes fra brukeridentiteten/avataren og skal ikke oppta en permanent hovednavigasjonsplass.

### UX-IA-004 — Miljøer er kontekster, ikke et parallelt produkt
**Forankring:** UX-P02; VP-04; PS-ENV-001

Brukeren kan finne miljøer via **Finn**, åpne egne miljøer via **Hjem** eller søk og gå inn i en miljøside. Inne i miljøet finnes objekter, medlemmer, regler og relevante administrasjonshandlinger uten at miljøet får egne varianter av kjernefunksjoner som lån eller profil.

### UX-IA-005 — Hjem prioriterer det som krever handling
**Forankring:** UX-P04, UX-P08, UX-P16

Hjem skal først vise:
- handlinger som venter på brukeren
- kommende overlevering/retur
- uavklarte eller avvikende forløp
- relevante administrative oppgaver for roller brukeren faktisk har

Sekundært kan Hjem vise snarveier til egne miljøer, nylige objekter eller annet relevant. Hjem skal ikke bli en feed for passiv scrolling.

### UX-IA-006 — Lån bruker én felles flate
**Forankring:** UX-P02; PS-LOAN-001

Lån skal kunne filtreres etter «låner» og «låner bort», men visningsmodell, status og handlinger skal ellers være konsistente. Miljø- eller vennelånsopprinnelse vises som kontekst, ikke som separate lånesystemer.

### UX-IA-007 — Saker finnes i relevant kontekst og i rollebaserte arbeidskøer
**Forankring:** UX-P05; PS-COM-010, PS-COM-011

En vanlig bruker åpner en sak fra hendelsen, miljøet eller lånet den gjelder. Administratorer/plattformforvaltere får i tillegg en arbeidskø når rollen faktisk gir dem behandlingsansvar. Saksflaten skal ikke blandes sammen med privat chat.

### UX-IA-008 — Historikk er sekundær
**Forankring:** UX-P06, UX-P16

Gjeldende status, avtale og neste handling vises først. Historiske hendelser ligger i en egen tidslinje/detaljvisning og åpnes ved behov.

## Sentrale sider

- Hjem
- Finn: objekter / miljøer, med filteret «Venner»
- Objekt
- Mine ting
- Opprett/rediger objekt
- Miljø
- Lån / lånedetalj
- Samtaler / privat samtale
- Varslingssenter
- Profil / bruker
- Konto og innstillinger
- Sak
- Rollebasert administrasjonskø

Det skal ikke opprettes egne permanente sider for sjeldne unntak dersom en kontekstuell handling eller dialog er tilstrekkelig.
