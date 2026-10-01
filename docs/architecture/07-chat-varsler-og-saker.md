# Chat, varsler og saker

> **Status:** Systemarkitektur v0.1.

## Privat chat

### Krypteringsmodell
- meldingsklartekst krypteres/dekrypteres i klient
- server lagrer ciphertext og nødvendig leveringsmetadata
- private vedlegg krypteres i klient før opplasting
- private nøkler skal ikke lagres ukryptert på server
- administrator-/plattformrolle gir ingen dekrypteringsnøkkel

Detaljert multi-device-/nøkkelbackupmodell er fortsatt OD-0005.

### Metadata
Serveren trenger minst samtale-ID, avsenderkonto/-enhet, mottakere, tidspunkt, melding-ID og leveringsstatus. Metadata skal minimeres og ikke brukes til sosial rangering/profilering.

### Ingen lesebekreftelser
Arkitekturen trenger ikke lagre eller distribuere «lest av mottaker»-hendelser for privat chat. Lokal visning av egne uleste meldinger er separat.

## Lånelogistikk ved blokkering

Logistikk-kanalen kan bruke samme E2EE-infrastruktur som privat chat, men har egen samtaletype og servervalidert livssyklus:
- eksisterer bare for konkret kvalifisert lån
- tillater bare deltakende parter
- kan stenges av sikkerhetstiltak
- stenges når lånet ikke lenger krever logistikk

## Strukturerte lånehendelser

Forespørsel, godkjenning, avtaleendring, overlevering og retur er ikke chat. UI kan vise dem i en samtalelignende tidslinje, men data kommer fra domenedatabasen og skal kunne valideres uten å dekryptere privat tekst.

## Administrative saker

Administrative samtaler/saker lagres serverlesbart med:
- case-ID og type
- organisatorisk kontekst
- deltakere og roller
- tildelt saksbehandler
- eksplisitte skrive-/leserunder
- vedlegg og innsendt dokumentasjon
- revisjonshendelser

Tilgangen kontrolleres per sak. Inhabilitet overstyrer generell administratorrolle.

## E2EE-innhold som dokumentasjon

Klienten tilbyr eksplisitt «Send inn som dokumentasjon». Brukeren velger melding/utdrag/vedlegg, som dekrypteres lokalt og lastes opp som ny saksdata. Det opprettes ingen servermekanisme som åpner resten av samtalen.

## Varsler

Varselobjekt opprettes fra domenehendelser. Eksterne leveranser skal som standard inneholde minst mulig sensitiv tekst, særlig for skjulte miljøer og saker. E-post/push kan bruke generisk formulering som «Du har en ny hendelse i Lånbort» når mer detalj kan røpe kontekst.

Leveringsfeil påvirker ikke domenehendelsen. Retry skjer asynkront og idempotent.
