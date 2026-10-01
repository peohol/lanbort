# Kommunikasjon, varsler og saker

> **Status:** Produktvisjon v1.0. Skillet mellom varsler, privat chat, administratorkontakt og formelle saker er avklart.

## Tre forskjellige kommunikasjonsformer

Lånbort skal ikke bruke én universell «innboks» til alt.

Produktet trenger minst tre forskjellige konsepter:

1. **Varsler** – gjør brukeren oppmerksom på relevante hendelser.
2. **Chat** – løpende samtale mellom brukere.
3. **Saker og forespørsler** – strukturert kommunikasjon når det finnes en prosess, beslutning eller konflikt som må håndteres.

Forskjellen er viktig fordi forventningene til tilgjengelighet, historikk, personvern og respons er ulike.

## Varsler

Appen skal ha et eget varslingssenter.

Nye eller uleste varsler skal være lett synlige, for eksempel med en badge.

Eksempler på hendelser som kan gi varsel:

- låneforespørsel mottatt
- låneforespørsel godkjent eller avslått
- kommende eller utløpt låneperiode
- behov for å bekrefte tilbakelevering
- problem eller avvik meldt etter en returbekreftelse
- endring av et objekt man har relevant interesse i
- objekt man abonnerer på blir tilgjengelig
- invitasjon til miljø eller administratorrolle
- innmeldingsforespørsel som krever behandling
- ny melding i relevant chat eller sak
- rapport eller modereringshendelse som krever handling

## Varslingspreferanser

Lånbort skal skille mellom at en hendelse **finnes i appen** og at brukeren blir aktivt avbrutt med for eksempel pushvarsel eller e-post.

Varsler deles foreløpig i tre nivåer:

### Påkrevde varsler

Dette gjelder sikkerhets- og kontohendelser samt viktige hendelser i et allerede godkjent eller aktivt lån, for eksempel:

- kansellering eller forslag til endring av et godkjent lån
- kommende returtid
- passert returtid
- behov for returavklaring
- konflikthendelser eller andre vesentlige avvik
- kritiske sikkerhets- eller kontohendelser

Disse hendelsene skal ikke kunne skjules helt fra brukeren. Brukeren kan i stor grad få kontroll over kanalvalg, men Lånbort må kunne gjøre hendelsen tydelig tilgjengelig og ved behov varsle gjennom en egnet kanal.

### Vanlige handlingsvarsler

Dette omfatter for eksempel:

- ny låneforespørsel
- venneforespørsel
- invitasjon
- ny privat melding
- andre hendelser som normalt krever eller inviterer til en handling

Hendelsen skal være synlig i appen, mens push- og e-postvarsler skal kunne slås av.

### Informasjonsvarsler

Dette omfatter for eksempel:

- objekt man følger blir tilgjengelig
- endringer i objekter man abonnerer på
- generell aktivitet uten tidskritisk handlingsbehov

Disse skal kunne slås helt av og konfigureres relativt fritt.

### Systemhendelser påvirkes ikke av varslingsvalg

Varslingspreferanser skal bare styre hvordan brukeren gjøres oppmerksom på en hendelse.

De skal ikke endre selve systemtilstanden eller konsekvensen av hendelsen. Et lån kan for eksempel fortsatt bli markert som avventer returavklaring eller forsinket selv om brukeren har slått av pushvarsler.

## Direktemeldinger mellom brukere

Venner skal kunne starte vanlig direktemeldingschat.

For brukere som ikke er venner, skal fri chat ikke kunne startes vilkårlig. Kontakt må først ha en legitim kontekst, for eksempel et konkret objekt eller en låneforespørsel.

Den første kontakten kan være en strukturert henvendelse.

Mottakeren skal kunne velge om det åpnes for videre fri samtale.

Før dette skal avsenderen ikke kunne sende en strøm av nye fritekstmeldinger.

Lånbort skal ikke bruke lesebekreftelser i vanlig privat chat. Dette gjelder både mellom venner og i privat samtale rundt lån.

Hvis én part blokkerer den andre mens et reservert eller aktivt lån fortsatt finnes, skal vanlig fri chat stenges. Blokkeringen opphever likevel ikke eksisterende forpliktelser.

Nødvendig oppfølging skal primært skje gjennom strukturerte lånehandlinger. Fordi praktiske situasjoner ikke alltid kan modelleres som egne knapper, kan partene i tillegg få tilgang til en **snever lånelogistikk-kanal** så lenge det konkrete lånet krever praktisk oppfølging.

Denne kanalen:

- er tydelig adskilt fra ordinær privat chat
- kan brukes til korte praktiske meldinger om overlevering, retur, tidspunkt, sted og selve objektet
- skal ikke fungere som en omvei rundt blokkering eller som gjenåpnet sosial kontakt
- trenger ikke støtte alle funksjoner fra vanlig chat, for eksempel vedlegg, bilder eller andre rike meldingsformer
- stenges når lånet er avsluttet eller ikke lenger krever praktisk oppfølging

Hvis en part bruker logistikk-kanalen til trakassering, eller det finnes en annen særskilt sikkerhetsgrunn, kan også denne fritekstkanalen stenges. Da må videre oppfølging skje gjennom strukturerte lånehandlinger og eventuelle relevante saks- eller administrative prosesser.

## Strukturert innhold i chat

Chatten skal kunne inneholde mer enn tekst.

Strukturerte meldinger kan representere hendelser eller handlinger som:

- låneforespørsel
- godkjenning eller avslag
- endring av tidspunkt
- bekreftelse av tilbakelevering
- melding om problem etter en returbekreftelse
- lenke til et objekt eller et lån

Slike meldinger kan ha knapper og andre kontroller når det gir mening.

Målet er at viktige avtaler ikke bare skal finnes som ustrukturert tekst som systemet ikke forstår.

## Ingen lesebekreftelser i privat chat

Vanlig privat chat skal **ikke** vise om eller når mottakeren har lest en melding.

Dette gjelder:

- chat mellom venner
- privat fritekst rundt et konkret lån
- første kontakt som senere åpnes for fri samtale

Formålet er å redusere sosialt press og unngå å gjøre lesing til et signal om samtykke, forståelse eller ansvar.

Strukturerte handlinger skal i stedet ha egne eksplisitte systemstatuser når det er nødvendig. Eksempler:

- en låneforespørsel kan være «venter på svar», «godkjent» eller «avslått»
- et forslag om forlengelse kan være «venter på godkjenning», «godkjent» eller «avslått»
- en returbekreftelse kan være registrert som en konkret hendelse

At en privat melding er åpnet skal aldri i seg selv tolkes som at brukeren har akseptert eller tatt stilling til innholdet.

## Fjerning av chat fra egen visning

Lånbort skal ikke bruke «slett chat» som betegnelse når handlingen bare påvirker den ene brukerens egen visning.

Brukeren skal i stedet kunne velge en handling som **«Fjern fra mine samtaler»** eller **«Skjul samtale»**.

Denne handlingen:

- fjerner samtalen fra brukerens egen vanlige samtaleliste
- påvirker ikke den andre deltakerens historikk eller visning
- gir ikke brukeren rett til å slette den andre partens meldinger
- sletter ikke automatisk de underliggende felles dataene
- kan være reversibel i praksis ved at samtalen dukker opp igjen dersom den andre parten sender en ny melding

Lånbort skal foreløpig ikke ha en generell «slett for alle»-funksjon for privat chat. Dette er særlig viktig når samtalen er knyttet til et lån eller annen felles historikk.

Faktisk sletting, anonymisering eller annen behandling av underliggende data skal håndteres separat gjennom reglene for datalivssyklus, kontosletting, personvern og eventuelle juridiske oppbevaringsbehov.

### Når den andre deltakeren sletter kontoen

Permanent sletting av den ene kontoen skal ikke automatisk fjerne den andre deltakerens legitime kopi av felles samtalehistorikk. Samtalen kan bestå så lenge de generelle oppbevaringsreglene gir grunnlag for det.

Den slettede brukerens aktive profil skal ikke bestå gjennom chatten. Navn, profilbilde og profillenke skal derfor som hovedregel erstattes med en nøytral historisk identitet som **«Tidligere bruker»** når konkret identitet ikke lenger er nødvendig. Dette innebærer ikke at gamle meldinger omskrives; det gjelder hvordan den tidligere kontoen representeres i brukerflaten.

## Kontakt med administratorene i et miljø

Et medlem skal kunne kontakte **administratorene som funksjon**, ikke bare sende privat melding til en bestemt person som tilfeldigvis er administrator.

Denne samtalen skal derfor være knyttet til miljøets administrasjon og **tilhøre miljøfunksjonen, ikke den enkelte administratoren som behandler den**.

Alle administratorer med riktig rolle kan i utgangspunktet finne samtalen. Én administrator kan «ta» den og bli ansvarlig saksbehandler og primær mottaker av nye varsler.

Tildelingen til en bestemt administrator er midlertidig:

- administratoren kan frivillig frasi seg eller overføre ansvaret
- hvis administratoren mister administratorrollen, forlater miljøet, får kontoen deaktivert eller slettet, eller på annen måte ikke lenger kan behandle henvendelsen, skal tildelingen opphøre
- samtalen går da tilbake til en felles administrativ kø uten ansvarlig administrator
- øvrige administratorer varsles og en annen administrator kan ta over
- medlemmet skal ikke måtte starte en ny samtale

Hele eksisterende samtale- og hendelseshistorikken følger administratorkontakten. Internt skal det være mulig å se at ansvaret ble overført og hvorfor.

En tidligere administrator skal miste tilgangen når administratorrollen opphører; historikken forblir hos miljøets administrasjon.

Hvis miljøet midlertidig står uten administratorer, kan kontakten bli liggende utilordnet. Brukeren skal få tydelig beskjed om at ingen administrator for øyeblikket kan behandle henvendelsen. Dersom en ny administrator eller eier etableres, kan kontakten tas opp igjen.

Hvis miljøet går til avvikling, skal uavsluttede administratorkontakter kunne avsluttes på en kontrollert måte. De skal ikke automatisk eskaleres til plattformforvalter bare fordi miljøet mangler administrator.

Dette skal holdes adskilt fra vanlig privat chat mellom to brukere.

## Melding om mulig dødsfall eller varig utilgjengelighet

Fra en relevant brukerprofil eller et konkret felles forhold skal det finnes en strukturert handling for å melde at en bruker kan være død eller varig utilgjengelig.

Dette skal ikke være en fri melding som direkte endrer kontostatus. Handlingen oppretter en konfidensiell sak hos plattformforvalter med tydelig informasjon om at:

- meldingen bare starter en verifikasjonsprosess
- kontoen ikke automatisk blir deaktivert eller slettet
- melderen ikke får tilgang til brukerens konto eller private informasjon
- nødvendig dokumentasjon kan bli etterspurt
- bevisst falske meldinger kan behandles som misbruk

Saken skal holdes adskilt fra ordinære lånetvister og fra vanlig rapportering av regelbrudd. Bare autoriserte plattformforvaltere skal kunne behandle den.

## Saker og prosessmeldinger

En sak brukes når kommunikasjonen er del av en styrt prosess, for eksempel:

- behandling av en innmeldingsforespørsel
- konflikt om tilbakelevering
- moderering eller rapportering

Saker skal kunne styre hvem som kan skrive når.

Eksempelvis kan en part få skrive ett første innlegg, og deretter måtte vente til saksbehandleren åpner for et nytt svar.

Dette gjør det mulig å samle forklaringer uavhengig og redusere press eller gjensidig påvirkning.

## Saksbehandler

En sak kan kunne «tas» av en administrator eller plattformforvalter.

Når én saksbehandler tar ansvar:

- vedkommende blir primært ansvarlig for oppfølging
- andre med riktig rolle kan fortsatt ha nødvendig innsyn
- saken og handlingene skal kunne spores i ettertid

Saken tilhører funksjonen og den relevante organisatoriske konteksten, ikke den enkelte saksbehandleren. Hvis saksbehandleren mister rollen eller blir utilgjengelig, skal tildelingen kunne opphøre og saken overtas av en annen autorisert person uten at historikken eller saksforløpet brytes.

Den konkrete tilgangsmodellen avhenger av sakstype.

## Separate forklaringer ved konflikt

Ved enkelte konflikter skal partene i første omgang kunne skrive sin versjon uten å se den andres.

Formålet er ikke hemmelighold for sin egen skyld, men å få frem selvstendige beskrivelser før partene eventuelt påvirkes av hverandre.

Saksbehandleren kan senere kommunisere separat med partene og eventuelt åpne nye svarrunder.

Ved en miljøbasert lånetvist er administratoren **mekler, ikke dommer**. Saksprosessen skal støtte kommunikasjon og dokumentasjon, men ikke gi administratoren myndighet til å fastsette skyld, erstatningsansvar eller andre bindende privatrettslige konsekvenser.

## Ende-til-ende-kryptering

Lånbort skal skille tydelig mellom **privat part-til-part-kommunikasjon** og kommunikasjon som er del av en administrativ eller formell prosess.

### Privat chat

Vanlig privat chat mellom to brukere skal som produktmål være **ende-til-ende-kryptert**.

Det samme gjelder fritekst og private vedlegg i samtalen rundt et konkret lån mellom utlåner og låntaker.

At et lån oppstod gjennom et miljø skal ikke gi miljøadministratorer tilgang til den private samtalen mellom partene.

### Strukturerte lånehendelser

Strukturerte hendelser i låneforløpet er systemdata, ikke private chatmeldinger.

Dette omfatter blant annet:

- låneforespørsel
- godkjenning eller avslag
- avtalt låneperiode
- endringer som begge parter har godkjent
- returbekreftelser
- lånestatus og andre strukturerte hendelser

Lånbort må kunne behandle slike data for å gjennomføre selve lånefunksjonen, selv om privat fritekst rundt hendelsene er ende-til-ende-kryptert.

### Administrative samtaler og saker

Kommunikasjon som uttrykkelig sendes til en administrativ funksjon skal kunne leses av de autoriserte personene som skal behandle saken.

Dette gjelder blant annet:

- innmeldingsforespørsler og tilhørende dialog
- kontakt med administratorgruppen i et miljø
- meklingssaker knyttet til miljøbaserte lån
- rapporter og modereringssaker
- kommunikasjon med plattformforvaltere

Slik kommunikasjon skal fortsatt ha sterk konfidensialitet og streng tilgangskontroll, men den kan ikke behandles som klassisk ende-til-ende-kryptering bare mellom to private brukere når selve formålet er at en autorisert tredjepart skal lese innholdet.

### Ingen automatisk åpning av privat chat ved konflikt

Hvis det oppstår en konflikt om et miljøbasert lån, skal en administrator **ikke automatisk få tilgang til den private lånechatten**.

Partene skal i stedet selv sende inn:

- sin forklaring
- relevante opplysninger
- eventuelle meldinger, skjermbilder eller annet materiale de ønsker å bruke i saken

På denne måten kan administrativ mekling gjennomføres uten at medlemskap i et miljø innebærer at administratorene senere kan åpne medlemmenes private samtaler.

Den konkrete kryptografiske implementasjonen hører til senere sikkerhets- og arkitekturarbeid, men disse tilgangsgrensene er en del av produktvisjonen.

## Blokkering under åpne saker

Blokkering mellom brukere skal ikke avslutte eller skjule en meklings-, modererings- eller annen formell sak som allerede eksisterer.

Partene beholder den tilgangen som følger av saksrollen, mens vanlig privat chat og annen generell kontakt fortsatt kan være blokkert. Saksflaten skal ikke brukes som omvei til fri direktekontakt.

Hvis en bruker både rapporterer og blokkerer en motpart mens et reservert lån ennå ikke er overlevert, behandles rapporten og lånet separat. Blokkeringen og rapporten opphever ikke automatisk reservasjonen; begge parter kan fortsatt bruke den ordinære retten til ensidig kansellering før overlevering.

## Privat kommunikasjon som dokumentasjon

En ende-til-ende-kryptert privat melding skal ikke automatisk gjøres tilgjengelig for administratorer eller plattformforvaltere fordi det opprettes en sak.

En part kan derimot uttrykkelig velge å sende inn en kopi, et skjermbilde, et vedlegg eller annen representasjon av den private kommunikasjonen som dokumentasjon i saken. Fra det tidspunktet materialet er uttrykkelig sendt inn, er den innsendte kopien **saksdata** og kan leses av de autoriserte personene som behandler saken. Dette åpner ikke resten av den private chatten.

Hvis brukeren som sendte inn dokumentasjonen senere får kontoen slettet eller deaktivert, forsvinner ikke allerede innsendt saksdokumentasjon automatisk. Den følger sakens egne regler for nødvendig oppbevaring, mens identifiserende opplysninger skal reduseres eller anonymiseres når de ikke lenger er nødvendige.

## Korrigering uten omskriving

Hvis en avsluttet eller pågående sak inneholder en faktisk feil som bør korrigeres, skal den opprinnelige registreringen som hovedregel ikke omskrives stille. En korrigering eller presisering skal legges til som en ny sporbar hendelse slik at det fremgår både hva som først ble registrert og hva som senere ble korrigert.

## Habilitet i saker og rapporter

En administrator som selv er rapportert av et medlem, eller på annen måte er direkte part i det forholdet som skal vurderes, skal ikke behandle den aktuelle rapporten eller en tett sammenvevd sak som saksbehandler. En annen habil administrator må overta dersom miljøbehandling skal skje. Hvis ingen habil administrator finnes, gjelder de allerede fastsatte reglene om manglende miljømekling.

## Detaljer som fastsettes senere

Konkrete kanalvalg, oppbevaringstider, varslingsstandarder og den kryptografiske implementasjonen fastsettes senere. De produktmessige grensene for kontakt, tilgang, saksansvar og privat kommunikasjon er avklart.