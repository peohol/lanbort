# Utlånsobjekter

> **Status:** Konsolidert visjonsutkast. Objektmodell, tilgjengelighet, publisering, medeierskap og sentrale livssyklusprinsipper er avklart.

## Grunnprinsipp

Et utlånsobjekt tilhører én eller flere brukere, ikke et miljø.

Det samme objektet kan publiseres i flere miljøer samtidig. All sentral informasjon om objektet skal være den samme uansett hvor det vises.

Hvis objektets tilstand eller lånestatus endres, skal endringen derfor gjelde overalt.

## Opprettelse

Et objekt skal kunne opprettes:

- fra brukerens personlige flate
- fra et miljø

Dette skal oppleves som to innganger til den samme funksjonen. Opprettelse fra et miljø betyr bare at objektet fra start klargjøres for publisering i dette miljøet.

Objektet skal fortsatt administreres som brukerens objekt.

## Påkrevde opplysninger

Førsteutkastet forutsetter minst:

1. **Tittel** – en tydelig beskrivelse av hva som lånes bort.
2. **Kategori** – valgt fra en felles kategori- og underkategoristruktur. Egendefinerte kategorier er ikke planlagt, men «Annet» skal finnes.
3. **Beskrivelse** – fritekst som ved behov kan omtale:
   - merke og modell
   - bruksområde
   - egenskaper
   - størrelse, vekt eller dimensjoner
   - tilstand
   - kjente mangler eller defekter
4. **Tilgjengelighet** – én eller flere perioder der objektet kan lånes.

## Valgfrie opplysninger

Foreløpig er følgende tenkt:

- 1–5 bilder
- vilkår for utlånet, for eksempel:
  - ønsket maksimal lånetid
  - begrensninger i bruk
  - forventninger ved skade eller tap
  - andre praktiske betingelser

Nøyaktig skille mellom fri beskrivelse og strukturerte felt må bestemmes senere.

## Tilgjengelighet og faktisk ledighet

**Tilgjengelighet** beskriver når eieren i utgangspunktet er villig til å låne ut objektet. Det er en egenskap ved objektet, ikke en lånestatus.

Et objekt skal kunne være tilgjengelig:

- fra en dato uten sluttdato
- i ett avgrenset datointervall
- i flere separate intervaller

Intervallene skal ikke overlappe.

Sammenhengende intervaller bør presenteres som ett sammenhengende tilgjengelighetsrom fremfor kunstig oppdelte perioder.

**Faktisk ledighet** bestemmes av tilgjengeligheten sammen med eksisterende reservasjoner, aktive lån og andre forhold som gjør objektet utilgjengelig.

Et objekt kan derfor være satt som tilgjengelig hele oktober, samtidig som for eksempel 10.–12. oktober ikke er ledig fordi perioden allerede er reservert.

Et godkjent lån skal alltid blokkere kolliderende utlån uansett hvilket miljø eller hvilken inngang lånet kom fra.

Eieren kan endre objektets generelle tilgjengelighet fremover, men slike endringer skal **ikke retroaktivt endre eller oppheve et allerede godkjent lån**. En periode som allerede inngår i et godkjent lån, forblir bundet av den konkrete låneavtalen med mindre partene blir enige om noe annet.

## Publisering i miljøer

Eieren velger hvilke miljøer objektet skal vises i.

Et objekt kan legges til eller fjernes fra et miljø uten at selve objektet slettes.

Dersom et miljø krever administratorgodkjenning av objekter, må publisering der først gjennom den prosessen.

## Samme objekt i flere miljøer

Objektet har én felles sannhet på tvers av miljøene.

Det innebærer blant annet at:

- beskrivelse og bilder er felles
- tilgjengelighet er felles
- endringer gjelder overalt
- et avtalt eller aktivt lån skal blokkere kolliderende utlån uansett hvilket miljø lånet kom fra
- tilbakelevering gjelder objektet globalt

Miljøet der et bestemt lån oppstod, er likevel relevant for blant annet administrativ konfliktbehandling.

## Medeierskap

En eier skal kunne invitere andre brukere til å bli medeiere.

Invitasjonen må godtas. Ved å bli medeier aksepterer brukeren samtidig at de andre medeierne kan inngå lån på objektets vegne når objektet er ledig.

Når en bruker blir medeier:

- objektet skal vises blant vedkommendes medeide objekter
- alle medeiere kan redigere objektet
- alle medeiere kan publisere objektet i miljøer de selv har tilgang til
- alle medeiere kan godkjenne en låneforespørsel når objektet er ledig
- den medeiaren som godkjenner et konkret lån blir den **ansvarlige utlåneren** for akkurat dette lånet

Andre medeiere beholder sine generelle rettigheter til objektet, men får ikke dermed rett til å endre det konkrete lånet.

Det innebærer at andre medeiere ikke ensidig kan:

- kansellere lånet
- endre avtalt hentetid eller returdato
- godkjenne en forlengelse
- erklære lånet avsluttet eller bekrefte retur på utlånerens vegne

Perioden som omfattes av lånet er blokkert globalt for alle medeiere.

### Overføring av ansvar for et konkret lån

Et konkret lån skal alltid ha én ansvarlig utlåner om gangen.

Den ansvarlige utlåneren kan frivillig overføre ansvaret til en annen registrert medeier, for eksempel før et planlagt fravær.

Hvis ansvarlig utlåner blir reelt utilgjengelig under et reservert eller aktivt lån, skal en annen medeier kunne overta gjennom en særskilt, kontrollert unntaksprosess. Manglende svar alene skal ikke umiddelbart gi andre medeiere rett til å overta; det må foreligge tilstrekkelig grunnlag for å behandle utlåneren som utilgjengelig. Den konkrete terskelen og prosessen bestemmes senere.

Overtakelsen:

- skal være eksplisitt og sporbar
- skal varsles tydelig til låntakeren
- krever ikke låntakerens samtykke til selve byttet av ansvarlig utlåner
- endrer ikke vilkårene i det eksisterende lånet
- gir den nye ansvarlige utlåneren de samme rettighetene og begrensningene som den forrige hadde
- gir ikke rett til å gjøre avtaleendringer som ellers krever samtykke fra låntakeren
- skal ikke slette eller omskrive tidligere historikk

Når ansvaret er overtatt, går det ikke automatisk tilbake til den tidligere ansvarlige utlåneren dersom vedkommende senere blir tilgjengelig igjen. En eventuell ny overføring må skje eksplisitt.

Medeierskap alene gir fortsatt ingen generell rett til å gripe inn i et lån. Overtakelse av ansvar er et særskilt unntak.

### Uttreden og fjerning av medeiere

En medeier kan trekke **seg selv** som medeier så lenge minst én eier blir igjen.

Ingen medeier kan ensidig fjerne en annen medeier.

Permanent sletting av et medeid objekt skal kreve samtykke fra alle registrerte medeiere.

Lånbort skal ikke avgjøre hvem som juridisk eier en fysisk gjenstand dersom medeierne er uenige. Produktet forholder seg til de registrerte rettighetene og historikken i appen.

## Endringshistorikk for medeide objekter

Når én medeier endrer objektet, skal de andre kunne se:

- hvem som endret
- når endringen ble gjort
- hva som ble lagt til, endret eller fjernet

Det opprinnelige utkastet foreslår en tydelig diff-visning og mulighet til å gjenopprette forrige versjon.

Dette er en ønsket brukeropplevelse. Gjenoppretting av en tidligere versjon skal registreres som **en ny endring**; senere historikk skal ikke slettes eller omskrives.

Regler for samtidige redigeringer må senere utformes slik at én medeier ikke utilsiktet overskriver andres arbeid.

## Redigering

Eierne skal kunne redigere objektinformasjonen når som helst, med nødvendige begrensninger når det finnes godkjente eller aktive lån.

Endringer i objektbeskrivelse, vilkår, bilder eller tilgjengelighet skal ikke kunne brukes til å endre innholdet i en allerede inngått låneavtale retroaktivt. Opplysninger og vilkår som var relevante da lånet ble godkjent, må kunne forstås som del av den konkrete avtalen selv om objektet senere redigeres.

Brukere som har en relevant interesse i objektet, for eksempel abonnenter eller personer med en låneforespørsel, kan varsles om vesentlige endringer.

Det opprinnelige forslaget er å samle hyppige redigeringer slik at samme person ikke mottar nye varsler oftere enn omtrent hver andre time.

Nøyaktig varslingsregel bør bestemmes ut fra hva som faktisk er nyttig for brukeren.

## Abonnement

En bruker skal kunne abonnere på et objekt hen har adgang til å se.

Abonnementet skal kunne gi varsler om relevante endringer, særlig når objektet igjen blir tilgjengelig.

Hvilke abonnementshendelser som inngår som standard, og hvilke brukeren selv kan velge, fastsettes senere i produktspesifikasjonen.

## Offentlige spørsmål

Medlemmer av et miljø skal kunne stille spørsmål om et objekt som er publisert der, og spørsmålene og svarene skal være **miljøspesifikke**.

Det innebærer at:

- et spørsmål stilt i ett miljø bare er synlig i dette miljøet
- svar og diskusjon følger den samme miljøkonteksten
- spørsmål, brukernavn og annen sosial kontekst fra ett miljø skal ikke automatisk vises i andre miljøer der objektet også er publisert
- dette gjelder særlig for å unngå lekkasje av informasjon fra lukkede eller skjulte miljøer

Selve objektinformasjonen er fortsatt global for objektet.

Hvis et spørsmål avdekker informasjon som er generelt nyttig på tvers av miljøer, kan eier eller medeier oppdatere objektets beskrivelse eller andre relevante felt. Da blir informasjonen en del av objektet, uten at selve spørsmålstråden flyttes mellom miljøene.

## Inaktivitet, skjuling og arkivering

Lånbort skal rydde bort inaktive objekter fra aktive flater uten å permanent slette dem bare fordi de ikke har vært brukt på en stund.

Den foreløpige produktretningen er:

- dersom et objekt ikke har nåværende eller fremtidig tilgjengelighet over en periode, kan det etter omtrent 30 dager skjules automatisk fra miljøenes oppdagelsesflater
- eieren skal varsles i forbindelse med automatisk skjuling
- objektet skal fortsatt være tilgjengelig blant eierens egne objekter og kunne reaktiveres ved å angi ny tilgjengelighet
- etter lengre inaktivitet, foreløpig omtrent seks måneder, kan objektet flyttes til en arkivert del av eierens objektliste
- arkivering skal være reversibel

**Inaktivitet alene skal ikke føre til automatisk permanent sletting av objektet.**

Permanent sletting skal i utgangspunktet skje:

- eksplisitt på initiativ fra eieren eller eierne
- eller som del av senere regler for kontosletting og datalivssyklus

Historikk som fortsatt er nødvendig for tidligere lån, saker eller andre legitime formål kan bevares etter de generelle reglene for datalivssyklus selv om selve objektet senere slettes.

Hvis datamengden ved stor skala senere blir et faktisk driftsproblem, kan lagrings- og oppryddingsstrategien revurderes uten at dette trenger å endre den grunnleggende brukeropplevelsen.

## Objektsikkerhet og lovlighet

**Retning:** Lånbort skal ikke brukes til å formidle objekter som er ulovlige, sterkt regulerte eller innebærer uforholdsmessig risiko for skade ved utlån mellom privatpersoner.

Det skal derfor finnes en plattformpolicy som skiller mellom:

- vanlige utlånsobjekter
- objekter som eventuelt krever særskilte vilkår, begrensninger eller dokumentasjon
- objekter som ikke skal kunne publiseres eller formidles gjennom Lånbort

Den detaljerte listen skal ikke låses i produktvisjonen nå. Den må utarbeides senere med juridisk og sikkerhetsmessig vurdering før bred lansering, og kunne oppdateres etter hvert som produktet og regelverket utvikler seg.

Aktuelle kategorier som senere må vurderes særskilt omfatter blant annet våpen, legemidler, rusmidler, farlige kjemikalier, kjøretøy, medisinsk utstyr og annet sikkerhetskritisk utstyr. At en kategori nevnes her betyr ikke at hele kategorien nødvendigvis skal forbys.

## Detaljer som fastsettes senere

Følgende hører til senere produktspesifikasjon, sikkerhetsarbeid eller juridisk vurdering:

- nøyaktig skille mellom fritekst og strukturerte objektfelt
- standardvalg og preferanser for objektabonnement
- detaljert håndtering av samtidige redigeringer
- konkrete terskler for overtakelse når ansvarlig utlåner er utilgjengelig
- den detaljerte policyen for regulerte eller risikofylte objektkategorier
- konkrete tidsgrenser for skjuling og arkivering

De grunnleggende produktprinsippene for disse områdene er allerede definert.