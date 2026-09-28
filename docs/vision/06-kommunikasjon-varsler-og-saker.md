# Kommunikasjon, varsler og saker

> **Status:** Førsteutkast. Visjonen skiller bevisst mellom løpende chat, strukturerte varsler og formelle saker.

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
- tilbakekalling av en bekreftelse
- endring av et objekt man har relevant interesse i
- objekt man abonnerer på blir tilgjengelig
- invitasjon til miljø eller administratorrolle
- innmeldingsforespørsel som krever behandling
- ny melding i relevant chat eller sak
- rapport eller modereringshendelse som krever handling

## Varslingspreferanser

Brukeren skal kunne styre:

- hvilke typer hendelser hen ønsker varsler om
- hvilke kanaler som skal brukes

Aktuelle kanaler er:

- i appen
- mobilvarsler
- e-post

Det må senere bestemmes hvilke varsler som er valgfrie og hvilke som er så viktige for et aktivt lån eller en sikkerhetsprosess at de ikke bør kunne deaktiveres helt.

## Direktemeldinger mellom brukere

Venner skal kunne starte vanlig direktemeldingschat.

For brukere som ikke er venner, skal fri chat ikke kunne startes vilkårlig. Kontakt må først ha en legitim kontekst, for eksempel et konkret objekt eller en låneforespørsel.

Den første kontakten kan være en strukturert henvendelse.

Mottakeren skal kunne velge om det åpnes for videre fri samtale.

Før dette skal avsenderen ikke kunne sende en strøm av nye fritekstmeldinger, og mottakeren skal ikke måtte forholde seg til lesebekreftelser.

## Strukturert innhold i chat

Chatten skal kunne inneholde mer enn tekst.

Strukturerte meldinger kan representere hendelser eller handlinger som:

- låneforespørsel
- godkjenning eller avslag
- endring av tidspunkt
- bekreftelse av tilbakelevering
- spørsmål om en tilbakekalt bekreftelse
- lenke til et objekt eller et lån

Slike meldinger kan ha knapper og andre kontroller når det gir mening.

Målet er at viktige avtaler ikke bare skal finnes som ustrukturert tekst som systemet ikke forstår.

## Sletting av chat

Det opprinnelige forslaget er at en bruker kan slette en chat fra sin egen visning uten at samtalen dermed slettes hos den andre parten.

Dette bør foreløpig forstås som **personlig fjerning eller skjuling**, ikke nødvendigvis fysisk sletting av alle underliggende data.

Sammenhengen mellom brukerens sletting, sikkerhetskopier, misbruksforebygging, juridiske krav og eventuell ende-til-ende-kryptering må avklares senere.

## Kontakt med administratorene i et miljø

Et medlem skal kunne kontakte **administratorene som funksjon**, ikke bare sende privat melding til en bestemt person som tilfeldigvis er administrator.

Denne samtalen skal derfor være knyttet til miljøets administrasjon.

Alle administratorer kan i utgangspunktet ha innsyn, men én administrator kan «ta» samtalen slik at vedkommende blir primær mottaker av nye varsler.

De andre administratorene skal fortsatt kunne finne samtalen ved behov.

Dette skal holdes adskilt fra vanlig privat chat mellom to brukere.

## Saker og prosessmeldinger

En sak brukes når kommunikasjonen er del av en styrt prosess, for eksempel:

- behandling av en innmeldingsforespørsel
- konflikt om tilbakelevering
- eskalering av miljøets sletting
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

Den konkrete tilgangsmodellen avhenger av sakstype.

## Separate forklaringer ved konflikt

Ved enkelte konflikter skal partene i første omgang kunne skrive sin versjon uten å se den andres.

Formålet er ikke hemmelighold for sin egen skyld, men å få frem selvstendige beskrivelser før partene eventuelt påvirkes av hverandre.

Saksbehandleren kan senere kommunisere separat med partene og eventuelt åpne nye svarrunder.

## Ende-til-ende-kryptering

Den opprinnelige visjonen ønsker robust ende-til-ende-kryptering for chat.

Dette er en viktig sikkerhetsambisjon, men omfanget må defineres før det kan gjøres til et absolutt krav.

Vanlig privat brukerschatt, administratorsamtaler, interaktive systemmeldinger og formelle saker har forskjellige behov. Noen prosesser forutsetter for eksempel at autoriserte administratorer kan lese innholdet.

Visjonen fastsetter derfor foreløpig:

- privat kommunikasjon skal ha sterkest mulig rimelig konfidensialitet
- systemet skal ikke ha bredere innsyn enn funksjonen krever
- det må skilles eksplisitt mellom kommunikasjon som kan være ende-til-ende-kryptert og kommunikasjon som må kunne behandles av en autorisert tredjepart i appen

Den konkrete kryptografiske modellen hører til sikkerhets- og arkitekturarbeidet senere.

## Åpne spørsmål

Se [Åpne spørsmål](open-questions.md) for blant annet:

- hvilke varsler som er obligatoriske
- chat mellom brukere som ikke er venner
- lesebekreftelser
- sletting og historikk
- grenser for ende-til-ende-kryptering
- eierskap og overføring av aktive administratorkontakter
- hvor lenge saker skal oppbevares