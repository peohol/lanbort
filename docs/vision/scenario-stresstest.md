# Scenario-basert stresstest av produktvisjonen

> **Status:** Levende arbeidsdokument. Scenario 2–26 er gjennomført og avklart per 29. september 2026. Listen over gjenstående scenarioer er en prioritert arbeidskø, ikke en påstand om at alle mulige fremtidige problemer allerede er kjent.

## Formål og metode

Stresstesten prøver den konsoliderte produktvisjonen mot realistiske brukerforløp og grensehendelser.

Arbeidsformen er sekvensiell:

1. velg et realistisk scenario
2. følg brukerforløpet til et reelt produktproblem, hull eller en selvmotsigelse oppstår
3. stopp der og avklar produktprinsippet
4. innarbeid beslutningen i de relevante tematiske visjonsdokumentene
5. fortsett deretter med neste scenario

Stresstesten skal holde seg på visjonsnivå. Tekniske mekanismer, konkrete frister, databasevalg og andre implementeringsdetaljer skal ikke trekkes inn bare for å lukke et scenario.

## Gjennomførte scenarioer

- **2. Retur meldt, men utlåner forsvinner:** lån kan etter tilstrekkelig avklaringsprosess avsluttes administrativt som uavklart uten å avgjøre hvem som hadde rett.
- **3. Medeier uten adgang til opprinnelsesmiljøet:** bare medeiere med nødvendig kontekstadgang kan se og behandle miljøbaserte forespørsler.
- **4. Administrator er part i konflikten:** inhabil administrator får ikke saksbehandlerinnsyn; finnes ingen habil administrator, tilbys ingen miljømekling og saken eskaleres ikke automatisk.
- **5. Blokkering etter et gjennomført lån:** allerede opptjente anmeldelsesrettigheter og ett tilsvar består.
- **6. Objektvilkår endres mens forespørselen venter:** vesentlige endringer setter forespørselen på vent til låntakeren bekrefter de nye vilkårene.
- **7. Medlemskap opphører før godkjenning:** en miljøbasert forespørsel kan ikke godkjennes når nødvendig miljøadgang er borte.
- **8. Medeiere blokkerer hverandre:** objektet fryses for nye utlån og kan først brukes igjen når medeierskapet er avklart til én registrert eier.
- **9. Åpen forespørsel når medeierblokkering oppstår:** ikke-godkjente forespørsler avsluttes nøytralt.
- **10. Ansvarlig utlåner vil tre ut som medeier:** vedkommende må først fullføre lånet eller overføre ansvaret.
- **11. Potensiell låntaker er blokkert av én medeier:** det medeide objektet kan ikke lånes ut til denne brukeren.
- **12. Objekt avpubliseres mens forespørsel venter:** eksplisitt avpublisering avslutter forespørsler som bygger på publiseringen; automatisk skjuling gjør ikke nødvendigvis det.
- **13. Manglende retur i direkte vennelån:** dette er et låneavvik, ikke automatisk en modereringssak.
- **14. Medlemskap opphører etter godkjent miljølån:** nødvendige lånerettigheter og mulig miljømekling følger det eksisterende lånet, uten å gjenopprette medlemskapet.
- **15. Objekt viser seg å være ulovlig eller farlig:** sikkerhets- og lovlighetsmoderering kan stanse videre fasilitering og ved behov et reservert lån før overlevering.
- **16. Konto deaktiveres under aktivt forhold:** deaktivering stopper ny aktivitet, men skal normalt bevare minimumstilgang for å avslutte eksisterende forpliktelser.
- **17. Siste adgangsberettigede medeier forlater miljøet:** objektet avpubliseres automatisk fra miljøet; eksisterende godkjente lån fortsetter.
- **18. Ny medeier legges til etter at lån er godkjent:** medeierskapet gjelder som hovedregel bare fremtidige lån; ansvarsoverføring til den nye medeieren krever låntakerens uttrykkelige samtykke.
- **19. Én part vil kansellere før overlevering:** begge parter kan ensidig kansellere før fysisk overlevering; etter overlevering brukes retur-/avviksforløpet.
- **20. Vennskap opphører etter godkjent direktelån:** vennskap må bestå frem til godkjenning, men det godkjente lånet fortsetter selv om vennskapet senere fjernes.
- **21. Eier vil slette objekt med eksisterende lån:** permanent sletting blokkeres av reserverte, aktive eller uavklarte lån som krever oppfølging; nødvendig historikk består.
- **22. Anmeldelse fra skjult miljø:** fritekst og anmelderidentitet holdes innenfor miljøkonteksten; aggregerte tillitsdata kan brukes bredere bare uten kontekstlekkasje.
- **23. Invitasjon til skjult miljø:** bare eksisterende Lånbort-brukere kan inviteres via intern, konto-bundet invitasjon; ingen delbar invitasjonslenke eller e-postinvitasjon gir adgang.
- **24. Administratoren som inviterte forsvinner:** ventende invitasjon tilhører miljøet, ikke personen som sendte den, og kan trekkes tilbake av autorisert administrasjon.
- **25. Anmelder sletter kontoen:** publisert anmeldelse kan bestå, men synlig forfatter anonymiseres; anmeldelser kan ikke leveres anonymt.
- **26. Forlengelse kolliderer med et allerede godkjent neste lån:** det første lånet kan ikke forlenges inn i den reserverte perioden. Den senere avtalen må først endres frivillig etter de vanlige samtykkereglene; Lånbort skal ikke fasilitere at en eksisterende avtale tilsidesettes.

## Gjenstående scenario-kø

Køen nedenfor er prioritert etter hvor sannsynlig det er at scenarioet kan avdekke en grunnleggende produktmotsetning. Nummereringen tildeles først når scenarioet faktisk tas opp til behandling.

### A. Låneforløp og kollisjoner

- Tidlig retur gjør objektet fysisk tilgjengelig før neste reservasjon; hva kan og bør åpnes for nye lån?
- Retur blir først bekreftet, et nytt lån godkjennes, og den første returbekreftelsen blir senere meldt som feil.
- Et administrativt avsluttet uavklart lån: hvilke anmeldelsesrettigheter skal partene ha?
- Et avsluttet lån gjenåpnes til usikker/uenighet etter at én eller begge anmeldelser allerede er sendt eller publisert.
- Utlåner og låntaker gir motstridende opplysninger om hvorvidt overlevering skjedde, samtidig som et nytt fremtidig lån nærmer seg.
- En part blokkerer den andre etter godkjenning, men før fysisk overlevering.
- Ansvarlig utlåner dør eller får kontoen fullstendig utilgjengelig under et lån der det ikke finnes noen medeier.

### B. Medeierskap

- En eksisterende medeier blir deaktivert eller får kontoen slettet mens et felles objekt har aktive lån.
- Medeiere er uenige om redigering, avpublisering eller framtidig tilgjengelighet uten at de har blokkert hverandre.
- En medeier publiserer objektet i et miljø som de andre medeierne ikke kjenner til; hvilke opplysninger om publiseringen må de andre kunne se?
- En medeier forlater objektet mens en annen medeier har åpne, men ikke godkjente forespørsler.
- Den eneste gjenværende medeieren kan ikke eller vil ikke overta et aktivt utlåneransvar.

### C. Miljømedlemskap og miljølivssyklus

- Miljøet går til avvikling mens det finnes ventende låneforespørsler.
- Miljøet går til avvikling mens anmeldelsesfristen eller en meklingssak fortsatt løper.
- Et miljø skifter mellom åpent, lukket og skjult: hva skjer med eksisterende medlemmer, publiserte objekter, invitasjoner og historisk synlighet?
- Medlemskrav endres etter at brukere allerede er medlemmer.
- En bruker utestenges fra miljøet mens vedkommende har reservert eller aktivt lån, åpen meklingssak eller ventende anmeldelse.
- Siste administrator forsvinner mens innmeldingsforespørsler, administratorkontakter eller saker venter.
- Eier av miljøet dør eller deaktiveres samtidig som det ikke finnes andre administratorer.
- En ventende innmeldingsforespørsel eksisterer når miljøets type eller medlemskrav endres.

### D. Objektpublisering og miljømoderering

- Samme objekt er publisert i flere miljøer, og ett miljø avviser eller fjerner det: skal dette bare gjelde lokalt?
- Ett miljø rapporterer et objekt som farlig eller ulovlig mens andre miljøer fortsatt viser det.
- Et miljø krever forhåndsgodkjenning etter at et objekt allerede er publisert der.
- Et miljø slår av forhåndsgodkjenning mens objekter fortsatt venter på vurdering.
- Miljøspesifikke spørsmål finnes når objektet avpubliseres, eieren forlater miljøet eller miljøet avvikles.
- En bruker abonnerer på et objekt og mister senere adgang til konteksten der objektet kunne sees.

### E. Tillit og anmeldelser

- En anmeldelse modereres bort etter at den allerede har påvirket aggregerte skårer.
- Den anmeldte sletter kontoen mens anmeldelser om vedkommende fortsatt finnes i andre brukeres historikk.
- Forfatteren av et tilsvar sletter kontoen.
- En anmeldelse inneholder personopplysninger om en tredjepart eller informasjon fra en annen privat kontekst.
- En låntaker eller utlåner får flere begrensede vurderinger etter gjentatte kanselleringer/no-shows: hvordan unngår vi at dette blir en omvei til en generell straffeskår?
- Profiltilgang forsvinner etter at en bruker tidligere kunne se en anmeldelse: skal den fortsatt være tilgjengelig?
- To brukere blir medlemmer av ulike miljøer senere; historiske anmeldelser må ikke få ny synlighet på en måte som lekker gammel kontekst.

### F. Blokkering, rapportering og moderering

- Plattformforvalter er selv part i et lån eller gjenstand for rapport: hvem kan behandle saken?
- En miljøadministrator blir rapportert av et medlem samtidig som administratoren håndterer en sak for samme medlem.
- En blokkering oppstår under en aktiv meklings- eller modereringssak.
- En bruker rapporterer en annen og blokkerer vedkommende mens et lån fortsatt er reservert, men ikke overlevert.
- Plattformen suspenderer en bruker som har kommende reservasjoner både som låntaker og utlåner.
- Moderering oppheves etter at et reservert lån allerede ble administrativt stanset.

### G. Konto- og datalivssyklus

- Låntaker dør under et aktivt lån.
- Utlåner dør under et aktivt lån.
- Bruker ber om permanent sletting mens vedkommende har ventende anmeldelser eller invitasjoner, men ingen aktive lån.
- Bruker har private chatter og delt historikk med andre når kontoen slettes; hvilken synlig identitet skal stå igjen hos motparten?
- Konto deaktiveres eller slettes mens brukeren eier et skjult miljø eller er eneste administrator.
- Falsk identitet oppdages etter mange gjennomførte lån og anmeldelser: hva skjer med historisk tillitsinformasjon?
- Duplikatkonto avvikles når begge kontoene har sosial og lånerelatert historikk.

### H. Privat kommunikasjon og saker

- En part vil bruke en ende-til-ende-kryptert melding som dokumentasjon i en sak: hvordan skal dette forstås produktmessig uten at privat chat åpnes automatisk?
- Avsender sletter eller mister konto etter å ha sendt dokumentasjon inn i en administrativ sak.
- En administrativ samtale står uten saksbehandler når miljøet mister alle administratorer.
- En sak avsluttes, men én part mener den inneholder faktiske feil som bør korrigeres uten at historikken omskrives.
- Blokkering stenger fri chat midt i et lån: er de strukturerte handlingene alene tilstrekkelige i alle nødvendige praktiske situasjoner?

### I. Opprinnelseskontekst og personvern

- To venner finner hverandre gjennom et miljø: når er et nytt lån et miljølån, og når er det et direkte vennelån?
- Partene blir venner etter at en miljøbasert forespørsel er sendt: opprinnelseskonteksten må ikke endres opportunistisk.
- Et miljø skifter til skjult etter at lån og anmeldelser allerede er opprettet der.
- Et skjult miljø slettes eller avvikles: hvor mye av miljøkonteksten skal kunne vises i historiske lån for tidligere medlemmer?
- Et objekt som er publisert både i et skjult og et åpent miljø må ikke lekke skjult sosial kontekst gjennom spørsmål, historikk, anmeldelser eller varsler.

## Når køen er ferdig

Stresstesten kan anses som tilstrekkelig gjennomført når:

- alle scenariofamiliene over er prøvd eller eksplisitt vurdert som rene spesifikasjonsdetaljer
- nye scenarioer over flere gjennomganger ikke lenger avdekker vesentlige motsetninger i produktmodellen
- de tematiske visjonsdokumentene gir konsistente svar på de viktigste livssyklus-, tilgangs-, personvern- og konfliktforløpene

Dette er et modenhetskriterium for visjonen, ikke en garanti for at alle mulige edge cases er oppdaget.
