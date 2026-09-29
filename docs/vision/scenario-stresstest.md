# Scenario-basert stresstest av produktvisjonen

> **Status:** Levende arbeidsdokument. Scenario 2–57 er gjennomført og avklart per 29. september 2026. Listen over gjenstående scenarioer er en prioritert arbeidskø, ikke en påstand om at alle mulige fremtidige problemer allerede er kjent.

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

- **27. Tidlig retur frigjør resten av perioden:** når ansvarlig utlåner bekrefter tidlig retur, avsluttes lånet på faktisk returtidspunkt og resten av den gamle reservasjonen frigjøres hvis ingen andre reservasjoner kolliderer.
- **28. Blokkering etter godkjenning, før overlevering:** blokkering kansellerer ikke lånet automatisk; nødvendige strukturerte handlinger består, og begge kan fortsatt kansellere ensidig før overlevering.
- **29. Medeier deaktiveres mens felles objekt har aktive lån:** de andre medeiernes rettigheter består; ansvarlig utlåner må fullføre eller overføre eksisterende ansvar før sletting eller uttreden.
- **30. Medeier publiserer i et miljø andre medeiere ikke har adgang til:** de andre får bare nødvendig forvaltningsinformasjon, uten at miljøets identitet eller beskyttede kontekst røpes.
- **31. Medeier forlater objektet med åpne forespørsler:** forespørsler kan fortsette hvis en gjenværende medeier har nødvendig kontekstadgang; ellers avsluttes de etter reglene om siste adgangsberettigede eier.
- **32. Miljø går til avvikling med ventende låneforespørsler:** ikke-godkjente forespørsler avsluttes nøytralt; godkjente lån fortsetter.
- **33. Miljø går til avvikling under anmeldelsesfrist eller mekling:** opptjente anmeldelsesrettigheter består; mekling kan fortsette så lenge habil administrasjon finnes, ellers avsluttes den kontrollert uten automatisk eskalering.
- **34. Bruker utestenges etter at et lån er godkjent:** eksisterende lån, nødvendige lånehandlinger, anmeldelsesrettigheter og eventuell lånetilknyttet mekling består uten at medlemskapet gjenopprettes.
- **35. Miljø mister alle administratorer mens prosesser venter:** prosesser som krever administrator avgjøres ikke av uvedkommende; de settes på vent og kan gjenopptas ved gyldig ny administrasjon eller avsluttes kontrollert ved avvikling.
- **36. Eier og eneste administrator forsvinner:** ny aktivitet som krever miljøadministrasjon stanses; uten gyldig kontinuitetsvei går miljøet mot kontrollert avvikling.
- **37. Ett miljø avviser eller fjerner et objekt som også er publisert andre steder:** avgjørelsen er miljølokal med mindre problemet gjelder et mulig globalt sikkerhets- eller lovlighetsforhold.
- **38. Ett miljø rapporterer et objekt som farlig eller ulovlig:** miljøet kan beskytte sin egen flate straks; plattformnivå vurderer om forholdet skal få global virkning på alle publiseringer og nye lån.
- **39. Abonnent mister adgang til objektets kontekst:** abonnementet skal ikke bevare innsyn; varsling stopper eller abonnementet deaktiveres.
- **40. Anmeldelse modereres bort etter å ha påvirket skår:** synlige aggregater oppdateres slik at vurderingen ikke fortsetter å telle; nødvendig modereringshistorikk kan beholdes internt.
- **41. Forfatter av tilsvar sletter kontoen:** tilsvaret kan bestå som historisk kontekst, men synlig identitet anonymiseres på samme måte som for en slettet anmelder.
- **42. Anmeldelse inneholder tredjepartsopplysninger eller privat kontekst:** problematisk fritekst kan fjernes eller redigeres gjennom sporbar moderering; skåren kan bestå dersom selve vurderingen fortsatt er gyldig.
- **43. Profiltilgang forsvinner etter at en anmeldelse tidligere var synlig:** fritekstanmeldelsen følger nåværende adgang og blir ikke værende synlig bare fordi brukeren kunne lese den tidligere.
- **44. Nye relasjoner oppstår senere:** nye vennskap eller medlemskap skal ikke retroaktivt åpne historiske anmeldelser som fortsatt er kontekstbegrenset.
- **45. Administrator blir rapportert av medlemmet i en sammenvevd sak:** administratoren er inhabil og må tre ut av behandlingen; annen habil administrator må eventuelt overta.
- **46. Blokkering oppstår under aktiv mekling eller moderering:** saken fortsetter etter saksrollene, mens vanlig direktekontakt fortsatt er blokkert.
- **47. Bruker rapporterer og blokkerer motpart før overlevering:** rapport, blokkering og lån behandles separat; reservasjonen består til en part kansellerer eller et konkret modereringstiltak griper inn.
- **48. Moderering som stanset et reservert lån oppheves senere:** den gamle reservasjonen gjenoppstår ikke automatisk; nytt lån krever ny avtale.
- **49. Ende-til-ende-kryptert melding brukes som dokumentasjon:** parten må uttrykkelig sende inn en kopi eller representasjon; den innsendte kopien blir saksdata uten at resten av chatten åpnes.
- **50. Innsender av saksdokumentasjon sletter kontoen:** allerede innsendt materiale følger sakens legitime oppbevaringsbehov og forsvinner ikke automatisk; identitet reduseres når mulig.
- **51. Faktisk feil i en sak må korrigeres:** korrigeringen legges til som en ny sporbar hendelse; tidligere registrering omskrives ikke stille.
- **52. Venner initierer lån gjennom et miljø:** opprinnelsen bestemmes av hvordan forespørselen faktisk ble opprettet; miljøbasert forespørsel forblir miljøbasert selv om partene også er venner.
- **53. Partene blir venner etter at miljøforespørselen er sendt:** dette endrer ikke opprinnelseskonteksten eller gjør lånet om til et direkte vennelån.
- **54. Miljø blir skjult etter at lån og anmeldelser finnes:** eksisterende lån fortsetter, mens miljøspesifikk synlighet fra endringstidspunktet følger de strengere reglene for skjulte miljøer.
- **55. Skjult miljø avvikles:** nødvendig historisk kontekst kan bestå for direkte parter og andre med legitim historisk forbindelse, men miljøet skal ikke bli synlig for utenforstående.
- **56. Samme objekt finnes i skjult og åpen kontekst:** bare global objektinformasjon deles; spørsmål, anmeldelser, varsler og sosial metadata holdes strengt kontekstadskilt.
- **57. Administrativ samtale står uten saksbehandler fordi miljøet mangler administratorer:** samtalen blir liggende utilordnet med tydelig beskjed til brukeren og kan gjenopptas hvis gyldig administrasjon etableres; den eskaleres ikke automatisk til plattformforvalter.


## Gjenstående scenario-kø

Køen nedenfor er prioritert etter hvor sannsynlig det er at scenarioet kan avdekke en grunnleggende produktmotsetning. Nummereringen tildeles først når scenarioet faktisk tas opp til behandling.

### A. Låneforløp og kollisjoner

- Retur blir først bekreftet, et nytt lån godkjennes, og den første returbekreftelsen blir senere meldt som feil.
- Et administrativt avsluttet uavklart lån: hvilke anmeldelsesrettigheter skal partene ha?
- Et avsluttet lån gjenåpnes til usikker/uenighet etter at én eller begge anmeldelser allerede er sendt eller publisert.
- Utlåner og låntaker gir motstridende opplysninger om hvorvidt overlevering skjedde, samtidig som et nytt fremtidig lån nærmer seg.
- Ansvarlig utlåner dør eller får kontoen fullstendig utilgjengelig under et lån der det ikke finnes noen medeier.

### B. Medeierskap

- Medeiere er uenige om redigering, avpublisering eller framtidig tilgjengelighet uten at de har blokkert hverandre.
- Den eneste gjenværende medeieren kan ikke eller vil ikke overta et aktivt utlåneransvar.

### C. Miljømedlemskap og miljølivssyklus

- Et miljø skifter mellom åpent, lukket og skjult: hva skjer med eksisterende medlemmer, publiserte objekter, invitasjoner og historisk synlighet?
- Medlemskrav endres etter at brukere allerede er medlemmer.
- En ventende innmeldingsforespørsel eksisterer når miljøets type eller medlemskrav endres.

### D. Objektpublisering og miljømoderering

- Et miljø krever forhåndsgodkjenning etter at et objekt allerede er publisert der.
- Et miljø slår av forhåndsgodkjenning mens objekter fortsatt venter på vurdering.
- Miljøspesifikke spørsmål finnes når objektet avpubliseres, eieren forlater miljøet eller miljøet avvikles.

### E. Tillit og anmeldelser

- Den anmeldte sletter kontoen mens anmeldelser om vedkommende fortsatt finnes i andre brukeres historikk.
- En låntaker eller utlåner får flere begrensede vurderinger etter gjentatte kanselleringer/no-shows: hvordan unngår vi at dette blir en omvei til en generell straffeskår?

### F. Blokkering, rapportering og moderering

- Plattformforvalter er selv part i et lån eller gjenstand for rapport: hvem kan behandle saken?
- Plattformen suspenderer en bruker som har kommende reservasjoner både som låntaker og utlåner.

### G. Konto- og datalivssyklus

- Låntaker dør under et aktivt lån.
- Utlåner dør under et aktivt lån.
- Bruker ber om permanent sletting mens vedkommende har ventende anmeldelser eller invitasjoner, men ingen aktive lån.
- Bruker har private chatter og delt historikk med andre når kontoen slettes; hvilken synlig identitet skal stå igjen hos motparten?
- Konto deaktiveres eller slettes mens brukeren eier et skjult miljø eller er eneste administrator.
- Falsk identitet oppdages etter mange gjennomførte lån og anmeldelser: hva skjer med historisk tillitsinformasjon?
- Duplikatkonto avvikles når begge kontoene har sosial og lånerelatert historikk.

### H. Privat kommunikasjon og saker

- Blokkering stenger fri chat midt i et lån: er de strukturerte handlingene alene tilstrekkelige i alle nødvendige praktiske situasjoner?

### I. Opprinnelseskontekst og personvern


## Når køen er ferdig

Stresstesten kan anses som tilstrekkelig gjennomført når:

- alle scenariofamiliene over er prøvd eller eksplisitt vurdert som rene spesifikasjonsdetaljer
- nye scenarioer over flere gjennomganger ikke lenger avdekker vesentlige motsetninger i produktmodellen
- de tematiske visjonsdokumentene gir konsistente svar på de viktigste livssyklus-, tilgangs-, personvern- og konfliktforløpene

Dette er et modenhetskriterium for visjonen, ikke en garanti for at alle mulige edge cases er oppdaget.
