# Kontekst, roller og personvern

> **Status:** UX-modell v0.1.

### UX-PRIV-001 — Synlighet uttrykkes som personer/kontekster, ikke tilgangsjargong
**Forankring:** UX-P11; PS-USR-002

Der synlighet kan velges skal UI bruke forståelige målgrupper som «Alle innloggede brukere», «Venner», «Medlemmer i …» eller «Bare meg» fremfor tekniske rettighetsnavn.

### UX-PRIV-002 — Skjult miljø skal aldri bekreftes til uvedkommende
**Forankring:** VP-08; PS-NFR-002

Søk, feiltilstander, delte interne lenker og tilgangsfeil skal ikke gi uvedkommende meningsfull informasjon om at et skjult miljø finnes.

### UX-PRIV-003 — Kontekstmerke vises når informasjonens betydning avhenger av kontekst
**Forankring:** UX-P11; PS-DOM-005, PS-DOM-007

Miljøspesifikke spørsmål, anmeldelser, administratorhandlinger og miljøbaserte lån skal vise relevant kontekst for brukere som har adgang, slik at det er forståelig hvorfor informasjonen er synlig og hvor den hører hjemme.

### UX-PRIV-004 — Skjult kontekst redigeres bort for brukere uten adgang
**Forankring:** VP-08, VP-09

Når et globalt objekt er opptatt på grunn av aktivitet i en skjult kontekst, kan andre få vite at objektet ikke er ledig, men ikke hvilket miljø, hvilke personer eller hvilken aktivitet som forårsaket sperren.

### UX-PRIV-005 — Rollebytte skal ikke se ut som identitetsbytte
**Forankring:** UX-P02; PS-DOM-001

En administrator som behandler en sak og den samme personen som låner et objekt er fortsatt samme bruker. UI skal gjøre den aktuelle rollen tydelig i administrative handlinger, uten å lage separate «administratorprofiler».

### UX-PRIV-006 — Administrative privilegier vises bare der de gjelder
**Forankring:** UX-P05; PS-USR-008, PS-USR-009

Administratorhandlinger ligger på det aktuelle miljøet/saken. Plattformforvalterhandlinger ligger i relevant plattformkontekst. En bruker som er inhabil skal ikke se en aktiv behandle-/avgjør-handling bare fordi rollen ellers finnes.

### UX-PRIV-007 — Historisk tilgang er snever og uten sosial gjenåpning
**Forankring:** VP-09, VP-10

Når tidligere medlemskap/vennskap ikke lenger finnes, kan nødvendig låne- eller sakshistorikk fortsatt vises direkte i den historiske relasjonen. UI skal ikke samtidig gi snarveier til nå utilgjengelig profil, miljøinnhold eller sosial aktivitet.

### UX-PRIV-008 — Mindre privat miljøtype krever tydelig personlig valg
**Forankring:** PS-ENV-008

Ved lukket→åpent skal hvert medlem se hva økt oppdagbarhet betyr og kunne akseptere, forlate eller ikke svare. Ved skjult→lukket skal avstemningen forklare både miljøets beslutning og at ikke-støttende/ikke-svarende medlemmer blir passive dersom endringen vedtas.

### UX-PRIV-009 — Medlemsverifiseringsdata holdes adskilt fra sosial profil
**Forankring:** PS-NFR-008

Adresse, leilighetsnummer, medlemsnummer eller annen dokumentasjon som samles inn for miljøtilgang skal presenteres som informasjon gitt til miljøets medlemsprosess, ikke som profilopplysninger.

### UX-PRIV-010 — Slettet bruker vises som historisk identitet
**Forankring:** PS-USR-010, PS-ADM-006

Når identitet ikke lenger trengs skal historiske flater bruke nøytral betegnelse som «Tidligere bruker» og ikke aktiv profil-lenke. Der konkret identitet fortsatt må bevares av legitim grunn, skal dette ikke gi en aktiv sosial profil.

### UX-PRIV-011 — Representant har egen avgrenset flate
**Forankring:** PS-ADM-008

En representant ved død/varig utilgjengelighet skal aldri «logge inn som» brukeren. UI viser eksplisitt hvilket konkret lån/forhold representanten håndterer og hvilke handlinger som er tilgjengelige.
