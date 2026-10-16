# Medlemskap og låneabonnement

> **Status:** Vedtatt målmodell for ordinær drift etter pilot (16. oktober 2026). Ikke aktivert. «Låneabonnement» er forskjellig fra objektabonnementet for varsler (PS-OBJ-014).

### PS-PAY-001 — Gratis medlemskap og utlån
**Forankring:** [Finansieringsmodellen](../vision/01-formal-prinsipper-og-produktgrenser.md); VP-01

Det er gratis å registrere seg via Vipps, være medlem av miljøer, finne ting, registrere egne ting, låne dem bort og håndtere egne utlån, venner og legitim kommunikasjon. Gratisbrukere får ingen dårligere rangering eller prioritet.

### PS-PAY-002 — Fast låneabonnement
**Forankring:** [Finansieringsmodellen](../vision/01-formal-prinsipper-og-produktgrenser.md)

Ordinær pris for å be om å låne er **30 kr per måned**, vist som total forbrukerpris inkludert eventuell merverdiavgift. Abonnementet gir adgang til nye låneforespørsler innenfor vanlige regler. Ingen transaksjonsavgift per lån eller betaling til utlåner.

### PS-PAY-003 — Serveren håndhever låneretten
**Forankring:** VP-06; PS-PAY-002

Når betaling er innført, må låntaker ha gyldig lånerett når en ny låneforespørsel sendes. Kravet håndheves på backend for alle innganger, ikke bare ved å skjule knapper. Man kan utforske tilbudet og tilby egne ting gratis. Ved første forespørsel uten lånerett tilbys abonnement.

### PS-PAY-004 — Eksisterende forpliktelser består
**Forankring:** VP-05, VP-10

Abonnementet kan sies opp. Etter betalt periode opphører bare retten til **nye** låneforespørsler. Ventende forespørsler kan behandles, og etablerte lån, retur, nødvendig kontakt, saker, historikk og anmeldelsesrettigheter består uten nytt abonnement. Manglende betaling kan ikke tvinge frem brudd på en fysisk låneavtale.

### PS-PAY-005 — Ingen betaling i pilot; uttrykkelig kjøpsvalg senere
**Forankring:** [Pilotretning](../vision/01-formal-prinsipper-og-produktgrenser.md); PS-NFR-015

Alle godkjente pilotbrukere låner og låner bort gratis. Ingen automatisk omgjøring til betalt abonnement. Før første belastning i ordinær drift må brukeren se prisen, fornyelsesvilkårene og aktivt godta kjøpet. Medlemskap uten abonnement forblir gratis.

### PS-PAY-006 — Eventuell sosial rabatt senere
**Forankring:** [Finansieringsmodellen](../vision/01-formal-prinsipper-og-produktgrenser.md)

Muligheten for redusert pris ved svak økonomi vurderes senere. Ingen inntektskontroll, søknadsordning eller nye personopplysninger innføres foreløpig. Rabatt endrer aldri brukerens identitetsstatus eller tillitsprofil.

## Før aktivering

Betalingsleverandør, abonnementsvilkår, fornyelse, kansellering, feil, refusjon, angrerett, MVA og håndtering av forsinkede betalingshendelser utredes under [OD-0058](../open-decisions.md#od-0058--praktisk-abonnementshandtering-ved-ordinær-drift). Se [overgangsplan](../implementation/vipps-identitet-og-abonnement.md).
