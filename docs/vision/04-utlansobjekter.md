# Utlånsobjekter

> **Status:** Førsteutkast. Objektmodellen er relativt tydelig, men enkelte livssyklusregler og samarbeidsmekanismer må avklares.

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

Det må senere avklares hvor mye eieren kan endre tilgjengeligheten for perioder som allerede inngår i et godkjent lån.

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

Invitasjonen må godtas.

Når en bruker blir medeier:

- objektet skal vises blant vedkommendes medeide objekter
- alle medeiere kan redigere objektet
- alle medeiere kan publisere objektet i miljøer de selv har tilgang til
- alle medeiere kan bekrefte at objektet er kommet tilbake etter et lån

## Endringshistorikk for medeide objekter

Når én medeier endrer objektet, skal de andre kunne se:

- hvem som endret
- når endringen ble gjort
- hva som ble lagt til, endret eller fjernet

Det opprinnelige utkastet foreslår en tydelig diff-visning og mulighet til å gjenopprette forrige versjon.

Dette er en ønsket brukeropplevelse, men regler for samtidige endringer og gjenoppretting må defineres senere slik at én medeier ikke utilsiktet overskriver andres arbeid.

## Redigering

Eierne skal kunne redigere objektinformasjonen når som helst, med nødvendige begrensninger når det finnes aktive avtaler.

Brukere som har en relevant interesse i objektet, for eksempel abonnenter eller personer med en låneforespørsel, kan varsles om vesentlige endringer.

Det opprinnelige forslaget er å samle hyppige redigeringer slik at samme person ikke mottar nye varsler oftere enn omtrent hver andre time.

Nøyaktig varslingsregel bør bestemmes ut fra hva som faktisk er nyttig for brukeren.

## Abonnement

En bruker skal kunne abonnere på et objekt hen har adgang til å se.

Abonnementet skal kunne gi varsler om relevante endringer, særlig når objektet igjen blir tilgjengelig.

Det må avklares hvilke hendelser som inngår som standard, og hvilke brukeren selv kan velge.

## Offentlige spørsmål

En foreløpig idé er at medlemmer av et miljø kan stille spørsmål om et objekt som er synlige for andre medlemmer i samme miljø.

Dette kan redusere dupliserte spørsmål når svaret er nyttig for flere.

Det må avklares om spørsmål og svar følger objektet globalt eller er knyttet til det enkelte miljøet.

## Inaktivitet, skjuling og arkivering

Visjonen inneholder tre tidsbaserte ideer:

- etter omtrent 30 dager uten tilgjengelighet skjules objektet automatisk fra miljøene
- etter omtrent seks måneder kan det flyttes til brukerens arkiv
- etter omtrent tolv måneder kan permanent sletting vurderes, med tydelige advarsler på forhånd

Dette bør forstås som én samlet livssyklus som ennå ikke er endelig utformet.

Et skjult eller arkivert objekt skal kunne reaktiveres så lenge det ikke er permanent slettet.

## Objektsikkerhet og lovlighet

**Retning:** Lånbort skal ikke brukes til å formidle objekter som er ulovlige, sterkt regulerte eller innebærer uforholdsmessig risiko for skade ved utlån mellom privatpersoner.

Det skal derfor finnes en plattformpolicy som skiller mellom:

- vanlige utlånsobjekter
- objekter som eventuelt krever særskilte vilkår, begrensninger eller dokumentasjon
- objekter som ikke skal kunne publiseres eller formidles gjennom Lånbort

Den detaljerte listen skal ikke låses i produktvisjonen nå. Den må utarbeides senere med juridisk og sikkerhetsmessig vurdering før bred lansering, og kunne oppdateres etter hvert som produktet og regelverket utvikler seg.

Aktuelle kategorier som senere må vurderes særskilt omfatter blant annet våpen, legemidler, rusmidler, farlige kjemikalier, kjøretøy, medisinsk utstyr og annet sikkerhetskritisk utstyr. At en kategori nevnes her betyr ikke at hele kategorien nødvendigvis skal forbys.

## Åpne spørsmål

Se [Åpne spørsmål](open-questions.md), særlig om:

- kategorier og obligatoriske felt
- samtidige forespørsler
- endringer etter at et lån er avtalt
- medeierskap og konflikt mellom medeiere
- offentlige spørsmål
- deaktivering, arkivering og sletting