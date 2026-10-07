# Informasjonsarkitektur og navigasjon

> **Status:** UX-modell v0.1. Skjermstrukturen og navigasjonen er låst i fase 2 av UI-designplanen, 7. oktober 2026 (UX-IA-009–015).

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

- **Hjem:** «Venter på deg» med antall, «Kommer», «Som administrator» og «Dine miljøer», i den rekkefølgen. Det som har et tidspunkt i dag, får fullt kort; resten er rader med handlingsverb, så køen er lett å skanne. Rollen står ved oppgaven og miljøet, ikke i en egen administratorflate (UX-PRIV-005, UX-PRIV-006). Når ingenting venter, er Hjem en rolig tomtilstand uten feed eller forslag (UX-IA-005).
- **Finn:** søk etter ting eller miljøer, med filtrene «Venner» og område. Treff viser ledighet og kontekst.
- **Lån:** én liste med filtrene «Alle», «Låner» og «Låner bort», gruppert i «Venter på deg», «Pågår og kommende» og «Venter på andre», med avsluttede lån bak en egen rad (UX-IA-006).
- **Mine ting:** egne og medeide ting med nåstatus og hvem de er synlige for, «Registrer» og arkiverte ting bak en egen rad.
- **Samtaler:** samtaler med hva de gjelder («Om lånet: Stige» eller «Privat samtale») og «Mine enheter».

### UX-IA-009 — Detaljer legges i en stabel i området brukeren startet i
**Forankring:** UX-P02, UX-P05, UX-P12, UX-P13

- De fem områdene er alltid synlige, som bunnmeny på mobil og sidekolonne på større skjerm, og markerer området brukeren startet i. Unntaket er avgrensede oppgaver (UX-IA-013).
- Detaljer (ting, forespørsel, lån, person, miljø, samtale, administrativ kø og det som ligger i den) åpnes som en stabel innenfor det området. En person åpnet fra en ting i Finn ligger i Finn.
- Tilbake navngir forrige ledd i stabelen («‹ Kari Nordmann»). På større skjerm er brødsmulene den samme stabelen, og hvert ledd er klikkbart.
- Et trykk på et område går til områdets start. Åpner brukeren noe som allerede ligger i stabelen, går hen tilbake dit i stedet for å lage en løkke.
- Større skjerm bruker samme modell med mer plass (UX-A11Y-001): liste og detalj vises side om side når brukeren kom fra en liste (Lån, Samtaler, Innmeldinger); åpnet fra Hjem eller en person får detaljen full bredde.

### UX-IA-010 — Hver flate har ett fast hjemområde
**Forankring:** UX-P02, UX-P13

Hjemområdet bestemmer stabelen når en direkte inngang må bygge en ny (UX-IA-011). Ellers legger detaljen seg i stabelen brukeren allerede er i (UX-IA-009).

| Flate                                               | Hjemområde                                                   |
| --------------------------------------------------- | ------------------------------------------------------------ |
| Lån og forespørsler                                 | Lån                                                          |
| Andres ting                                         | Finn                                                         |
| Egne og medeide ting                                | Mine ting                                                    |
| Samtaler                                            | Samtaler                                                     |
| Egne miljøer                                        | Hjem                                                         |
| Oppdagbare miljøer brukeren ikke er medlem av       | Finn                                                         |
| Administrative køer (for eksempel innmeldinger)     | Hjem                                                         |
| Personer                                            | Hjem, bare når en direkte inngang må bygge en ny stabel      |

Flater som ikke står i tabellen, får hjemområde når de designes.

### UX-IA-011 — Direkte innganger bygger stabelen fra regelen
**Forankring:** UX-P02, UX-P08, UX-P11; PS-NFR-002

- Varsel, e-postlenke, delt lenke og push (når det finnes, OD-0004) er direkte innganger. De bygger stabelen fra regelen, aldri fra historikk: hjemområdet, eventuelt en fast beholder, og målet. Fast beholder brukes bare når målet ligger i en kø, for eksempel en innmelding i Innmeldinger.
- Tilbake og brødsmuler følger den bygde stabelen. «‹ Lån» betyr alltid Lån-oversikten, uansett hvor brukeren var før.
- Målet merkes «Åpnet fra varsel» eller «Åpnet fra e-post» til brukeren navigerer videre.
- Varslingssenteret er et lag, ikke et steg i stabelen (UX-IA-002). Å velge et varsel er en direkte inngang, og varslene åpnes igjen fra indikatoren.
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

### UX-IA-013 — Et skjema er en avgrenset oppgave
**Forankring:** UX-P03, UX-P21; UX-JRN-004

Et skjema som sendes inn, for eksempel låneforespørselen, skjuler områdene og har synlige steg og «Avbryt». Skjemaet legges ikke i stabelen: etter innsending lander brukeren på resultatet (UX-INT-005), og tilbake derfra går dit skjemaet ble startet, for eksempel tingen.

### UX-IA-014 — Forespørsel og lån er ett forløp på én side
**Forankring:** UX-P02, UX-P04, UX-P16; PS-LOAN-001

- Steglinjen viser hele forløpet i fem steg: Forespurt, Reservert, Utlånt, Retur og Gjennomført. Forespørselen er første steg i samme forløp, og etter godkjenning skifter typeetiketten fra «Forespørsel» til «Lån» på samme side.
- «Nå»-kortet dominerer og bærer neste steg (UX-INT-001). Tidligere og kommende steg er én linje hver og kan åpnes (UX-IA-008).
- Under «Nå» ligger avtalen, motparten, samtalen, tidslinjen og «Flere valg». Samtalen er ikke en fane i lånet; lånet og samtalen lenker til hverandre.
- Et avvik overtar samme side og samme «Nå»-kort, og steget får et nøytralt avklaringsnavn, for eksempel «Overlevering avklares» (UX-EXC-001, UX-EXC-002).

### UX-IA-015 — Detaljer viser type, kontekst og hvorfor brukeren ser dem
**Forankring:** UX-P11, UX-P13; PS-DOM-005, PS-DOM-007

Hver detalj har en typeetikett (Ting, Forespørsel, Lån, Person, Miljø, Samtale) og et kontekstmerke («Via Borettslaget Lia», «Direkte mellom venner») eller en rolle («Du handler som administrator»). Der synligheten avhenger av kontekst, forklarer én linje hvorfor («Du ser tingen fordi du er medlem i Borettslaget Lia»). Kontekstmerker og forklaringer erstatter en vedvarende kontekstlinse, så ingen skjult filtertilstand avgjør hva brukeren ser.

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
