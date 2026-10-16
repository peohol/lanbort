# Informasjonsarkitektur og navigasjon

> **Status:** UX-modell v0.1. Skjermstrukturen og navigasjonen er låst i fase 2 av UI-designplanen, 7. oktober 2026 (UX-IA-009–015). Reglene for Hjem og varsler ble supplert 8. oktober 2026 (UX-IA-016–019), og hovedmenyens merker 16. oktober 2026 (UX-IA-022).

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

Profil, personvernvalg, konto, blokkeringer og varslingspreferanser åpnes fra brukeridentiteten/avataren og skal ikke oppta en permanent hovednavigasjonsplass. Konto er et eget lag over området brukeren er i (UX-IA-020).

### UX-IA-004 — Miljøer er kontekster, ikke et parallelt produkt
**Forankring:** UX-P02; VP-04; PS-ENV-001

Egne miljøer åpnes fra **Hjem**, og oppdagbare miljøer brukeren ikke er medlem av, finnes via **Finn**. Det er også hjemområdene deres når en direkte inngang må bygge en stabel (UX-IA-010). Inne i miljøet finnes objekter, medlemmer, regler og relevante administrasjonshandlinger uten at miljøet får egne varianter av kjernefunksjoner som lån eller profil.

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

## Skjermstruktur og navigasjon

Låst 7. oktober 2026 i fase 2 av [planen for UI-designfasen](../planning/ui-design-plan.md). Designreferansen er [`design/Fase 2 IA-retninger iterasjon 3.html`](../../design/Fase%202%20IA-retninger%20iterasjon%203.html), særlig 3a (hele kjernen på mobil) og 3b (regelen for direkte innganger). Referansen illustrerer reglene under. Ved tvil gjelder reglene, og referansen er aldri kilde til ny produktlogikk. Navn, datoer og eksempler i den er illustrasjoner.

### Konsolidert retning

Oppgavekø og stabel er grunnarkitekturen: Hjem er en prioritert handlingsflate, og detaljer legger seg i en stabel innenfor området brukeren startet i. Lånets side viser hele forløpet som en steglinje med nåværende steg som dominerende kort. Kontekstmerker og forklaringen «Du ser dette fordi …» viser konteksten. Ikke videreført fra de utforskede retningene: tingen som globalt anker, en vedvarende kontekstlinse, en stripe med pågående lån over områdene og detaljer som ark over listen.

Områdene:

- **Hjem:** «Venter på deg» med antall, «Kommer», «Uavklart», «Som administrator» med egen oppgavetelling og «Dine miljøer», i den rekkefølgen (UX-IA-016). Det som har et tidspunkt i dag, får fullt kort; resten er rader med handlingsverb, så køen er lett å skanne. Rollen står ved oppgaven og miljøet, ikke i en egen administratorflate (UX-PRIV-005, UX-PRIV-006). Når ingenting venter, er Hjem en rolig tomtilstand uten feed eller forslag (UX-IA-005).
- **Finn:** søk etter ting eller miljøer, med filtrene «Venner» og område. Treff viser ledighet og kontekst.
- **Lån:** én liste med filtrene «Alle», «Låner» og «Låner bort», gruppert i «Venter på deg», «Pågår og kommende» og «Venter på andre», med avsluttede lån bak en egen rad (UX-IA-006).
- **Mine ting:** egne og medeide ting med nåstatus og hvem de er synlige for, «Registrer en ting» og arkiverte ting bak en egen rad, uten egen overskrift over tingene, siden sidetittelen sier hva de er.
- **Samtaler:** én privat samtale per person, med de pågående lånene mellom dere (PS-COM-017), lånelogistikk-kanaler etter blokkering, én per lån (PS-COM-007), og hvor mange enheter som kan lese samtalene, med vei til «Mine enheter» i Konto.

### UX-IA-009 — Detaljer legges i en stabel i området brukeren startet i
**Forankring:** UX-P02, UX-P05, UX-P12, UX-P13

- De fem områdene er alltid synlige, som bunnmeny på mobil og sidekolonne på større skjerm, og markerer området brukeren startet i. Unntakene er avgrensede oppgaver (UX-IA-013) og Konto (UX-IA-020).
- Detaljer (ting, forespørsel, lån, person, miljø, samtale, administrativ kø og det som ligger i den) åpnes som en stabel innenfor det området. En person åpnet fra en ting i Finn ligger i Finn.
- Tilbake navngir forrige ledd i stabelen («‹ Kari Nordmann»). På større skjerm er brødsmulene den samme stabelen, og hvert ledd er klikkbart.
- Et trykk på et område går til områdets start. Åpner brukeren noe som allerede ligger i stabelen, går hen tilbake dit i stedet for å lage en løkke. En ting sett gjennom et miljø og den samme tingen sett direkte hos en venn er ulike ledd, så brødsmulene viser hvor brukeren kom fra (UX-IA-015).
- Større skjerm bruker samme modell med mer plass (UX-A11Y-001): liste og detalj vises side om side når brukeren kom fra en liste (Lån, Samtaler, Innmeldinger); åpnet fra Hjem eller en person får detaljen full bredde.

### UX-IA-010 — Hver flate har ett fast hjemområde
**Forankring:** UX-P02, UX-P13

Hjemområdet bestemmer stabelen når en direkte inngang må bygge en ny (UX-IA-011). Ellers legger detaljen seg i stabelen brukeren allerede er i (UX-IA-009).

| Flate                                               | Hjemområde                                                   |
| --------------------------------------------------- | ------------------------------------------------------------ |
| Lån og forespørsler                                 | Lån                                                          |
| Andres ting                                         | Finn; sett gjennom et miljø ligger tingen under miljøet       |
| Egne og medeide ting                                | Mine ting                                                    |
| Samtaler                                            | Samtaler                                                     |
| Egne miljøer                                        | Hjem                                                         |
| Oppdagbare miljøer brukeren ikke er medlem av       | Finn                                                         |
| Administrative køer (for eksempel innmeldinger)     | Hjem                                                         |
| Personer                                            | Hjem, bare når en direkte inngang må bygge en ny stabel      |
| Konto og det som åpnes derfra                       | Ingen; Konto er et eget lag (UX-IA-020)                      |

Flater som ikke står i tabellen, får hjemområde når de designes.

### UX-IA-011 — Direkte innganger bygger stabelen fra regelen
**Forankring:** UX-P02, UX-P08, UX-P11; PS-NFR-002

- Varsel, e-postlenke, delt lenke og push (når det finnes, OD-0004) er direkte innganger. De bygger stabelen fra regelen, aldri fra historikk: hjemområdet, eventuelt en fast beholder, og målet. Fast beholder brukes bare når målet ligger i en kø, for eksempel en innmelding i Innmeldinger.
- Tilbake og brødsmuler følger den bygde stabelen, ett ledd om gangen. Fra Hjem › Innmeldinger › innmeldingen går tilbake til Innmeldinger. «‹ Lån» betyr alltid Lån-oversikten, uansett hvor brukeren var før.
- Målet merkes «Åpnet fra varsel» eller «Åpnet fra e-post» til brukeren navigerer videre.
- Varslingssenteret er et lag, ikke et steg i stabelen (UX-IA-002). Å velge et varsel er en direkte inngang, og varslene åpnes igjen fra indikatoren.
- Varslingssenteret kan åpnes fra varselindikatoren, som har samme plassering i alle fem hovedområder og i detaljer i stabelen; indikatoren skjules bare i avgrensede oppgaver (UX-IA-013) og i Konto (UX-IA-020).
- Å lukke varslingssenteret returnerer til nøyaktig forrige skjerm, inkludert område, stabel, filter og rulleposisjon. Å velge et varsel bygger i stedet stabelen fra regelen, uavhengig av hvilken skjerm varslingssenteret ble åpnet fra.
- Har brukeren ikke lenger tilgang, vises samme nøytrale «finnes ikke eller ingen tilgang» i hjemområdet (UX-PRIV-002).

| Inngang                          | Bygget stabel                         | Tilbake           |
| -------------------------------- | ------------------------------------- | ----------------- |
| Varsel om at en ting er meldt returnert | Lån › lånet                    | ‹ Lån             |
| Varsel om en ny låneforespørsel  | Lån › forespørselen                   | ‹ Lån             |
| Varsel om innmeldinger i et miljø | Hjem › Innmeldinger                  | ‹ Hjem            |
| E-postlenke til én innmelding    | Hjem › Innmeldinger › innmeldingen    | ‹ Innmeldinger    |
| Delt lenke til en ting           | Finn › tingen                         | ‹ Finn            |
| Delt lenke til en person         | Hjem › personen                       | ‹ Hjem            |

### UX-IA-012 — Oppgaver på Hjem åpner arbeidsflaten direkte
**Forankring:** UX-P04, UX-P05, UX-P08

En oppgave på Hjem åpner flaten der oppgaven gjøres, med stabelen Hjem › arbeidsflaten: innmeldingene i et miljø, forespørselen som venter på svar, eller lånet der retur skal bekreftes. Miljø, person og ting ligger som lenker derfra, ikke som mellomsteg.

Handlingsknapper og oppgaverader på Hjem åpner den eksisterende arbeidsflaten; de gjennomfører aldri en bindende handling direkte. Knappeteksten beskriver hvor brukeren kommer, for eksempel «Gå til overleveringen» eller «Se forespørselen», ikke selve avgjørelsen på målsiden.

### UX-IA-013 — Et skjema er en avgrenset oppgave
**Forankring:** UX-P03, UX-P21; UX-JRN-004

Et skjema som sendes inn, for eksempel låneforespørselen, skjuler områdene og har synlige steg og «Avbryt». Skjemaet legges ikke i stabelen: etter innsending lander brukeren på resultatet (UX-INT-005), og tilbake derfra går dit skjemaet ble startet, for eksempel tingen.

### UX-IA-014 — Forespørsel og lån er ett forløp på én side
**Forankring:** UX-P02, UX-P04, UX-P16; PS-LOAN-001

- Steglinjen viser hele forløpet i fem steg: Forespurt, Reservert, Utlånt, Retur og Gjennomført. Forespørselen er første steg i samme forløp, og etter godkjenning skifter typeetiketten fra «Forespørsel» til «Lån» på samme side.
- «Nå»-kortet dominerer og bærer neste steg (UX-INT-001). Tidligere og kommende steg er én linje hver og kan åpnes (UX-IA-008).
- Under «Nå» ligger avtalen, motparten, samtalen, tidslinjen og «Flere valg». Samtalen er ikke en fane i lånet; lånet og samtalen lenker til hverandre.
- Et avvik overtar samme side og samme «Nå»-kort, og steget får et nøytralt avklaringsnavn, for eksempel «Overlevering avklares» (UX-EXC-001, UX-EXC-002).

### UX-IA-015 — Detaljer viser bare kontekst som har praktisk betydning
**Forankring:** UX-P11, UX-P13; PS-DOM-005, PS-DOM-007

Det skal være åpenbart av siden selv hva slags detalj brukeren er på. En typeetikett over tittelen brukes bare når den sier noe tittelen ikke sier, som «Forespørsel» eller «Lån» på samme side (UX-IA-014) eller hva slags sak det er, ikke «Ting», «Person» eller «Miljø». Hvor brukeren kom fra, vises i brødsmulene (UX-IA-009), ikke som merke eller forklaring på siden: en ting nådd fra et miljø har miljøet i brødsmulene, og ingen linje forklarer hvorfor brukeren ser den. Kontekstmerker («Via Borettslaget Lia», «Direkte mellom venner») og roller («Du handler som administrator») vises der konteksten avgjør hva brukeren kan gjøre eller hvilke regler som gjelder, som på forespørselens og lånets side (UX-PRIV-003). Brødsmuler og kontekstmerker erstatter en vedvarende kontekstlinse, så ingen skjult filtertilstand avgjør hva brukeren ser. Besluttet av Peder 15. oktober 2026 for å fjerne systeminformasjon uten praktisk betydning.

**Designreferanse for Hjem og varsler:** [Lånbort – Hjem og varsler v3](../../design/L%C3%A5nbort%20-%20Hjem%20og%20varsler%20v3.html). Besluttet 8. oktober 2026; navn og datoer i referansen er eksempler. Ved tvil gjelder reglene nedenfor.

### UX-IA-016 — Hjem har fast seksjonsrekkefølge, og tomme seksjoner skjules
**Forankring:** UX-P04, UX-P08, UX-P16; UX-IA-005

- Rekkefølgen er «Venter på deg» → «Kommer» → «Uavklart» → «Som administrator» → «Dine miljøer».
- En seksjon uten innhold vises ikke, heller ikke som overskrift. Unntaket er «Dine miljøer», som alltid står med hovedknappen «Opprett et miljø», like tydelig som «Registrer en ting» i Mine ting; uten miljøer står også «Finn miljøer». Seksjonsoverskriftene er store og har hvert sitt ikon, «Dine miljøer» miljøikonet, så det er lett å se hvilke valg Hjem gir (Peder 16. oktober 2026).
- På større skjermer kan seksjonene fordeles over flere kolonner, men lese- og tastaturrekkefølgen følger den faste seksjonsrekkefølgen.
- «Venter på deg» viser det brukeren selv skal gjøre, med antall.
- «Kommer» viser avtalte overleveringer og returer der ingen handling er påkrevd ennå.
- «Uavklart» viser viktige forhold der brukeren foreløpig venter på andre: avvik, forsinkelse, mekling og saker som står på vent.
- «Som administrator» har en egen oppgavetelling, atskilt fra personlige oppgaver. Den telles ikke med i «Venter på deg». Saker der administratoren selv er part, vises ikke her.

### UX-IA-017 — Én hendelse står ett sted på Hjem
**Forankring:** UX-P02, UX-P16; UX-IA-008

- Samme hendelse vises aldri i flere seksjoner på Hjem samtidig.
- Når status endres, flytter hendelsen mellom seksjonene og beholder relevant tidsinformasjon (for eksempel «Avtalt i dag» eller en svarfrist).
- Eksempel: En avtalt retur står i «Kommer»; når låntaker melder den returnert, flytter den til «Venter på deg» med «Avtalt i dag». Har brukeren svart på et avvik og venter på motparten, flytter det til «Uavklart» med samme frist.
- Lånets egen side og historikken påvirkes ikke av regelen.

### UX-IA-018 — Gruppering skjuler aldri det tidskritiske
**Forankring:** UX-P08, UX-P16

- Mange oppgaver av samme type kan samles i én rad med antall og inngang til hver enkelt oppgave.
- Oppgaver med frist eller avtale i dag vises alltid som egne, fullverdige kort og samles aldri.
- I varslingssenteret kan eldre, leste varsler fra samme låneforløp samles til én rad med siste hendelse. Nye og påkrevde varsler om forløpet står alltid for seg.

### UX-IA-019 — Lest er ikke det samme som håndtert
**Forankring:** UX-P08; PS-COM-002, PS-COM-003

- Varselindikatoren viser antall uleste varsler, og tallet er det samme i alle områder. Hovedmenyen viser ikke dette tallet; den viser hva som er nytt i hvert område (UX-IA-022).
- Et varsel markeres som lest når brukeren åpner det eller velger «Marker som lest», uavhengig av om oppgaven er fullført.
- En oppgave forsvinner fra Hjem først når den er håndtert og serveren har bekreftet den nye tilstanden.
- Er handlingen allerede gjort et annet sted, viser varselet utfallet (for eksempel «Du godtok forespørselen») og oppfordrer ikke til handlingen igjen.
- Gjelder varselet noe som ikke lenger finnes, for eksempel en venneforespørsel som er trukket, står varselet igjen og sier at det ikke lenger gjelder, uten grunn og uten handling (PS-USR-011).

### UX-IA-020 — Konto er et fullskjerms lag med egen stabel
**Forankring:** UX-P02, UX-P05, UX-P13; UX-IA-003; OD-0031

- Konto åpnes fra profilbildet øverst, som har samme plassering i alle fem hovedområder og i detaljer i stabelen. På mobil dekker laget hele skjermen, også bunnmenyen.
- Det som åpnes fra Konto, for eksempel Venner, Blokkerte, Mine enheter og egne saker, legger seg i Kontos egen stabel. Tilbake navigerer innenfor Konto og navngir forrige ledd («‹ Venner»).
- En person åpnet fra Konto åpnes på sin egen, selvstendige side utenfor laget. Tilbake fra personen fører til Konto-siden den ble åpnet fra, slik den var.
- Mine enheter og stegene derfra er sider i privat chat med egne sikkerhetsregler (ADR-0010 punkt 13). De lastes derfor på nytt når de åpnes, og skjermen under lastes på nytt når de lukkes.
- «Lukk» finnes på alle nivåer i Konto og returnerer til nøyaktig skjermen brukeren kom fra, inkludert område, stabel, filter, utfylte felt og rulleposisjon, som når varslingssenteret lukkes (UX-IA-011).
- Konto er ikke et steg i områdets stabel, og varselindikatoren vises ikke i Konto. Områdene og varslene nås igjen med «Lukk».
- Utformingen på større skjerm avgjøres i den visuelle retningen; navigasjonsreglene over gjelder uendret.

### UX-IA-021 — Ting vises likt overalt, gruppert etter kategori
**Forankring:** UX-P04, UX-P16; PS-OBJ-006, PS-OBJ-020; Peder 15. oktober 2026

- Et tingkort ser likt ut overalt der brukeren finner ting: i et miljø, på en venns side og i treff fra Finn eller «Søk i …». Kortet har bildet til venstre, navnet, eierens profilbilde og navn (eller «Din ting») og om tingen er ledig. Kortet sier ikke hvor tingen er funnet; det sier siden.
- Ting i en liste vises under kategorien som overskrift, i kategorienes egen rekkefølge. En kategori uten ting vises ikke. Innenfor en kategori står tingene alfanumerisk etter første bokstav eller tall i navnet, med tall etter verdi og æ, ø, å sist.
- Der brukeren finner ting, kan listen avgrenses til én eller flere kategorier og til «Ledig nå» eller «Ledig snart» (ledig nå eller innen 14 dager). Et valg vises bare når det ville endret listen. Valgene står i adressen, så de er der fortsatt når brukeren går tilbake fra en ting.
- En liste viser opptil 200 ting, de nyeste. Har miljøet flere, sier listen det og viser til søket.
- Mine ting grupperes på samme måte, men kortene der viser hvor tingen vises og eierens egen status.

### UX-IA-022 — Hovedmenyen viser hva som er nytt siden sist
**Forankring:** UX-P08, UX-P16; UX-IA-005, UX-IA-019; Peder 16. oktober 2026

- Et menyvalg har et merke med antall når noe har skjedd i området siden brukeren sist åpnet områdets egen side. Merket står ved ikonet, er det samme på mobil og større skjerm, og antallet står også i lenkens navn («Samtaler, 2 nye»).
- Merket nullstilles når brukeren åpner området fra menyen, også om ingenting er lest eller håndtert. Det er likt på alle brukerens enheter.
- Det som telles, er det et varsel gjelder, og bare der områdets egen side viser det:
  - **Hjem:** ting som venter på brukeren eller kommer neste, saker som venter i køen til miljøer brukeren administrerer, og nye miljøer brukeren er blitt medlem av.
  - **Lån:** lån og forespørsler det har skjedd noe med, hvert lån én gang fra forespørselen til anmeldelsene.
  - **Mine ting:** invitasjoner til å bli medeier.
  - **Samtaler:** samtaler med nye meldinger. En dempet samtale, eller nye meldinger brukeren har valgt å ikke få varsel om i appen, gir ikke merke.
  - **Finn** har ikke merke: der skjer ingenting for én bruker.
- Samme hendelse kan gi merke i flere områder, for eksempel en ny låneforespørsel på Hjem og i Lån. Et varsel brukeren allerede har åpnet eller markert som lest, er ikke nytt noe sted.
- Merket er en påminnelse, ikke en oppgaveliste: det som venter på brukeren, står fortsatt på Hjem til det er håndtert (UX-IA-019).

### Krav som ikke endrer strukturen

Ukjent nettverksutfall (UX-INT-006) og ansvarserklæringen ved direkte vennelån (PS-LOAN-003, UX-JRN-006) er fortsatt krav. De er tilstander i låneforespørselen og godkjenningen og endrer ikke strukturen over. De designes i kjerneflyten i fase 4.

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
