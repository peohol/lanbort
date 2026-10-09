# Kommunikasjon, varsler og saker

> **Status:** Arbeidsversjon av produktspesifikasjonen.

### PS-COM-001 — Varsel, chat og sak er ulike konsepter
**Forankring:** [Tre forskjellige kommunikasjonsformer](../vision/06-kommunikasjon-varsler-og-saker.md)

Systemet skal ikke bruke én universell innboks som semantisk modell. Varsler retter oppmerksomhet, chat støtter samtale, og saker støtter styrte prosesser med særskilt tilgang og ansvar.

### PS-COM-002 — Varslingspreferanser endrer ikke systemtilstand
**Forankring:** [Systemhendelser påvirkes ikke av varslingsvalg](../vision/06-kommunikasjon-varsler-og-saker.md)

Å slå av en kanal eller et informasjonsvarsel skal aldri hindre at en underliggende låne-, sikkerhets- eller saksstatus endres etter reglene.

### PS-COM-003 — Varsler har tre prioriteringsnivåer
**Forankring:** UX-P08; [Varslingspreferanser](../vision/06-kommunikasjon-varsler-og-saker.md)

- **Påkrevd:** kritiske konto-/sikkerhetshendelser og viktige hendelser i eksisterende lån. Skal alltid være tilgjengelig i appen.
- **Handlingsvarsel:** hendelser som vanligvis krever eller inviterer til handling. Skal være synlige i appen; eksterne kanaler kan slås av.
- **Informasjonsvarsel:** lavere prioritet og kan slås helt av.

### PS-COM-004 — Privat chat har ingen lesebekreftelser
**Forankring:** UX-P17; [Ingen lesebekreftelser i privat chat](../vision/06-kommunikasjon-varsler-og-saker.md)

Åpning eller lesing av privat melding skal ikke eksponeres som sosialt signal og skal aldri tolkes som samtykke.

### PS-COM-005 — Privat chat er ende-til-ende-kryptert som produktkrav
**Forankring:** [Ende-til-ende-kryptering](../vision/06-kommunikasjon-varsler-og-saker.md)

Vanlig privat fritekst og private vedlegg mellom to brukere, inkludert privat samtale rundt et konkret lån, skal bare kunne leses av samtaledeltakerne. Strukturerte lånehendelser og den valgfrie meldingen i en låneforespørsel (PS-LOAN-004) er del av den strukturerte henvendelsen og omfattes ikke av dette kravet.

### PS-COM-006 — Ikke-venners første kontakt er kontrollert
**Forankring:** PS-USR-005

Før mottakeren åpner for fri samtale kan en ikke-venn bare sende den strukturerte henvendelsen som hører til den legitime produktkonteksten. En slik henvendelse skal ikke kunne brukes til meldingsspam.

### PS-COM-007 — Blokkert lån kan bruke snever logistikk
**Forankring:** VP-10, VP-11; [Direktemeldinger mellom brukere](../vision/06-kommunikasjon-varsler-og-saker.md)

Ved blokkering stenges ordinær fri chat. For reservert eller aktivt lån kan strukturerte handlinger og en tydelig avgrenset logistikk-kanal bestå for korte meldinger om overlevering, retur, tid, sted og objekt. Kanalen avsluttes først når lånet er avsluttet (eller når en av dem ikke lenger er part i lånet), og kan ikke stenges av én part mens lånet pågår. Hver part kan dempe samtalen (ingen varsler) eller arkivere den (fjerne den fra egen samtaleliste, som PS-COM-009); det påvirker ikke den andre parten. Trakassering rapporteres og håndteres med vanlig moderering. (Produkteier, 6. oktober 2026, OD-0020.)

### PS-COM-008 — Strukturert avtaleinnhold er systemdata
**Forankring:** VP-15

Forespørsler, godkjenning/avslag, tidsendringer, returbekreftelser og andre avtalerelevante handlinger skal representeres som strukturerte hendelser som systemet kan validere og historisere; de skal ikke bare finnes i fritekst.

### PS-COM-009 — «Fjern fra mine samtaler» er personlig skjuling
**Forankring:** [Fjerning av chat fra egen visning](../vision/06-kommunikasjon-varsler-og-saker.md)

Handlingen påvirker bare egen samtaleliste og sletter ikke den andre partens historikk eller underliggende felles data. Generell «slett for alle» inngår ikke i kjerneproduktet.

### PS-COM-010 — Administratorkontakt tilhører funksjonen
**Forankring:** [Kontakt med administratorene i et miljø](../vision/06-kommunikasjon-varsler-og-saker.md)

En administrativ samtale med et miljø tilhører miljøets administratorfunksjon. Den kan tildeles en saksbehandler, men går tilbake til felles kø dersom vedkommende mister rollen eller blir utilgjengelig. Historikken følger saken, ikke personen.

### PS-COM-011 — Saksbehandling har eksplisitt tilgang og tildeling
**Forankring:** VP-16; [Saksbehandler](../vision/06-kommunikasjon-varsler-og-saker.md)

En sak har kontekst, parter, autoriserte saksbehandlerroller og eventuelt én ansvarlig saksbehandler. Tildeling gir ikke bredere myndighet enn sakstypen tilsier.

### PS-COM-012 — Første forklaringsrunde kan være separat
**Forankring:** VP-12; [Separate forklaringer ved konflikt](../vision/06-kommunikasjon-varsler-og-saker.md)

For konfliktsaker der uavhengige forklaringer er viktige skal systemet kunne holde partenes første forklaringer skjult for hverandre til saksprosessen åpner for videre deling.

### PS-COM-013 — Privat chat åpnes ikke automatisk for saksbehandler
**Forankring:** VP-08; [Ingen automatisk åpning av privat chat ved konflikt](../vision/06-kommunikasjon-varsler-og-saker.md)

Opprettelse av sak gir ikke administrator eller plattformforvalter adgang til privat chat. En part kan selv sende inn en kopi eller annet materiale; den innsendte kopien blir deretter saksdata.

### PS-COM-014 — Saksdata korrigeres uten stille omskriving
**Forankring:** VP-15

Faktiske korrigeringer og endret vurdering registreres som nye saks-/revisjonshendelser.

### PS-COM-015 — Melding om mulig dødsfall er egen konfidensiell verifikasjonssak
**Forankring:** [Melding om mulig dødsfall eller varig utilgjengelighet](../vision/06-kommunikasjon-varsler-og-saker.md)

Meldingen skal ikke automatisk endre konto, lån eller tilgang. Bare autoriserte plattformforvaltere skal behandle verifikasjonen.

### PS-COM-016 — Nye godkjente chat-enheter utløser sikkerhetsvarsel
**Forankring:** UX-P08; PS-COM-003, PS-COM-005; ADR-0010 §5

Når en eksisterende, godkjent enhet godkjenner kobling av en ny chat-enhet til kontoen, skal kontoeieren få ett påkrevd varsel i appen og en sikkerhetsmelding til sin verifiserte e-postadresse. Hendelsen varsles også når kontoeieren selv utførte godkjenningen: en uventet ny enhet kan bety at kontoen er kompromittert. Varselet viser bare at en enhet er koblet til, forklarer at den kan motta nye meldinger, men ikke automatisk tidligere historikk, og leder til «Samtaler › Mine enheter», slik at en ukjent enhet kan tilbakekalles. Det skal ikke inneholde private nøkler, chatinnhold eller annen sensitiv samtaleinformasjon. Varsling opprettes fra den allerede registrerte `chat.device_linked`-hendelsen gjennom den idempotente varslingsmotoren, slik at samme kobling ikke gir duplikater. Et mislykket varsel må ikke rulle tilbake en gyldig enhetskobling.

## Kanalstandard for pilot

Alle relevante hendelser representeres i appens varslingssenter. Verifisert e-post brukes som reservekanal for sikkerhets-/kontohendelser og tidskritiske hendelser i allerede godkjente lån. Vanlige handlings- og informasjonsvarsler skal kunne konfigureres uten at dette endrer systemtilstand. Web push kan legges til når teknisk støtte og samtykke er på plass.
