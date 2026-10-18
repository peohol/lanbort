# Testplan for lukket pilot – Lånbort

> **Status:** Planlagt, ikke påbegynt per 18. oktober 2026. Denne planen beskriver brukertesting, ikke en ny kvalitetsgodkjenning.
>
> **Fremdrift og alle test-ID-er:** [pilot-fremdrift.md](pilot-fremdrift.md). Den filen er eneste offentlige statusoversikt for pilotens manuelle tester.
>
> **Eksisterende drifts- og sikkerhetsgrunnlag:** [pilot-operations.md](pilot-operations.md), [quality-gates.md](quality-gates.md), [chat-pilot-risikovurdering.md](chat-pilot-risikovurdering.md) og [backup-restore.md](backup-restore.md).

## 1. Hensikt og avgrensning

Målet er å avgjøre om vanlige mennesker kan bruke Lånbort uten forklaring, om faktiske lån gjennomføres pålitelig, og om tjenesten skaper tilstrekkelig nytte til å fortjene videre investering. Et grønt automatisk testløp er **ikke** det samme som en bestått brukertest. Noter separat hva som fungerer teknisk og hva brukerne faktisk forstår.

Test både normalforløp, administrasjon, personvern og vanlige avvik. Alle planlagte scenarioer er nummerert A01–S09 i [fremdriftsoversikten](pilot-fremdrift.md). Nummerne endres ikke når et scenario rettes eller testes på nytt. Tillegg får nye, unike ID-er.

**Pilotens rammer:**
- Lukket registrering: produkteier inviterer og verifiserer de få deltakerne personlig; e-postkode benyttes i piloten.
- Medlemskap og lån er gratis. Vipps-registrering, ordinære passkeys og betalt abonnement kommer først etter piloten og skal ikke aktiveres her.
- Privat chat er valgfri, og kun slått på innenfor det dokumenterte, midlertidige sikkerhetsunntaket. Deltakerne skal ikke bruke den til sensitiv kommunikasjon mens uavhengig kryptografisk gjennomgang gjenstår.
- Plattformforvaltning, globale modereringsinngrep og representanttilgang ved død/varig utilgjengelighet står av. Kontroller at de **ikke** tilbys som aktive brukerfunksjoner.
- Ikke anta at alle funksjoner som står i en produktspesifikasjon, faktisk er tilgjengelige. Sjekk nåværende brukerflate før scenarioet gjennomføres; marker eventuelle avvik som «Blokkert» eller «Utenfor piloten» med ufølsom begrunnelse.

## 2. Deltakere, roller og testgrunnlag

**Panel:** 8–12 voksne deltakere, med variasjon i mobil/PC, nettlesere, digital erfaring og sosiale relasjoner. Start med 2–3 tidlige testere; inkluder dem i totalen. Utpek 2–3 miljøadministratorer som også prøver vanlige brukeroppgaver. Produkteier inviterer, følger opp og beslutter når en fase kan åpnes.

Opprett i løpet av piloten:
- Minst ett åpent, ett lukket og ett skjult miljø. Bruk to administratorer der det er behov for habilitetstesting.
- Omtrent 20–30 hverdagsgjenstander som deltakerne faktisk kan låne bort, med noen ting delt bare med venner og andre via miljø.
- Minst ett medeid objekt og minst ett isolert testmiljø for avvik, rolleendring, moderering og avvikling.
- Omtrent 12–15 gjennomførte virkelige lån, fordelt på direkte vennelån og miljølån, helst med ulike låner-/utlånerpar.

Antallene er **praktiske mål for dekningsgrad**, ikke statistiske utvalgs- eller suksesskriterier. Ikke press noen til å låne bort verdifulle, farlige eller personlige gjenstander. Marker tydelig hvilke scenarioer som er konstruerte, og bruk bare frivillige deltakere/testdata i disse.

**Ansvar:**
- Produkteier: prioritering, invitasjoner, praktisk testledelse, vurdering av sikkerhetshendelser og beslutning om å utvide/stopp.
- Testdeltakere: utfører oppgaver og beskriver erfaringer, uten tilgang til hverandres private observasjoner.
- Teknisk hjelper/agent: vurderer anonymiserte feil, retter kode, kontrollerer regresjoner og oppdaterer *kun* offentlig, ufølsom status.
- Miljøadministratorer: tester medlemskap, publisering, saker, inhabilitet og lokale tiltak.

## 3. Faser og beslutningsporter

Tid regnes fra første pilotinvitasjon. Fasegrensene kan flyttes hvis kritiske feil oppstår; registrer da ny plan i fremdriftsfilen uten å omskrive hva som skjedde.

| Fase | Omtrentlig tid | Formål | Viktigste dekning | Port til neste fase |
| --- | --- | --- | --- | --- |
| 0. Klargjøring | 3–5 dager før start | Sikre drift, innsynsgrenser og testmetode | Backup, CI, invitasjon, kontaktadresse, sikker rapportering, testlogg | Alle P0/P1-blokkere lukket; personvernløsning klar |
| 1. Første bruk | Dag 1–3 | Observere 2–3 nye brukere uten detaljert hjelp | A01–A04, A06, M01, T01–T02, T05–T06, L01/L02, K01, K06–K07 | De grunnleggende flytene kan fullføres uten kritiske feil |
| 2. Oppstart | Dag 4–10 | Få resten i gang, etablere miljøer og utvalg av ting | A, M, T, D01–D02, første forespørsler, varsling | Panelet kan delta og finne/låne ting |
| 3. Faktiske lån | Dag 11–20 | Prøve hele lånesyklusen over tid | L01–L15, K, R, ulike kontoer og enheter | Lån kan avsluttes; ingen uforklarlig fastlåste forløp |
| 4. Kontrollerte unntak | Dag 21–28 | Håndtere vanskelige, sjeldne og administrative hendelser | Utvidede L/M/T/D/S/K-scenarioer | Ingen uakseptable åpne avvik; dokumenterte resultater |
| 5. Selvstendig bruk | Dag 29–35 | Måle faktisk nytte uten instrukser | Spontan bruk, varsler, nye lån, R, intervju | Grunnlag for beslutning foreligger |
| 6. Avslutning | Dag 36–38 | Oppsummere og velge retning | Testdekning, personvern, åpne feil, sluttrapport | A, B eller C nedenfor |

### Fase 0 – sjekkliste før invitasjon

- [ ] Verifiser at produksjon kjører tilsiktet versjon, nødvendige migrasjoner og grønne tester.
- [ ] Verifiser at nye utrullede versjoner ikke omgår obligatoriske tester; dette er en anbefalt forbedring før pilot, ikke en påstand om at det er gjort.
- [ ] Kontroller nylig vellykket backup og gjenopprettingsøvelse; produksjonen skal ikke utsettes for ødeleggende prøver.
- [ ] Prøv en invitasjon, innlogging, relevant e-postvarsel og betjent sikkerhetskontakt.
- [ ] Bekreft at uinviterte ikke kan registrere seg, og at globale forvalterhandlinger forblir av.
- [ ] Kontroller driftslogger/feilvarsling; skill harmløse runtime-advarsler fra reelle feil.
- [ ] Etabler et **separat, adgangsbegrenset sted** for eventuelle rå testnotater *før* identifiserbare data samles inn. Se sikkerhetsreglene nedenfor.
- [ ] Informer deltakere om hva piloten innebærer, kontaktvei, databehandling og at privat chat har et midlertidig sikkerhetsunntak.
- [ ] Opprett en privat, enkel metode for å motta og følge opp tilbakemeldinger.

### Fase 1 – 2–3 testere, uten forklaring først

La hver person selv finne invitasjon/innlogging, vennskap, miljø, tingregistrering, søk, forespørsel, varsler og chat. Noter *privat* om oppgaven lyktes uten hjelp, hvor vedkommende ble stående, og hvilken støtte som måtte gis. Gi så nødvendig veiledning. Blokkerende problemer rettes før flere inviteres.

### Fase 2 – oppstart for hele panelet

Be hver deltaker registrere minst to ting (om praktisk mulig), finne minst ett aktuelt objekt, bli venn med noen, bli med i minst ett miljø og sende én forespørsel. Administratorene behandler medlemskap og publiseringer. Avstem invitasjoner og tilgang for åpne, lukkede og skjulte miljøer. Start tidsavhengige tester tidlig.

### Fase 3 – vanlige lån

Bruk faktiske ting, ikke bare simuleringer. Fordel låner- og utlånerrollene. Gjennomfør normalflyten fra forespørsel via reservasjon/overlevering til retur og anmeldelse. Ta med avslag, tilbaketrekking, endring, forlengelse, tidlig retur, chat, varsel og minst ett lån over flere dager. Kontroller at begge parter ser samme avtale og vet hva som skal skje.

### Fase 4 – kontrollert test av avvik

Bruk egne testting/miljøer og avtalte simulerte hendelser; ikke fremprovoser reelle tvister:
- Overlappende forespørsler; vilkår endres før godkjenning; kansellering før overlevering.
- For sen/omstridt overlevering eller retur; registrert testskade med motsvar.
- Opphørt vennskap, blokkering eller medlemskap under et fortsatt gyldig lån.
- Medeierbegrensning, rollebytte, miljøtypeendring, inhabil administrator og saksmekling.
- Sletting/arkivering og enhetstap/gjenoppretting **bare med dedikerte testkontoer**.

Forsøk ikke å oppnå en administrativ avslutning eller global moderering gjennom funksjoner som er deaktivert eller avventer et åpent OD-valg. Verifiser i stedet at de ikke feilaktig tilbys. Frister som ikke utløper i pilotperioden, testes med kontrollerbar tid i et separat testmiljø; merk denne forskjellen tydelig.

### Fase 5 – observer nytte uten oppgavepress

Slutt å dele ut nye oppgaver til vanlige deltakere, med mindre nødvendig testdekning krever en avtalt kontroll. Registrer aggregert om noen oppretter nye ting, tar initiativ til lån, returnerer og bruker appen på nytt. Gjennomfør avslutningsintervju. Spør om hva som var vanskelig, hva de faktisk brukte, hva de savnet, om de stolte på status/varsler, og om de ville fortsette uten pilotoppfordringer.

### Fase 6 – avslutning og beslutning

Lukk konstruerte testlån og saker, avklar reelle forpliktelser før noen sletter konto, gjennomgå oppbevaring og slett unødvendige rå testnotater etter fastsatte rutiner. Publiser bare overordnede, ufølsomme funn. Velg:

- **A: Neste fase** – vanlige flyter fungerer, ingen uakseptable alvorlige feil, og deltakerne opplever nytte.
- **B: Kort forbedringspilot** – teknologien virker, men enkelte oppgaver/avvik trenger retting og ny brukertest.
- **C: Revurder produktmodellen** – teknisk fungerende løsning uten tydelig praktisk etterspørsel.

## 4. Full funksjonsdekning og testbevis

[Den operative listen](pilot-fremdrift.md) har 98 stabile ID-er i åtte grupper:
- A: konto, innlogging og vennskap (11)
- M: miljøer og medlemskap (12)
- T: ting, publisering, søk og medeierskap (15)
- L: låneforespørsler, lån og retur (20)
- K: kommunikasjon, varsler og enheter (14)
- R: anmeldelser og tillit (7)
- D: administratorarbeid og saksbehandling (10)
- S: kontoavvik, personvern og drift (9)

**Nivåer:** B = basis (må fungere før utvidelse); O = ordinær (prøves i pilot); U = utvidet kontroll (minst én kontrollert prøving, om tilgjengelig). Lånets vanlige steg og kjerneflyter bør prøves av minst to ulike brukerpar. Et scenario er aldri «Bestått» bare fordi kode/CI er grønn.

**Fremgangsmåte ved hver test:**
1. Bruk ID-en og forventet utfall i fremdriftsoversikten.
2. Utfør testen; ta private notater ved behov, begrenset til nødvendige fakta.
3. Oppdater offentlig status uten navn, kontoinformasjon, eksakte tidspunkt, rå hendelser eller bilder.
4. Ved feil: vurder P0–P3, stans eller utsett berørte deler, og opprett bare ufølsom offentlig sak ved ordinær feil; sikkerhetsfunn går privat.
5. Etter retting: sett «Må prøves på nytt», noter hvilken versjon som er rettet **uten å knytte den til en deltaker**, test på nytt, og marker først deretter «Bestått».

**Statuser:** Ikke startet / Pågår / Bestått / Feilet / Blokkert / Må prøves på nytt / Utenfor piloten. «Utenfor piloten» er ikke det samme som «Bestått», og krever en kort begrunnelse. «Blokkert» teller som utestående. Også brukertester som ble gjennomført med hjelp, skal fremgå av den *private* resultatmålingen; teknisk fullført betyr ikke selvstendig mestring.

## 5. Tidsavhengige scenarioer

Start disse i fase 1–2. Ikke anta at alle frister passer inn i fem uker.

| Hendelse | Frist/forhold | Metode |
| --- | --- | --- |
| Venne-QR | Omtrent 5 minutter | Test gyldig og utløpt kode |
| E-postinvitasjon | Omtrent 14 dager | La en dedikert invitasjon utløpe eller trekk den tilbake |
| Returbekreftelse | 30 sekunders angrebuffer | Prøv både angre og utløp |
| Anmeldelser | Inntil 14 dagers skjult periode | Fullfør et lån tidlig; la én part ikke anmelde |
| Overlevering/retur | Avtalt tidspunkt og etterfølgende frister | Prøv et separat testlån som passerer fristen |
| Miljøtype/medlemskrav | Ulike overgangsfrister | Prøv med dedikerte medlemmer; bruk testmiljø med kontrollert tid for resten |
| Påminnelser/varsler | Etter hendelser over flere dager | Kontroller faktisk levering og fravær etter brukerens valg |

Noter om verifikasjonen skjedde i **produksjon med reelle brukere**, **kontrollert pilot-test** eller **separat automatisert/testmiljø**. Disse teller ikke automatisk likt.

## 6. Sikker dokumentasjon og personvern

**Viktig:** Repoet peohol/lanbort er offentlig. Git-historikk, PR-er, issues og kommentartråder er offentlig lesbare og kan være vanskelige å rydde for sensitivt innhold etterpå. At noe slettes i en senere commit, fjerner ikke nødvendigvis tidligere historikk.

**Tillatt i repoet:**
- Fase/status per test-ID, testnivå, generisk resultat, samlet antall gjennomførte tester og anonymisert forbedringsbehov.
- Link til offentlig GitHub-sak/PR **bare når teksten er kontrollert og ufølsom**.
- Generell app-/versjonsinformasjon uten kobling til et identifiserbart brukermønster.

**Ikke tillatt i repoet eller offentlige issue/PR-kommentarer:**
- Testernes navn, e-post, telefon, brukernavn, deltaker-ID-er eller koblingsnøkler mellom alias og person.
- IP-adresser, sesjoner, påloggingskoder, kontonøkler, gjenopprettingsnøkler, hele brukerhendelseslogger eller eksakte aktivitetssekvenser fra små grupper.
- Private meldinger, sakstekster, låneavtaler med personopplysninger, ubegrunnede anklager, skjermbilder med andre personers data.
- Detaljer om en urettet sikkerhetssvakhet eller steg som gjør den enklere å utnytte.

**Råmateriale:** Dersom individuelle notater faktisk er nødvendige, skal de oppbevares *utenfor dette repoet* på et særskilt, tilgangsstyrt sted med begrensede rettigheter, sikker lagring og fastsatt oppbevarings-/sletterutine. Avklar og etabler dette før innsamling; planen oppretter **ikke** et privat datalager og gjør ikke GitHub-issues eller agentchatter til godkjent oppbevaring. Bruk færrest mulig identifikatorer; små paneler kan indirekte identifiseres selv ved tilsynelatende anonymiserte notater. Rapporter bare aggregater når de ikke røper enkeltdeltakere.

**Rapportering:** Vanlige ikke-sensitive feil kan dokumenteres i GitHub når de er renset for personopplysninger. Sikkerhet, personvern og alvorlige hendelser behandles i eksisterende private kanaler og etter [driftsrutinen](pilot-operations.md#alvorlige-hendelser), ikke i offentlig teststatus. Eksterne sikkerhetsfunn kan rapporteres privat via GitHub «Report a vulnerability». Kontaktadressen for øvrige sikkerhetshenvendelser er sikkerhet@lånbort.no. Ikke legg en lenke til private bevis som røper informasjon eller tilgang.

**Praktisk kvalitetssikring av hver oppdatering:** Les diffen, sjekk at bare ufølsomme felt er endret, unngå PR-meldinger med rådata, og sørg for at fremdriftsoversikten oppdateres ved hver testøkt eller samlet ved ukentlig gjennomgang. Oppfør aldri en manuelt utført test uten en virkelig observasjon.

## 7. Feilklassifisering, oppfølging og endringskontroll

- **P0 – Kritisk:** Personvern-/sikkerhetsbrudd, utilsiktet datatap, uvedkommende tilgang eller dobbelbooking. Stans berørte funksjoner umiddelbart og håndter privat.
- **P1 – Alvorlig:** Viktig normalflyt kan ikke fullføres. Stopp utvidelse av piloten eller aktuell funksjon til retting er verifisert.
- **P2 – Moderat:** Funksjonen virker delvis, men krever omvei eller gir betydelig forvirring. Prioriter etter hyppighet og konsekvens.
- **P3 – Mindre:** Kosmetiske feil eller forslag som ikke hindrer bruk; samles til senere.

Retting av P0/P1 kan publiseres fortløpende etter kontroll. Samle P2 og utsett som hovedregel P3 og nye funksjoner. Noter hvilke test-ID-er som må regresjonstestes etter en endring. Pilotens versjoner og observasjoner må ikke blandes slik at forbedringer påstås uten at noen prøvde dem.

## 8. Oppsummering, indikatorer og beslutningsgrunnlag

Registrer **kun aggregert og med varsomhet ved små tall**: inviterte/aktive, registrerte ting, forespørsler, godkjenninger, avsluttede lån, selvstendig fullførte oppgaver, tekniske feil etter alvorlighetsgrad, spontan bruk i siste uke og deltakere som ønsker å fortsette. Spør i korte intervjuer om forståelse, nyttige funksjoner, hindringer, trygghet og videre interesse.

Et mulig veiledende mål er at minst 80 % klarer kjerneoppgavene uten hjelp etter første gangs innføring. Med 8–12 personer er dette en praktisk pekepinn, **ikke** et statistisk estimat for framtidige brukere. Ikke publiser små delgruppetall som kan utpeke enkeltdeltakere.

**Sluttkrav for at piloten kan regnes som evaluert:**
- Alle basis-ID-er er bestått; ordinære ID-er er prøvd med dokumentert resultat.
- Utvidede ID-er er prøvd eller markert «Blokkert»/«Utenfor piloten» med begrunnelse.
- Flere uavhengige brukerpar har gjennomført normale lån til avslutning.
- Ingen åpne P0 og ingen uakseptable P1-feil; øvrige feil er risikovurdert og prioritert.
- Det finnes observasjoner fra en periode med selvstendig bruk og avslutningsintervjuer.
- Teknisk konklusjon og konklusjon om faktisk nytte er skrevet hver for seg.
- Personvern, bevaringsbehov og sletting av pilotnotater er gjennomgått.

Avslutt med én eksplisitt beslutning A/B/C, begrunnelse og en liten prioritert liste over neste arbeid. Ikke velg neste fase ut fra hvor mye som er kodet.
