# Domenemodell

> **Status:** Arbeidsversjon av formell domenemodell, utledet fra produktvisjon v1.0.

## Formål

Dette dokumentet fastsetter begrepene og grensene som resten av produktspesifikasjonen bruker. Modellen beskriver produktets domene, ikke databaseskjema eller kodearkitektur.

### PS-DOM-001 — Roller er kontekstuelle
**Forankring:** VP-16; [Brukere, roller og relasjoner](../vision/02-brukere-roller-og-relasjoner.md)

En bruker kan samtidig ha ulike roller i ulike sammenhenger. Roller skal derfor modelleres som relasjoner eller tildelinger i en kontekst, ikke som ett globalt hierarkisk brukernivå.

### PS-DOM-002 — Eksisterende forpliktelser er egne domenerelasjoner
**Forankring:** VP-05, VP-10, VP-11

Når et lån, en sak eller en annen bindende prosess først er etablert, skal nødvendige rettigheter til denne relasjonen kunne bestå selv om vennskap, medlemskap, blokkering eller kontostatus senere endres.

### PS-DOM-003 — Objekt og miljøpublisering er separate begreper
**Forankring:** VP-03; [Utlånsobjekter](../vision/04-utlansobjekter.md)

Et **utlånsobjekt** har én global identitet og sentral sannhet. En **miljøpublisering** er en kontekstuell kobling mellom objekt og miljø. Avpublisering fra ett miljø sletter eller endrer ikke objektet som sådan.

### PS-DOM-004 — Låneforespørsel, låneavtale og låneforløp skilles
**Forankring:** VP-04, VP-05, VP-06, VP-07; [Låneforløpet](../vision/05-laneforlop.md)

- **Låneforespørsel:** et forslag om lån før bindende godkjenning.
- **Låneavtale:** oppstår ved godkjenning og inneholder det avtalte, historiske øyeblikksbildet av relevante vilkår.
- **Låneforløp:** hele prosessen fra forespørsel til avslutning, inkludert hendelser og avvik.

Endringer i objektets senere metadata eller standardvilkår skal ikke omskrive låneavtalen.

### PS-DOM-005 — Opprinnelseskontekst er permanent metadata
**Forankring:** VP-04, VP-08, VP-09

Et låneforløp har enten opprinnelseskontekst **miljø** med én bestemt miljø-ID eller **direkte vennelån**. Opprinnelsen endres ikke dersom partene senere blir venner, mister vennskap eller endrer miljøtilgang.

### PS-DOM-006 — Historikk korrigeres med nye hendelser
**Forankring:** VP-15

Hendelser som allerede har hatt produktmessig virkning skal som hovedregel ikke slettes eller omskrives. En korreksjon registreres som en senere hendelse som kan endre gjeldende tilstand.

### PS-DOM-007 — Kontekstbegrenset informasjon følger kilden
**Forankring:** VP-08, VP-09

Miljøspesifikke spørsmål, medlemsdata, skjult miljøkontekst, saksdata og annen sosial metadata skal beholde sin tilgangskontekst selv når relaterte globale domeneobjekter brukes andre steder.

### PS-DOM-008 — Faktisk ledighet er avledet
**Forankring:** VP-03, VP-07

**Tilgjengelighet** uttrykker eiernes generelle vilje til å låne ut. **Faktisk ledighet** er resultatet av tilgjengelighet minus reservasjoner, aktive eller uavklarte lån, medeierbegrensninger, blokkeringer og andre gyldige sperrer. Faktisk ledighet skal ikke være en uavhengig sannhet som kan komme i konflikt med disse kildene.

## Sentrale domeneobjekter

| Begrep | Betydning | Viktige relasjoner |
|---|---|---|
| Brukerkonto | Aktiv identitet i Lånbort | profil, verifisert kontakt, relasjoner, roller |
| Profil | Brukersynlige profilopplysninger og synlighetsvalg | tilhører én brukerkonto |
| Vennskap | Gjensidig akseptert sosial relasjon | nøyaktig to brukere |
| Blokkering | Ensidig kontakt- og synlighetsbegrensning | blokkerende bruker → blokkert bruker |
| Miljø | Sosial oppdagelses- og adgangskontekst | medlemskap, administratorer, eier, publiseringer |
| Medlemskap | Brukerens relasjon til ett miljø | kan være aktivt, passivt eller avsluttet |
| Miljøinvitasjon | Tilbud om medlemskap eller administratorrolle | kan tilhøre miljøfunksjonen |
| Utlånsobjekt | Én fysisk gjenstand representert i produktet | én eller flere eiere |
| Medeierskap | Forvaltningsrelasjon mellom bruker og objekt | kan ha uttrykkelige begrensninger |
| Tilgjengelighetsintervall | Eiers ønskede utlånsperiode | tilhører objekt |
| Miljøpublisering | Objektets synlighet i ett bestemt miljø | objekt + miljø + publiseringsstatus |
| Objektabonnement | Brukers ønske om relevante objektvarsler | avhenger av fortsatt innsyn |
| Objektspørsmål | Miljøspesifikk spørsmålstråd | objekt + miljø |
| Låneforespørsel | Forslag om lån | objekt, låntaker, ønsket periode, opprinnelse |
| Låneavtale | Godkjent avtaleøyeblikksbilde | utlåner, låntaker, objekt, periode, vilkår |
| Låneforløp | Livssyklusen rundt et konkret lån | forespørsel, avtale, hendelser, status |
| Ansvarlig utlåner | Den ene brukeren som utøver utlånerrollen i lånet | må følge reglene for medeierskap |
| Samtale | Kommunikasjonsflate | privat, lånelogistikk eller administrativ |
| Varsel | Brukerrettet oppmerksomhet om systemhendelse | nivå + kanalpreferanser |
| Sak | Styrt administrativ eller konfliktprosess | deltakere, tilgang, saksbehandler |
| Rapport | Påstand om mulig problem | kan opprette eller inngå i sak |
| Anmeldelsesrett | Rett til å levere anmeldelse etter et relevant forløp | rolle og tillatte dimensjoner |
| Anmeldelse | Skårer og eventuell fritekst | låneforløp, forfatter, anmeldt rolle |
| Modereringstiltak | Plattform- eller miljøtiltak med avgrenset virkning | bruker, objekt, miljø eller innhold |
| Representanttilgang | Snever, verifisert tilgang for å avslutte konkrete bindinger | bestemt bruker + bestemt forhold |
| Domenehendelse | Sporbar historisk hendelse | aktør, tidspunkt, kontekst, resultat |

## Grunnleggende invariants

1. Et aktivt miljø har normalt nøyaktig én eier, og eieren er administrator.
2. Et objekt har minst én registrert eier så lenge objektet eksisterer aktivt.
3. Et godkjent lån har nøyaktig én ansvarlig utlåner om gangen.
4. To godkjente lån for samme objekt kan ikke ha kolliderende avtaleperioder når det andre godkjennes.
5. Et godkjent lån kan ikke ensidig omskrives av senere endringer i objekt, vennskap, medlemskap eller miljø.
6. Skjult kontekst skal ikke kunne utledes gjennom generelle søke-, profil- eller objektflater.
7. En historisk hendelse som er blitt virksom, korrigeres ved ny hendelse fremfor stille omskriving.
8. En rolle eller tilgang gir bare innsynet som er nødvendig for den aktuelle konteksten.
9. Uavklart fysisk besittelse av et objekt sperrer nye kolliderende lån, men opphever ikke allerede gyldig inngåtte senere avtaler.
10. Et åpent spørsmål eller en rapport er ikke i seg selv bevis for skyld eller mislighold.
