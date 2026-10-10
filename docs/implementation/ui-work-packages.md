# Brukerflaten: UI-arbeidspakker

> **Status:** Plan for Fase 8, 6. oktober 2026. Serverens domene og API er bygget for nesten hele produktmodellen; brukerflaten dekker foreløpig bare Hjem, Finn, Lån, lånets side, Mine ting (liste), Samtaler, Varsler og Konto. Denne planen bygger resten som én helhetlig, mobil-først app etter [UX-modellen](../ux/README.md).

## Prinsipper for alle pakkene

Hver pakke bygger skjermer, ikke regler. Domene- og autorisasjonsregler ligger på serveren og endres bare der pakken sier det.

- **Én app, fem områder.** Alle sider ligger under de fem områdene, varslingslaget eller kontoen (UX-IA-001–003). En ny side er en kontekst i et område, aldri et nytt område. Miljøer er kontekster, ikke et eget produkt (UX-IA-004).
- **Samme byggesteiner overalt.** Sider bruker komponentene og stilene fra WP-80 i stedet for egne varianter. Mangler en byggestein, legges den til i felles grunnlag i samme PR og brukes derfra.
- **Mobil først.** Én kolonne på 320 px uten sidelengs rulling; større skjermer får mer plass, ikke en annen logikk (UX-A11Y-001).
- **Neste steg først.** Detaljsider starter med statuskortet: kort status, tid, hvem som må handle, én primærhandling når ett neste steg finnes og diskret tilgang til mer (UX-INT-001, UX-INT-004, «Standard mønster for statuskort»). Sjeldne valg ligger under «Flere valg» (UX-INT-009). Historikk er sekundær (UX-IA-008).
- **Samtykke navngir konsekvensen.** Bindende handlinger har en knappetekst som sier hva som skjer (UX-INT-003). Destruktive og personvernutvidende handlinger viser hva som forsvinner, hva som består og hvem som påvirkes (UX-INT-007). Reverserbare handlinger utføres direkte (UX-INT-002).
- **Serveren avgjør.** Knapper vises bare når handlingen er gyldig for brukeren, men det er bare en hjelp; serveren avviser uansett. Etter en handling viser siden den nye tilstanden fra serveren (UX-INT-005), og et ukjent nettverksutfall vises som ukjent (UX-INT-006).
- **Personvern i presentasjonen.** Kontekstmerke der betydningen avhenger av kontekst (UX-PRIV-003), «Tidligere bruker» uten lenke for slettede brukere (UX-PRIV-010), og ingen snarveier som gjenåpner tapt tilgang (UX-PRIV-007, UX-EXC-005).
- **Varsler leder fram.** Når en kontekst får en egen side, peker varsler og Hjem dit (én linje i `navigation/targets.ts`, UX-INT-010).
- **Ferdig betyr testet.** Hver ny side får én linje i tilgjengelighetstesten (`e2e/accessibility.spec.ts`) og minst én nettlesertest av hovedflyten. Nye domeneoperasjoner får integrasjonstester med eksplisitte avslag, og nye lese-ruter med ressurs- eller person-ID får en probe i sikkerhetstesten (WP-70).
- **Åpne beslutninger bygges ikke.** Funksjoner som står avslått til en OD er avgjort (OD-0003, OD-0016, OD-0017, OD-0018, OD-0023), vises ikke i UI-et.

## Oversikt og rekkefølge

| Pakke | Innhold | Avhenger av | Kan gå parallelt med |
| --- | --- | --- | --- |
| [WP-80](#wp-80--felles-ui-grunnlag) | Designsystem, app-skall, komponenter, ruter | — | ingen (legges først) |
| [WP-81](#wp-81--mine-ting-og-objektskjema) | Mine ting, opprett og rediger objekt | WP-80 | alle andre |
| [WP-82](#wp-82--objektets-side-for-eiere) | Objektets side for eiere | WP-80 | alle andre |
| [WP-83](#wp-83--objekt-for-lånere-og-låneforespørsel) | Objekt for lånere, forespørsel og forespørselens side | WP-80 | alle andre |
| [WP-84](#wp-84--miljøets-side-og-medlemskap) | Miljøets side, innmelding, medlemsliste, opprett miljø | WP-80; skjult→lukket også serverdelen av WP-85 | alle andre |
| [WP-85](#wp-85--miljøadministrasjon) | Administrasjon av et miljø og resten av WP-23 (server) | WP-80 | alle andre |
| [WP-86](#wp-86--personer-venner-og-tillit) | Personens side, venner, blokkering, tillit | WP-80 | alle andre |
| [WP-87](#wp-87--lånets-side-og-anmeldelser) | Resten av lånets side og anmeldelser | WP-80 | alle andre |
| [WP-88](#wp-88--saker-og-arbeidskø) | Sakens side, egne saker og administratorkø | WP-80 | alle andre |
| [WP-89](#wp-89--eiere-på-tingene-i-et-miljø) | Eierens navn på tingene i et miljø | WP-84 | alle unntatt WP-84 |
| [WP-27](work-packages.md#wp-27--synlighet-for-venner) | Synlighet for venner (server og UI) | WP-80; UI-delen også WP-81, WP-83, WP-86 | serverdelen med alle |

Etter WP-80 kan WP-81–WP-88 og serverdelen av WP-27 gå samtidig; WP-89 kommer etter WP-84. Pakkene eier hver sine sider, så de berører hverandre bare i felles filer der hver pakke legger til én linje: `navigation/targets.ts`, `navigation/routes.ts` og listen over sider i tilgjengelighetstesten. Objektets side (`/ting/[id]`) deles av WP-82 og WP-83: WP-80 legger siden med én visning for eiere og én for andre i hver sin fil, og pakkene bygger videre i hver sin.

Et naturlig første uttak for et testpanel er WP-81, WP-83, WP-84 og WP-87: å registrere en ting, publisere den i et miljø, bli funnet, få en forespørsel og gjennomføre lånet.

## Tomat i appen — felles designgrunnlag

Det vedtatte Tomat-uttrykket ([designreferansene](../../design/README.md)) er lagt inn i appens felles grunnlag. Sporene som tar over sider til Tomat, bruker dette og lager ikke egne varianter. Mangler en byggestein, legges den til her først.

- **Stil og tokens:** `apps/web/src/app/globals.css`. Farger (`--color-*`, lys og mørk modus med AA-kontrast), avstander (`--space-*`), radier (`--radius-*`), tekststørrelser (`--text-*`) og skriftene Atkinson Hyperlegible Next og Quicksand (selvhostet i `public/fonts/`). Kort er `.card`, rader er `.entries`/`.entry`, filtre er `.filters`.
- **Knapper:** vanlig knapp er nøytral; `.button-primary` er neste steg (UX-INT-001), `.button-secondary` er et mildere steg ved siden av, `.button-danger` er destruktiv i omriss og fylles bare i bekreftelsen (`ConfirmAction`), og `.button-quiet` er en stille lenke som «Flere valg».
- **Ikoner:** `Icon` (`components/icon.tsx`) med ikonene fra prototypene. Ikoner står alltid ved tekst.
- **Status og kontekst:** `Tag` med tonene `attention` («Venter på deg»), `waiting` (venter på andre), `positive`, `warning`, `danger` og `neutral`; tonen gir farge og ikon, ordene bærer meningen. `ContextTag` med ikon for kontekst («Via Borettslaget Lia»).
- **Sider:** `PageHeader` (tilbake, typeetikett med `kind`, tittel, kontekst), `StatusCard` («Nå»-kortet, med `label` som merke over statusen der designet har det, og forklaring som `children`), `EmptyState`, `MoreActions`, `ConfirmAction` (ark fra bunnen på mobil; `primary` når den er hovedhandlingen, som på `ActionButton`), `Field`, `CommandForm`, `PersonName`.
- **Navigasjon (UX-IA-009–013):** en side sier bare hvor den hører hjemme, så følger tilbake-knappen (mobil) og brødsmulene (større skjerm) stabelen brukeren faktisk gikk. `PageHeader` får `back` (områdets egen side, en fast beholder som en kø, eller for et skjema stedet det ble startet fra) og `home` når hjemområdet ikke er `back`. `task` gjør et skjema til en avgrenset oppgave: uten områder og klokke, bare «Avbryt». Sidens første rad deler linje med klokke og profilbilde. Logikken ligger i `navigation/stack.ts` (ren og testet) og `components/navigation-stack.ts`; sider skal ikke bygge egne tilbake-lenker. En lenke som er en direkte inngang, kaller `expectDirectEntry` før den følges, slik varsler gjør.
- **Konto og Varsler som lag (UX-IA-002, UX-IA-020):** åpnet fra appen legger de seg over skjermen (fullskjerm på mobil, panel på større skjerm), og «Lukk», Escape og klikk ved siden av går tilbake til nøyaktig samme skjerm. Nås de utenfra, er laget selve siden. Lagene er `components/layer.tsx` og `app/@layer`. Laget viser de vanlige sidene under `app/konto` og `app/varsler`, så innhold bygges der og ikke i laget. Konto har en egen stabel. Lenker til personer og egne saker åpnes inni Konto (`accountLayerHref`).
- **Lenkerader med chevron:** `MenuList` og `MenuRow` (`components/menu-list.tsx`) er en liste i ett kort med skillelinjer. Hver rad har ikon (`icon`) eller bilde eller myk firkant (`lead`), tittel, en kort linje under (`detail`, også med merker), eventuelt et merke til slutt (`end`) og chevron. Hele raden er klikkbar. Bruk dem i stedet for lokale varianter.
- **Bilde ved tittelen og bred side:** `PageHeader` med `picture` viser bildet til venstre for typeetikett og tittel. `<main className="main-wide">` gir en side med spalter på stor skjerm opptil 72rem (vanlig bredde er 48rem).

## WP-80 — Felles UI-grunnlag

**Leverer:**

- **Designsystem i CSS:** fargetokener for lys og mørk modus med kontrast etter WCAG 2.2 AA, avstander, radier og typografiskala. Primær-, sekundær- og farlig knapp. Tonene for status (nøytral, venter, positiv, advarsel, fare) uttrykkes alltid også med tekst (UX-A11Y-005).
- **App-skall:** toppfelt med merke, varselindikator og konto, og de fem områdene nederst på mobil og ved siden på desktop (finnes, får designsystemet). Sidetopp med tittel, tilbakelenke til området og kontekstmerke for detaljsider.
- **Komponenter:** sidetopp (`PageHeader`), statuskort (`StatusCard`), merke for status og kontekst (`Tag`, `ContextTag`), tom tilstand (`EmptyState`), «Flere valg» (`MoreActions`), konsekvensdialog (`ConfirmAction`, UX-INT-007), skjemafelt med hjelpetekst og feil (`Field`) og skjema som sender en kommando (`CommandForm`). Kommandoene deler én mekanisme med `ActionButton`: idempotensnøkkel, opptatt-tilstand, feilmelding, annonsering og ny lesing fra serveren.
- **Ruter:** én modul med adressene til alle sider i planen (`navigation/routes.ts`), så pakkene lenker til hverandre før sidene finnes. `targetPages` peker bare til sider som finnes.
- **Objektets side som ramme:** `/ting/[id]` velger visning for eiere eller for andre, med en enkel første versjon av hver som WP-82 og WP-83 bygger videre på. Mine ting og treff i Finn lenker dit.
- **E-postlenken fra varsler:** `/?varsel=<id>` merker varselet lest og sender brukeren videre til konteksten, eller til Varsler når konteksten ikke har en side (UX-INT-010).
- Eksisterende sider tas over på designsystemet uten å endre hva de gjør. Det inkluderer Konto-sidens eksisterende varslingsvalg, kontostatus, deaktivering/reaktivering og kontosletting. Det inkluderer også privat chats enhetsflyter fra WP-43 ([ADR-0010](../architecture/decisions/ADR-0010-e2ee-protokoll-enheter-og-recovery.md)): slå på chat på første enhet, koble til en ny enhet, godkjenn den fra en eksisterende enhet med QR eller kode, Mine enheter med fjerning av en tapt eller ukjent enhet, og tilbakestilling når ingen godkjent enhet er igjen, med konsekvensen for nøkler og gammel historikk. De er av for ekte brukere til Port C.

**Skjermer og flyter:** app-skallet og alle eksisterende sider (utseende), inkludert enhetsflytene for privat chat, objektets side (ramme), varselslenken.

**Avhenger av:** ingenting.

## WP-81 — Mine ting og objektskjema

**Leverer:** Én måte å registrere og redigere ting på, uansett inngang (UX-JRN-003).

**Skjermer og flyter:**

- **Mine ting** (`/mine-ting`): egne og medeide ting med kort status (kan lånes ut, utlånt, sperret, arkivert), medeierinvitasjoner (finnes), knappen «Registrer en ting» og pilotgrensen (finnes).
- **Opprett** (`/ting/ny`, med `?miljo=` når brukeren starter fra et miljø): ett skjema i rekkefølgen tittel og kategori → beskrivelse og bilder (1–5, fjerning) → tilgjengelighet (ett eller flere intervaller, åpne eller avgrensede) → valgfrie vilkår → publiseringskontekster → gjennomgå og publiser. Miljøet brukeren startet fra er forhåndsvalgt. Pilotgrensen (PS-OBJ-019) vises ved kategori.
- **Rediger** (`/ting/[id]/rediger`): samme skjema. Ved medeierskap oppdager skjemaet at noen andre har lagret i mellomtiden og lar brukeren se det før hen lagrer (PS-OBJ-013, «Samtidig redigering»). Endrede vilkår forklares: åpne forespørsler må bekreftes på nytt (PS-LOAN-005, OD-0014).

**Avhenger av:** WP-80. Valget «Venner» legges i publiseringssteget av WP-27.

**I Tomat (kjerneflyt 2), 9. oktober 2026:** Mine ting og miljøets ting er kort med bilde, hvor tingen vises og status (`ThingCard`). Skjemaet er fire steg med spørsmålet som overskrift: «Om tingen», «Når og vilkår» («Når som helst» fra i dag, eller bestemte perioder), «Hvem kan låne» (miljøene og «Venner» som egne valg, «Venner» av som standard) og «Se over», der hver gruppe har «Endre» og knappen sier hvor tingen blir synlig. «Lagre uten å publisere» er et diskret valg, og «Avbryt» spør før noe går tapt. Redigering har tre steg; hvor tingen vises, endres på tingens side. En ting uten perioder kan lagres som før, men kan ikke lånes ut før den får en.

## WP-82 — Objektets side for eiere

**Leverer:** Eiernes oversikt over én ting og alt de kan gjøre med den, uten falsk kontroll over etablerte lån (UX-JRN-011).

**Skjermer og flyter** (eiervisningen av `/ting/[id]`):

- Statuskort: kan lånes ut nå eller hvorfor ikke (sperre, frysing, uavklart besittelse), neste kommende lån.
- Publiseringer per miljø med status (venter på godkjenning, aktiv, avvist, sperret), publiser i et nytt miljø og trekk tilbake (PS-OBJ-006, PS-OBJ-017).
- Lån og forespørsler for tingen, med lenke til hvert lån (`loan.list_for_co_owner`).
- Medeiere: inviter, trekk invitasjon, tre ut (med konsekvens), medeieres begrensninger og opphevelse (PS-OBJ-007–010, UX-EXC-006).
- Under «Flere valg»: arkiver og gjenopprett, slett (samtykke fra alle eiere, med konsekvensvisning, PS-OBJ-011) og versjonshistorikk med gjenoppretting av en tidligere versjon (PS-OBJ-013).

**Avhenger av:** WP-80. Lenken «Rediger» går til WP-81s side.

**I Tomat (kjerneflyt 2), 10. oktober 2026:** Siden har tingens bilde og «Din ting» over navnet. «Hvor den vises» har én rad per miljø brukeren kan publisere i og én for «Venner», med status og steget som endrer det (publiser, trekk tilbake, vis eller skjul for venner, PS-OBJ-020). Ser bare eierne tingen, sier statuskortet det og leder til «Velg hvor den vises». «Om tingen» viser ledighet og vilkår først.

## WP-83 — Objekt for lånere og låneforespørsel

**Leverer:** Hele veien fra en funnet ting til en sendt, besvart og godkjent forespørsel, likt for miljølån og vennelån (UX-JRN-004, UX-JRN-005, UX-JRN-006, PS-LOAN-001).

**Skjermer og flyter:**

- **Objekt for andre** (visningen for ikke-eiere av `/ting/[id]`, med opprinnelsen i adressen, `?miljo=<id>` eller direkte): innhold, bilder, ledighet, vilkår og opprinnelse som kontekstmerke. Primærhandling «Be om å låne». Miljøets spørsmål og svar og «Følg tingen» hører til her (PS-OBJ-014–015, WP-63).
- **Forespørsel** (`/ting/[id]/lan`): periode (dato eller «så snart som mulig», sluttdato eller varighet, aldri begge, UX-JRN-004), valgfri melding med forklaringen fra PS-LOAN-004, bekreftelse av vilkårene og ansvarserklæringen ved vennelån (PS-LOAN-003), gjennomgang og send. Etter sending går brukeren til forespørselens side med «Venter på svar fra …».
- **Forespørselens side** (`/lan/foresporsel/[id]`): status og hva det ventes på; låntaker kan trekke den og bekrefte nye vilkår (PS-LOAN-005); utlåner ser periode, vilkår og kollisjoner og kan godkjenne med en knapp som navngir avtalen («Godkjenn lån 10.–12. oktober»), avslå eller godta ansvarserklæringen. Godkjenning leder til lånets side.
- Lån-listen og Hjem lenker forespørsler til siden (`targets.ts`).
- **Server:** meldingen blir valgfri (PS-LOAN-004, rest fra WP-30): kontrakt, databasekolonne og tester.

**Avhenger av:** WP-80.

**I Tomat (kjerneflyt 1), 10. oktober 2026:** «Objekt for andre» har «Via …» eller «Direkte mellom venner» under navnet, og i et miljø også eierne som er medlemmer der (PS-ENV-015). Direkte mellom venner nevnes ingen eier, som før. Statuskortet viser ledigheten, ukestripen for de neste sju dagene (fylte dager er ledige, PS-OBJ-003) og vilkårene før «Be om å låne». Under kortet sier én linje hvorfor brukeren ser tingen (UX-IA-015), og i et miljø følger «Følg tingen» og «Spørsmål». Det som sperrer tingen, sies ikke (UX-PRIV-004).

## WP-84 — Miljøets side og medlemskap

**Leverer:** Miljøet som kontekst: forstå det før innmelding, bli med, bruke det, og forlate det (UX-IA-004, UX-JRN-002).

**Skjermer og flyter:**

- **Miljøets side** (`/miljoer/[id]`): navn, type forklart i vanlige ord, område, regler og krav. For ikke-medlemmer bare det typen tillater (PS-ENV-001, UX-PRIV-002). For medlemmer: tingene i miljøet med lenke til objektet, «Registrer en ting her» (til WP-81 med miljøet forhåndsvalgt) og kontakt med administratorene.
- **Innmelding:** bli med (åpent), søk med svar på krav (lukket), godta invitasjon (skjult), svar på spørsmål om mer informasjon, og følg status (PS-ENV-004–006).
- **Typeendring for medlemmer:** se hva økt synlighet betyr og akseptere eller forlate innen fristen (UX-PRIV-008, PS-ENV-008). For skjult→lukket bygger dette på serverleveransen i WP-85.
- **Egne rolleinvitasjoner:** en aktiv bruker som er invitert til administratorrolle, eller en administrator som tilbys eierskap, ser invitasjonen på miljøets side og kan godta eller avslå. Hjem peker til samme kontekst (PS-ENV-003).
- **Forlat miljøet** med konsekvensvisning; passiv status forklart.
- **Medlemsliste** for aktive medlemmer: de andre aktive medlemmene med navn og rolle, hver med lenke til personens side (WP-86), der man kan sende venneforespørsel (visjon 02, «Vennskap»). Passive medlemmer vises ikke, og ikke-medlemmer ser ingen liste (visjon 03). Serverleveranse: en medlemsvendt spørring med samme historiske synlighet som administratorenes medlemsliste (PS-ENV-009), uten svar på medlemskrav (UX-PRIV-009).
- **Eiere på tingene** (OD-0024, PS-ENV-015) bygges i WP-89 etter denne pakken.
- **Opprett miljø** (`/miljoer/ny`): navn, type, beskrivelse, område og krav.
- Hjem lenker «Dine miljøer» og miljøvarsler til siden, og miljøtreff i Finn lenker hit.

**Avhenger av:** WP-80. Typeendringen skjult→lukket for medlemmer også av serverdelen av WP-85; resten av pakken venter ikke på den.

**I Tomat (kjerneflyt 3), 10. oktober 2026:** Siden er «Miljø» med sted under navnet, og medlemskapet er statuskortet med typen eller «Medlem» over. Medlemmer ser tingene, «Registrer en ting her» og en rad til «Om miljøet og medlemmer» (`/miljoer/[id]/om`): beskrivelsen, medlemslisten, reglene, «Kontakt administratorene» (saksskjemaet) og «Forlat miljøet». Før man er med, står det hva miljøet er og hva bare medlemmer ser. Gjenstår fra designreferansen: søknaden som egen avgrenset side, «Velkommen» ved første besøk, søk i miljøet og omtrentlig medlemstall (OD-0048).

## WP-85 — Miljøadministrasjon

**Leverer:** Administratorens oppgaver som konkrete oppgaver på miljøet, ikke skjulte superbrukerknapper (UX-JRN-012, UX-PRIV-006).

**Skjermer og flyter** (`/miljoer/[id]/administrer`, bare for miljøets roller):

- Innmeldinger: godkjenn, avvis, be om mer informasjon; inviter og trekk invitasjon.
- Publiseringer: forhåndsgodkjenning av og på, godkjenn, avvis, sperr og opphev sperre (PS-ENV-011, PS-OBJ-017).
- Innstillinger: navn, beskrivelse, område (fyller hullet etter WP-62) og medlemskrav med overgangsfrist (PS-ENV-005–006).
- Roller: inviter administrator og trekk rolleinvitasjon, fjern administrator, tre ut, tilby eierskap; ta over et eierløst miljø (PS-ENV-003, PS-ENV-012–014). Mottakerens godta/avslå-flyt ligger på miljøets ordinære side i WP-84. Manglende administrator vises som manglende behandlingsevne (UX-EXC-009).
- Typeendring med konsekvensvisning og status for avstemningen (PS-ENV-007–008), og avvikling med angrefrist (PS-ENV-013).
- Miljøets sakskø lenkes fra her (WP-88).
- **Serverleveranse, resten av WP-23** (egen PR først, siden WP-84 bygger på den): skjult→lukket kan startes med 7 dagers frist, og vedtas endringen, avsluttes medlemskapet til dem som ikke har akseptert, i stedet for at de blir passive (PS-ENV-008, OD-0012).

**Avhenger av:** WP-80.

## WP-86 — Personer, venner og tillit

**Leverer:** Personer som egne sider, og vennskap og blokkering der personen vises (PS-USR-003–007, PS-TRUST-006–012).

**Skjermer og flyter:**

- **Personens side** (`/personer/[id]`): navn, kontekstuell tillitsprofil (anmeldelser og aggregater etter tillitsreglene), handlinger etter relasjon: send, trekk, godta eller avslå venneforespørsel, fjern venn, blokker og opphev blokkering (med konsekvens). Ingen side og ingen lenke for slettede eller blokkerende brukere (UX-PRIV-007, UX-PRIV-010).
- Personnavn i lån, forespørsler, saker og miljøets medlemsliste (WP-84) lenker til siden der relasjonen tillater det. Aktive medlemmer av et felles miljø har allerede tilgang til hverandres side på serveren.
- **Konto** (`/konto`): venner, ventende forespørsler og blokkerte (finnes) får designsystemet og lenker til personens side.

**Avhenger av:** WP-80. Tingene en venn har gjort synlige for venner legges på siden av WP-27.

**Gjenstår etter beslutningene 9. oktober 2026** (designreferanse: [Personer, venner og tillit v1](../../design/L%C3%A5nbort%20-%20Personer%2C%20venner%20og%20tillit%20v1.html)). Bygges i det vertikale sporet, ikke i designarbeidet:

- **Sperre etter avslag (PS-USR-012).** Bygget 9. oktober 2026. Serveren avviser `friendship.request` med det samme nøytrale svaret som ved egen blokkering når parets siste vennskapsrad er avslått og ble sendt av den som prøver; databasen holder samme regel. Relasjonen har feltet `canRequest`, som bare sier om en forespørsel kan sendes nå, og personens side sier da «Du kan ikke sende … en venneforespørsel nå».
- **Varsler (PS-USR-011).** Appen varsler allerede bare ny og godtatt forespørsel, og varselet åpner personens side med gjeldende relasjon. Når varslingssenteret får designet, må et varsel om en trukket forespørsel si at den ikke lenger gjelder (UX-IA-019).
- **Konto som lag (UX-IA-020).** I dag er Konto en vanlig side (`/konto`). Den blir et fullskjerms lag med egen stabel og «Lukk» som returnerer til forrige skjerm med tilstanden. Bygges sammen med stabelen fra UI-designets fase 2 (se «Senere»).
- **Rollen fra inngangen først (UX-PRIV-012).** Bygget 9. oktober 2026. Lenker fra et lån, en forespørsel, en ting og en anmeldelse gir rollen i adressen (`?rolle=laantaker|utlaaner`), og tillitsprofilen viser den rollen først. Andre innganger gir standardrekkefølgen. Nye innganger med en rolle gir den til `PersonName`.
- **Ingen aktivitetstall (PS-TRUST-017).** Appen viser ingen i dag; ingenting skal bygges.
- **Personens side i Tomat.** Bygget 9. oktober 2026 etter designreferansen: hvorfor du ser personen (felles miljøer og vennskap), kortet «Dere to» med bare neste steg, «Mellom dere nå» (lånene dere har sammen som ikke er avsluttet), erfaringene per rolle med egen side per rolle (`/personer/[id]/som-laantaker|som-utlaaner`) med fordelingsstriper og anmeldelser, tingene en venn har gjort synlige for venner (UI-delen av WP-27 for profilen), og fjern, blokker og rapporter under «Flere valg». Avslag, tilbaketrekking og fjerning blir på siden når et felles miljø fortsatt gir tilgang. På stor skjerm står erfaringene i en egen spalte til høyre (skjerm 09).
- **Venner og Blokkerte i Konto.** Gjenstår: egne sider i Konto-laget (designreferansen skjerm 18–20), bygges når Konto er et lag (UX-IA-020).

## WP-87 — Lånets side og anmeldelser

**Leverer:** Resten av låneforløpet på lånets side, så ingen del av lånet krever en annen flate (UX-JRN-007–010, UX-EXC-001–010).

**Skjermer og flyter** (`/lan/[id]`, finnes):

- Statuskortet får designsystemet.
- Foreslå endring av perioden (datovelger, PS-LOAN-010); svar på forslag finnes.
- Kanseller før overlevering med konsekvensvisning (PS-LOAN-011).
- Tilby ansvarsoverføring til en medeier (PS-LOAN-009); svar finnes.
- Be miljøet om mekling og lenke til saken (PS-LOAN-018, WP-88).
- **Anmeldelse** etter avslutning: bare dimensjonene som kan vurderes, forklaringen om skjult periode, og ett tilsvar (UX-JRN-010, PS-TRUST-001–005).
- **Hjem:** lån der eier må bekrefte kontroll over tingen før nye lån, vises som ventende handling (hull fra WP-60).

**Avhenger av:** WP-80.

**Gjenstår etter beslutningene 9. oktober 2026** (designreferanse: [Lånets side og anmeldelser v1](../../design/L%C3%A5nbort%20-%20L%C3%A5nets%20side%20og%20anmeldelser%20v1.html)). Bygges i det vertikale sporet, ikke i designarbeidet:

- **Skade, mangel og tap (PS-LOAN-023).** Serverdelen er bygget 9. oktober 2026: `GET`/`POST /api/loans/[loanId]/condition` og `POST /api/loans/[loanId]/condition/[reportId]/answer` (se [servergrensen](server-boundary.md#skade-mangel-og-tap-ps-loan-023)). Lånets side er bygget samme dag: registreringene står i et eget kort under statuskortet med hvem som opplyste hva og motpartens ene svar («Jeg er uenig» / «Legg til min forklaring»), og «Meld skade, mangel eller tap» ligger under «Flere valg» mens det er tillatt. Motparten får et handlingsvarsel.
- **Medeierens avgrensede innsyn (UX-PRIV-013).** Serverdelen er bygget 9. oktober 2026: `loan.read_as_co_owner` (`GET /api/loans/[loanId]/co-owner-view`) gir medeiere i eierkretsen ved godkjenning og den som er spurt om ansvaret bare feltene regelen nevner og egne steg. Andre medeiere og tidligere medeiere får «finnes ikke», og partenes visning er uendret. Lånets side viser denne visningen når `loan.read` svarer «finnes ikke» (bygget samme dag): «Lån · Du er medeier», statuskortet med medeierens eget svar, og periode, vilkår, låntaker og ansvarlig utlåner. Ved uenighet og uavklart avslutning vises ingen steglinje, fordi den ville røpet hva partene har sagt.
- **Varsel når anmeldelser blir synlige (PS-TRUST-003).** Bygget 9. oktober 2026 på serveren: ett informasjonsvarsel per part og publisering, bare i appen som standard, som leder til `/lan/<id>#anmeldelser`. Anmeldelsesdelen på lånets side har `id="anmeldelser"`.
- **Tilsvar uten fritekst (PS-TRUST-005).** Appen tillater allerede dette; ingenting skal bygges.
- **Øvrige avvik i designreferansen:** «Kanseller» erstatter «Avlys» i appens tekster (bygget 9. oktober 2026, sammen med lånets side i Tomat, #91); «Avslutt lånet nå» under angrefristen (domenet støtter det); ny overleveringsdag under overleveringsavklaringen (UX-INT-001, domenet avviser i dag); en ventende ansvarsoverføring vises bare til utlåneren og medeieren (bygget i #91; låntakeren ser den bare når hen selv må godta).

## WP-88 — Saker og arbeidskø

**Leverer:** Saker i sin kontekst for partene og som arbeidskø for dem som har behandlingsansvar (UX-IA-007, PS-COM-010–015).

**Skjermer og flyter:**

- **Sakens side** (`/saker/[id]`): hva saken gjelder med kontekstmerke, status og hvem som behandler, partenes innlegg og forklaringsrunder (PS-COM-012), del forklaringer, og for behandleren: ta, slipp, overfør, erklær inhabilitet, eskaler, tiltak og lukk. Inhabil bruker får ikke behandlingshandlinger (UX-PRIV-006).
- **Egne saker** fra Konto, og saken lenket fra lånet, miljøet eller varselet den gjelder.
- **Miljøets kø** for administratorer, lenket fra miljøadministrasjonen (WP-85) og Hjem.
- **Rapporter og kontakt:** rapporter et objekt eller en person i et miljø eller til plattformen, og kontakt miljøets administratorer.
- **Privat melding som dokumentasjon** (WP-46): velg meldinger i samtalen og send en lesbar kopi med innlegget.
- Plattformforvalternes kø vises ikke før WebAuthn er bygget (OD-0023), fordi handlingene avvises til da.

**Avhenger av:** WP-80.

## WP-89 — Eiere på tingene i et miljø

**Leverer:** Eierens navn på tingene i et miljø, slik at medlemmer ser hvem de låner av og kan nå personen (PS-ENV-015, OD-0024).

**Skjermer og flyter:**

- Tingene på miljøets side, treff gjennom et miljø i Finn og tingens side sett gjennom et miljø viser eierne med navn, lenket til personens side der den er tilgjengelig (`PersonName`).
- **Server:** lesemodellene for tingene i et miljø får eierne som er aktive medlemmer av miljøet, med `profileId` (felles aktivt miljø gir allerede tilgang til profilen), og med samme historiske synlighet som medlemslisten (PS-ENV-009): eiere hvis publisering eller medlemskap stammer fra en strengere type, vises ikke for medlemmer som ikke kunne se dem da, før eieren har akseptert den nye typen. Passive medlemmers ting er allerede avpublisert. Negative tester for ikke-medlemmer, passive medlemmer og historisk skjulte eiere.

**Avhenger av:** WP-84.

## Senere

- Skjermstrukturen og navigasjonen som ble låst i UI-designets fase 2 (UX-IA-009–015) er ikke bygget ennå. I appen i dag går tilbakelenken til sidens faste område, ikke langs en stabel; varsler og e-postlenker åpner målet uten bygget stabel og merke; forespørselen og lånet er to sider; og skjemaet for låneforespørselen viser områdene. Dette bygges i det vertikale implementeringssporet fra designfase 4 ([UI-designplanen](../planning/ui-design-plan.md)).
- **Samtaler i Tomat (kjerneflyt 5).** Bygget 9. oktober 2026: samtalelisten med én rad per person, pågående lån og mottatte forespørsler under navnet, siste melding og «Ny melding» markert bare på enheten; samtalen med «Lån mellom dere», dager, ventende meldinger og plass igjen i lånelogistikk; «Om samtalen» med lån, profil, sikkerhetskode, kontaktens enheter (ADR-0010 punkt 4) og «Fjern fra mine samtaler»; liste og samtale side om side på store skjermer. Enhetsflytene i Tomat: «Slå på privat chat», kobling av ny enhet som en avgrenset oppgave med kode som lages med en gang, utløpt og mislykket kobling, «Mine enheter» med ventende enhet øverst og fjerning gjennom bekreftelsesark, godkjenning med skanning eller kode og «Ikke godkjenn», og tilbakestilling som egen side (`/samtaler/tilbakestill`) med kode fra e-post. Varsler om nye meldinger (PS-COM-018): ett varsel per samtale som teller nye meldinger og flyttes øverst til samtalen er åpnet, «Demp samtalen» i «Om samtalen», og «Privat chat» i Varslingsvalg med egne valg for appen (på) og e-post (av, sendt etter ti minutter hvis varselet fortsatt er ulest). Gjenstår: åpning av fri samtale fra en mottatt forespørsel eller et spørsmål om en ting (serveren og `/samtaler?med=` finnes, men ingen side lenker dit), lenken fra lånet til den private samtalen (UX-IA-014), start av samtale fra personens side, gjenopprettingsnøkkelen (PS-COM-019), overføring av tidligere meldinger ved kobling (ADR-0010 punkt 5) og en egen avvisning av en ventende enhet (i dag utløper den av seg selv). Privat chat er av for ekte brukere til Port C.
- Kort presentasjon og synlighetsvalg for andre profilfelt (PS-USR-002), når profilfeltene er fastsatt. Profilbildet er bygget, med eget synlighetsvalg, og vises som sirkel (PS-USR-002).
- Flatene [skjerm- og flytinventaret](../ux/08-skjerm-og-flytinventar.md#hull-flater-uten-ui-pakke) viser at ingen pakke bygger ennå: melding om mulig dødsfall, administratorenes oversikt over medlemmer og utestengte, og for privat chat varsel før utlogging, gjenopprettingsnøkkel og overføring av gammel historikk (ADR-0010).
