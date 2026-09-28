# Tillit, anmeldelser og moderering

> **Status:** Førsteutkast. Ambisjonen om å bygge tillit er sentral. De konkrete skårings- og vektingsmekanismene er hypoteser og skal ikke behandles som ferdig design.

## Formål

Lånbort skal gjøre det lettere å ta informerte valg om hvem man vil låne til og fra, uten å late som en enkel tallskår kan beskrive et menneske fullstendig.

Tillitsmekanismene skal:

- belønne ansvarlig deling
- gjøre gode erfaringer synlige
- gi relevant informasjon om problemer
- redusere effekten av åpenbart skjeve eller misbrukte vurderinger
- unngå unødvendig sosial rangering

## Anmeldelse etter et fullført lån

Når et lån er avsluttet, skal begge parter kunne vurdere opplevelsen.

### Utlåners perspektiv

Foreløpige dimensjoner:

- om låntaker hentet til avtalt tid
- om objektet ble levert tilbake til avtalt tid
- om objektets tilstand ved retur var rimelig
- hvordan kommunikasjonen fungerte

### Låntakers perspektiv

Foreløpige dimensjoner:

- om utlåner gjorde objektet tilgjengelig til avtalt tid
- om utlåner var tilgjengelig for avtalt tilbakelevering
- om objektets faktiske tilstand stemte med beskrivelsen
- hvordan kommunikasjonen fungerte

Begge kan i tillegg få mulighet til å skrive en fritekstkommentar.

## Skala

Det opprinnelige forslaget er 1–5 på relevante dimensjoner.

Forslaget sier også at:

- 5/5 kan være tilstrekkelig uten ytterligere forklaring
- 4/5 eller lavere krever at brukeren beskriver hva som kunne vært bedre

Dette er **ikke ferdig besluttet**.

Et krav om begrunnelse ved alle skårer under 5 kan ha utilsiktede effekter: 4/5 kan oppleves som en god vurdering, og tvungen negativ begrunnelse kan gjøre vurderingssystemet mer konfliktfylt enn ønsket.

Dette bør undersøkes i neste visjonsrunde.

## Synlighet og tidspunkt

Visjonen må avklare:

- om vurderinger publiseres umiddelbart eller først når begge har vurdert / en frist har gått
- om fritekst er offentlig, privat eller delt bare med motparten
- om vurderinger kan redigeres
- om brukeren kan svare på en omtale
- hvordan hevn-anmeldelser skal motvirkes

## Uvanlig negative anmeldelsesmønstre

Det opprinnelige notatet foreslår at appen over tid analyserer hvordan en person vurderer andre.

Tanken er:

- en bruker som systematisk gir vesentlig dårligere skårer enn andre, kan få privat tilbakemelding om mønsteret
- dersom mønsteret er ekstremt og datagrunnlaget er tilstrekkelig, kan brukerens vurderinger få mindre vekt i andres samlede skår

Dette er foreløpig en **hypotese**, ikke en fast regel.

En slik mekanisme må være robust mot blant annet:

- få observasjoner
- reelle forskjeller mellom miljøer og situasjoner
- at en bruker faktisk har hatt flere dårlige erfaringer
- strategisk manipulering
- skjevheter i hvem som vurderer hvem
- manglende forståelighet dersom en skår justeres «i det skjulte»

Eventuell vekting må være transparent nok til at systemet kan forsvares og forklares.

## Flerdimensjonal brukerskår

Visjonen skisserer flere mulige dimensjoner.

### Gavmildhet

Skal reflektere positiv deltakelse som utlåner, for eksempel:

- hvor mange vellykkede utlån brukeren har gjennomført
- eventuelt hvor mange forskjellige objekter brukeren faktisk deler

Det må unngås at personer med mange eiendeler automatisk fremstår «bedre» enn andre.

### Pålitelighet

Skal oppsummere relevante erfaringer fra andre brukere.

Denne bør ikke være et naivt gjennomsnitt dersom datagrunnlaget er lite eller inneholder ekstreme vurderinger.

### Bidrag gjennom lån

Det opprinnelige notatet vurderer en egen dimensjon for det å låne i stedet for å kjøpe.

Tanken er at også låntakeren bidrar til delingsøkonomien ved å bruke eksisterende ressurser fremfor å kjøpe nytt.

Navn, betydning og om denne skåren faktisk bør finnes, er åpent.

## Skårer som tilgangsfilter

En foreløpig idé er at brukere kan angi:

- en nedre pålitelighetsgrense for hvem som får se dem og objektene deres
- en annen grense for hvilke brukere og objekter de selv ønsker å se

Dette gir stor brukerkontroll, men kan også skape kompliserte eller selvforsterkende eksklusjonsmekanismer.

Før dette blir del av den endelige visjonen, må vi avklare:

- hvordan nye brukere uten historikk behandles
- om en numerisk skår bør kontrollere synlighet så direkte
- hvordan en bruker forstår hvorfor noe ikke vises
- hvordan blokkering, miljømedlemskap og aktive lån påvirkes

## Rapportering

Brukere skal kunne rapportere:

- andre brukere
- objekter
- problematisk adferd
- manglende tilbakelevering
- innhold som bryter med miljøets regler
- mulig ulovlig eller farlig innhold

Rapportering skal ikke i seg selv innebære skyld. Det skal starte en passende vurderingsprosess.

## Moderering på miljønivå

Administratorer skal kunne håndtere forhold som primært angår eget miljø.

De kan blant annet:

- vurdere objekter før publisering dersom miljøet har aktivert dette
- behandle enkelte konflikter
- rapportere alvorlige objekter eller brukere videre

## Moderering på plattformnivå

Alvorlige eller gjentatte problemer kan kreve plattformomfattende vurdering.

Visjonen åpner for at plattformforvaltere kan varsles ved sterke mønstre av negative hendelser eller få rapporter til behandling.

Dette må utformes slik at automatiske signaler brukes som grunnlag for vurdering, ikke som automatisk dom.

## Tillit versus sosial rangering

Et sentralt designprinsipp for videre arbeid bør være at tillitssystemet skal hjelpe mennesker med konkrete utlånsbeslutninger, ikke skape en generell popularitetskonkurranse.

Skårer og badges bør derfor bare eksistere når de har en tydelig funksjon i tryggere eller bedre deling.

## Åpne spørsmål

Se [Åpne spørsmål](open-questions.md), særlig om anmeldelsestidspunkt, synlighet, vekting, nye brukere, misbruk, skårer og modereringsgrenser.