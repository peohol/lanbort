# Skjerm- og flytinventar

> **Status:** Fase 1 i [planen for UI-designfasen](../planning/ui-design-plan.md), 6. oktober 2026. Inventaret er en dekningssjekk og et arbeidsgrunnlag for Claude Design, ikke visuell design. Det er ikke normativt og innfører ingen nye regler: hver flate viser til `PS-*`- og `UX-*`-reglene som styrer den, og ved tvil gjelder reglene. Uavklarte spørsmål står i [beslutningsregisteret](../open-decisions.md). Skjermstrukturen og navigasjonen mellom flatene er låst i fase 2 ([UX-IA-009–015](01-informasjonsarkitektur-og-navigasjon.md#skjermstruktur-og-navigasjon)). Hjem og varsler ble presisert i fase 4 ([UX-IA-016–019](01-informasjonsarkitektur-og-navigasjon.md#ux-ia-016--hjem-har-fast-seksjonsrekkefolge-og-tomme-seksjoner-skjules)).

## Slik leses inventaret

Inventaret er gruppert etter de tre hovedgruppene i designplanen: ordinær bruker, miljøadministrator og plattformforvalter. For hver sentral flate eller flyt står:

- **Oppgave:** hva brukeren skal få gjort.
- **Tilstander:** situasjonene flaten må kunne vise, i brukerens ord. Interne tilstandsnavn står bare der de hjelper sporingen.
- **Ser / handler:** hvem som ser flaten og hvem som kan gjøre noe der. Serveren avgjør alltid; dette sier hva UI-et skal tilby (PS-NFR-001).
- **Regler:** de viktigste `PS-*`- og `UX-*`-reglene. Prinsippene `UX-P01`–`UX-P23` gjelder overalt og nevnes bare der de er særlig styrende.
- **Forløp:** **normal** (del av et vanlig forløp), **avvik** (hovedsakelig unntak, konflikt eller sjelden administrasjon) eller **begge**.
- **UI-pakke:** pakken i [UI-arbeidspakkene](../implementation/ui-work-packages.md) som eier flaten. «Ingen» betyr at flaten er beskrevet i spesifikasjonen, men ennå ikke planlagt; se [hull](#hull-flater-uten-ui-pakke).

Flater er kontekster i de fem områdene, varslingslaget eller kontoen (UX-IA-001–003). Ingen flate her er et nytt hovedområde. Avvik vises på samme flate som normalforløpet (UX-EXC-001), så avvikene under er tilstander og flyter på eksisterende flater, ikke egne sider.

## Felles for alle flater

Disse tilstandene og mønstrene gjelder alle flater nedenfor og gjentas ikke for hver:

| Situasjon                                 | Hva flaten må vise                                                                                              | Regler                                  |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Neste steg                                | Statuskort med kort status, tid, hvem som må handle, én primærhandling når ett neste steg finnes (i nøytrale avklaringer likeverdige utsagn om hva som skjedde) og diskret tilgang til mer | UX-INT-001, UX-INT-004, UX-P04          |
| Sjeldne valg                              | Under «Flere valg» eller en detaljseksjon, på et forutsigbart sted                                              | UX-INT-009, UX-P06                      |
| Bindende eller destruktiv handling        | Knappetekst som navngir konsekvensen; konsekvensvisning for det som forsvinner, består og påvirker andre        | UX-INT-003, UX-INT-007, UX-P03          |
| Reverserbar handling                      | Utføres direkte med kort angremulighet                                                                          | UX-INT-002, UX-P09                      |
| Etter en viktig handling                  | Den nye tilstanden fra serveren, ikke bare «lagret»                                                             | UX-INT-005, UX-P21                      |
| Ukjent nettverksutfall eller brudd        | «Vet ikke ennå» til status er avklart; utfylte skjema bevares; ingen dobbel handling                            | UX-INT-006, UX-A11Y-009, PS-NFR-005–006 |
| Feil                                      | Hva som skjedde, om noe ble gjort, og hva brukeren kan gjøre nå                                                 | UX-P09, PS-NFR-012                      |
| Tom tilstand                              | Hva som mangler og den naturlige første handlingen                                                              | UX-P19                                  |
| Ingen tilgang eller finnes ikke           | Samme svar uansett grunn; aldri noe som røper et skjult miljø                                                   | UX-PRIV-002, PS-NFR-002                 |
| Tidligere relasjon                        | Nødvendig låne- eller sakshistorikk uten lenker til profil eller miljø som ikke lenger er tilgjengelig          | UX-PRIV-007, UX-EXC-005                 |
| Slettet bruker                            | «Tidligere bruker» uten lenke                                                                                   | UX-PRIV-010                             |
| Kontekst                                  | Kontekstmerke (miljø, «Direkte mellom venner») der betydningen avhenger av konteksten                           | UX-PRIV-003, PS-DOM-005                 |
| Historikk                                 | Sekundær tidslinje med menneskelesbare hendelser, aktør og tid                                                  | UX-IA-008, UX-INT-008, UX-P16           |
| Mobil og tilgjengelighet                  | Én kolonne på smal skjerm, tastatur, semantikk, tekst i tillegg til farge, romslige mål, tåler forstørrelse     | UX-A11Y-001–008, PS-NFR-010–011         |
| Funksjon som venter på en åpen beslutning | Vises ikke i UI-et før beslutningen finnes (se [åpne beslutninger](#åpne-beslutninger-som-berører-flatene))      | [UI-planen](../implementation/ui-work-packages.md) |

### App-skall og navigasjon

- **Oppgave:** orientere seg og nå de fem områdene, varslene og kontoen.
- **Tilstander:** aktivt område; uleste varsler; ikke innlogget.
- **Ser / handler:** alle innloggede.
- **Regler:** UX-IA-001, UX-IA-002, UX-IA-003, UX-IA-009, UX-IA-010, UX-IA-015, UX-IA-019, UX-A11Y-001, UX-P12.
- **Forløp:** normal.
- **UI-pakke:** WP-80.

### Varslingssenteret og varselslenker

**Påkrevd sikkerhetsvarsel ved godkjent ny enhet for privat chat** (PS-COM-003, PS-COM-016; ADR-0010 punkt 5): Tittel «En ny enhet er koblet til privat chat». Tekst «Enheten kan motta nye meldinger fra nå av. Den får ikke tidligere meldinger automatisk. Var det ikke deg, fjern den i Mine enheter.» Varselet leder til stabelen Samtaler › Mine enheter.

- **Oppgave:** se hva som krever oppmerksomhet, forstå hvorfor, og komme til konteksten.
- **Tilstander:** ulest og lest; markert som lest uten at oppgaven er gjort; handling allerede gjort et annet sted; eldre, leste varsler fra samme låneforløp samlet; nivå (påkrevd, handling, informasjon); varsel om noe brukeren ikke lenger har tilgang til; ingen varsler; lenke fra e-post; åpnet fra hvilket som helst hovedområde og lukket tilbake til samme skjerm, stabel, filter og rulleposisjon.
- **Ser / handler:** mottakeren.
- **Regler:** UX-IA-002, UX-IA-011, UX-IA-018, UX-IA-019, UX-INT-010, UX-P08, PS-COM-001–003, PS-COM-016, PS-OBJ-014.
- **Forløp:** normal.
- **UI-pakke:** WP-80, og hver pakke peker varsler til sin side.

## Ordinær bruker

Ordinær bruker omfatter låntaker, utlåner, eier og medeier av ting, ansvarlig utlåner, medlem av et miljø og part i en sak. Det er roller i en kontekst, ikke ulike brukertyper (PS-DOM-001, UX-PRIV-005).

### Normalforløp

#### Registrering og innlogging

- **Oppgave:** opprette konto og logge inn uten omvisning.
- **Tilstander:** kode sendt; feil eller utløpt kode; for mange forsøk; navn og 18+ mangler; ferdig, videre til Hjem.
- **Ser / handler:** den som ikke er innlogget.
- **Regler:** UX-JRN-001, PS-USR-001, UX-P19.
- **Forløp:** normal.
- **UI-pakke:** WP-80.

#### Hjem

- **Oppgave:** se hva som venter på meg nå, og hva som kommer.
- **Tilstander:** venter på deg (svare på forespørsel, bekrefte overlevering eller retur, bekrefte nye vilkår, svare på endring eller ansvarsoverføring, skrive anmeldelse, svare på medlems- eller rolleinvitasjon, svare på typeendring, bekrefte kontroll over en ting); kommende overlevering og retur; uavklarte forløp; administrative oppgaver med egen telling for roller brukeren har; samlede oppgaver av samme type uten å skjule dagens frister; snarveier til egne miljøer; ingenting venter.
- **Ser / handler:** brukeren selv. Administrative oppgaver bare for den som har rollen og er habil.
- **Regler:** UX-IA-005, UX-IA-012, UX-IA-016–019, UX-JRN-012, UX-INT-010, UX-P08, UX-P16, UX-PRIV-006.
- **Forløp:** begge.
- **UI-pakke:** WP-80; hver pakke legger sine oppgaver til.

#### Finn

- **Oppgave:** finne en bestemt ting eller et miljø å bli med i.
- **Tilstander:** søk etter ting og miljøer; filteret «Venner»; område; ting som ikke er ledig nå (nøytral grunn); ingen treff.
- **Ser / handler:** innloggede, bare det deres miljøer og vennskap gir tilgang til. Skjulte miljøer vises aldri.
- **Regler:** UX-IA-001, UX-P20, UX-JRN-013, UX-PRIV-002, UX-PRIV-004, PS-OBJ-020, PS-ENV-001, PS-NFR-002.
- **Forløp:** normal.
- **UI-pakke:** WP-80; «Venner» i WP-27; miljøtreff lenker til WP-84.

#### Tingens side for andre

- **Oppgave:** forstå hva tingen er og om den kan lånes, og be om å låne den.
- **Tilstander:** ledig og når; ikke ledig (uten å røpe hvorfor, UX-PRIV-004); opprinnelse (miljø eller «Direkte mellom venner»); vilkår; egen åpen forespørsel; følger tingen; spørsmål og svar i miljøet; tilgang borte.
- **Ser / handler:** medlemmer av miljøer der tingen er publisert, og venner når tingen er synlig for venner. De kan be om å låne, følge tingen og stille spørsmål i miljøet. Gjennom et miljø vises eierne med navn (PS-ENV-015, WP-89).
- **Regler:** UX-INT-001, UX-P06, UX-PRIV-003, UX-PRIV-004, PS-OBJ-001, PS-OBJ-014, PS-OBJ-015, PS-OBJ-020, PS-DOM-008.
- **Forløp:** normal.
- **UI-pakke:** WP-83.

#### Låneforespørsel

- **Oppgave:** be om å låne en ting for en periode, med en valgfri melding.
- **Tilstander:** start (dato eller «så snart som mulig»); slutt som dato eller varighet, aldri begge; melding med forklaringen om hvem som ser den; vilkår; ansvarserklæring ved vennelån; gjennomgang; sendt; ikke sendt eller ukjent utfall.
- **Ser / handler:** den som kan se tingen og ikke eier den.
- **Regler:** UX-IA-013, UX-JRN-004, UX-JRN-006, UX-JRN-013, UX-INT-003, PS-LOAN-003, PS-LOAN-004, PS-NFR-005, PS-NFR-006.
- **Forløp:** normal.
- **UI-pakke:** WP-83.

#### Forespørselens side

- **Oppgave:** følge en forespørsel, og for utlåner: svare på den og se hva som blir bindende.
- **Tilstander:** venter på svar fra …; venter på at låntaker bekrefter nye vilkår; satt på vent fordi miljøet vurderer tingen; mangler ansvarserklæring; godkjent (videre til lånets side); avslått; trukket; avsluttet nøytralt fordi en annen forespørsel ble godkjent eller adgangen falt bort.
- **Ser / handler:** låntaker kan trekke og bekrefte nye vilkår. Tingens eiere ser periode, vilkår og kollisjoner og kan godkjenne, avslå og godta ansvarserklæringen. Den som godkjenner, blir ansvarlig utlåner.
- **Regler:** UX-IA-014, UX-JRN-004, UX-JRN-005, UX-INT-003, UX-INT-004, UX-EXC-005, PS-LOAN-002, PS-LOAN-005–008.
- **Forløp:** begge.
- **UI-pakke:** WP-83.

#### Lån

- **Oppgave:** se alle egne forespørsler og lån, som låner og som utlåner.
- **Tilstander:** filter «låner» og «låner bort»; kort status og hvem det ventes på per lån; avsluttede lån; ingen lån.
- **Ser / handler:** brukeren selv.
- **Regler:** UX-IA-006, UX-INT-004, PS-LOAN-001.
- **Forløp:** normal.
- **UI-pakke:** WP-80; lenker til WP-83 og WP-87.

#### Lånets side

- **Oppgave:** vite hva som er avtalt, hva som skjer nå, og gjøre neste praktiske steg.
- **Tilstander:** reservert (tid, praktisk informasjon, bekreft overlevering (én part er nok), foreslå endring, kanseller); utlånt (returtid, foreslå forlengelse, meld returnert; for parten som ikke registrerte overleveringen også «ble ikke overlevert» som underordnet valg); venter på at utlåner bekrefter retur; retur bekreftet med 30 sekunders angremulighet; gjennomført; endringsforslag venter på svar; ansvarsoverføring tilbudt; opprinnelse som kontekstmerke; tidslinje.
- **Ser / handler:** låntaker og ansvarlig utlåner. Andre medeiere ser en avgrenset visning og får bare handlinger de har rett til (UX-JRN-011, UX-PRIV-013).
- **Regler:** UX-IA-014, UX-JRN-007, UX-JRN-008, UX-JRN-009, UX-INT-001, UX-INT-002, UX-IA-008, PS-LOAN-008–011, PS-LOAN-015, PS-LOAN-016, PS-LOAN-020, PS-LOAN-022, PS-COM-008.
- **Forløp:** normal. Avvikene står [under](#lånets-side-i-avvik).
- **UI-pakke:** WP-87.

#### Anmeldelse og tilsvar

- **Oppgave:** vurdere et avsluttet lån, og svare én gang på en anmeldelse av seg selv.
- **Tilstander:** bare dimensjoner som kan vurderes; begrunnelse kreves ved 1–2; levert og skjult til begge har levert eller fristen går ut; publisert og låst; frist utløpt; satt på pause fordi lånet er gjenåpnet; tilsvar mulig eller gitt, også til anmeldelser uten tekst; varsel når anmeldelsene blir synlige (PS-TRUST-003, PS-TRUST-005).
- **Ser / handler:** partene i lånet, også etter blokkering. Den anmeldte kan gi ett tilsvar.
- **Regler:** UX-JRN-010, PS-TRUST-001–005, PS-TRUST-008, PS-TRUST-009.
- **Forløp:** normal.
- **UI-pakke:** WP-87.

#### Mine ting

- **Oppgave:** se egne og medeide ting og hvordan det står til med hver.
- **Tilstander:** kan lånes ut; utlånt; sperret (begrensning fra medeier, frysing, uavklart besittelse, sperret av plattformen); skjult fordi den ikke har vært tilgjengelig; arkivert; medeierinvitasjoner; pilotgrensen; ingen ting.
- **Ser / handler:** eiere og medeiere.
- **Regler:** UX-JRN-003, UX-JRN-011, UX-EXC-006, PS-OBJ-007, PS-OBJ-016, PS-OBJ-019.
- **Forløp:** normal.
- **UI-pakke:** WP-81.

#### Registrer og rediger en ting

- **Oppgave:** registrere en ting og bestemme hvor den vises, med samme skjema uansett inngang.
- **Tilstander:** tittel og kategori med pilotgrensen; beskrivelse og 1–5 bilder; tilgjengelighet i ett eller flere intervaller (uten tilgjengelighet kan tingen ikke tilbys); valgfrie vilkår; publisering i miljøer og «Venner» (av som standard); miljøet brukeren startet fra er forhåndsvalgt; gjennomgang; en medeier har lagret i mellomtiden; endrede vilkår må bekreftes på nytt i åpne forespørsler.
- **Ser / handler:** eiere og medeiere.
- **Regler:** UX-JRN-003, UX-P07, PS-OBJ-001–003, PS-OBJ-012, PS-OBJ-013, PS-OBJ-018–020, PS-LOAN-005, «Samtidig redigering» i [utlånsobjekter](../product-spec/03-utlansobjekter.md).
- **Forløp:** normal.
- **UI-pakke:** WP-81; «Venner» i WP-27.

#### Tingens side for eiere

- **Oppgave:** ha oversikt over én ting og forvalte den uten falsk kontroll over etablerte lån.
- **Tilstander:** kan lånes ut nå, eller hvorfor ikke; neste lån; publisering per miljø (ikke publisert, venter på godkjenning, aktiv, avvist, avpublisert, sperret); lån og forespørsler for tingen; medeiere, invitasjoner og begrensninger; arkivert; sletting venter på samtykke fra alle eiere; versjonshistorikk.
- **Ser / handler:** alle eiere. Hver medeier kan sette og oppheve egen begrensning, invitere og tre ut; bare ansvarlig utlåner handler i sitt lån.
- **Regler:** UX-JRN-011, UX-EXC-006, UX-INT-007, UX-INT-009, PS-OBJ-004–013, PS-OBJ-017.
- **Forløp:** begge.
- **UI-pakke:** WP-82.

#### Miljøets side

- **Oppgave:** forstå et miljø før innmelding, bruke det som medlem og håndtere egne medlems- og rollevalg.
- **Tilstander:** åpent (krav, regler, bli med); lukket (begrenset forhåndsvisning, søk); skjult (bare for den som er invitert eller medlem); søknad venter; aktivt medlem (tingene i miljøet, «Registrer en ting her», medlemsliste, kontakt administratorene, forlat miljøet); egen ventende rolleinvitasjon (administrator eller eierskap: godta eller avslå); passivt medlem forklart; under avvikling; ingen administrator kan behandle henvendelser nå.
- **Ser / handler:** innloggede innenfor det typen tillater; medlemmer ser og bruker innholdet, ser medlemslisten og ser hvem som eier tingene (PS-ENV-015). Mottakeren av en rolleinvitasjon svarer som medlem på miljøets side før en eventuell ny rolle blir aktiv.
- **Regler:** UX-IA-004, UX-IA-010, UX-JRN-002, UX-PRIV-002, UX-PRIV-003, UX-EXC-009, PS-ENV-001, PS-ENV-003, PS-ENV-004, PS-ENV-012, PS-ENV-014, PS-NFR-002.
- **Forløp:** normal.
- **UI-pakke:** WP-84.

#### Innmelding og invitasjon

- **Oppgave:** bli medlem på den måten typen krever.
- **Tilstander:** bli med med egenerklæring (åpent); søknad med svar på krav (lukket); mer informasjon etterspurt; godkjent; avslått; invitasjon mottatt og krav å fylle ut (skjult); kan ikke søke igjen (vises nøytralt).
- **Ser / handler:** den som søker eller er invitert. Svar på krav vises som opplysninger til miljøets medlemsprosess, ikke som profil.
- **Regler:** UX-JRN-002, UX-PRIV-009, PS-ENV-001, PS-ENV-004, PS-ENV-005, PS-ENV-010, PS-ENV-017, PS-ENV-019, PS-ENV-020, PS-NFR-008.
- **Forløp:** normal.
- **UI-pakke:** WP-84.

#### Medlemsliste

- **Oppgave:** se hvem som er med i miljøet og komme til personene.
- **Tilstander:** aktive medlemmer med navn og rolle; passive vises ikke; synlighet etter en typeendring følger PS-ENV-009.
- **Ser / handler:** aktive medlemmer. Ikke-medlemmer ser ingen liste.
- **Regler:** PS-ENV-009, UX-PRIV-009, [visjon 03](../vision/03-miljoer.md).
- **Forløp:** normal.
- **UI-pakke:** WP-84.

#### Opprett miljø

- **Oppgave:** starte et miljø og forstå hva typen betyr.
- **Tilstander:** navn, type forklart i vanlige ord, beskrivelse, område og krav; opprettet, med brukeren som eier og administrator.
- **Ser / handler:** innloggede.
- **Regler:** PS-ENV-001–003, UX-PRIV-001, UX-P11.
- **Forløp:** normal.
- **UI-pakke:** WP-84.

#### Personens side

- **Oppgave:** forstå hvem en person er i en konkret situasjon, og styre relasjonen.
- **Tilstander:** venn; ikke venn; ikke venn, og forespørsel kan ikke sendes nå (etter avslag, vist nøytralt); venneforespørsel sendt eller mottatt; blokkert av deg; tillitsprofil per rolle med datagrunnlag og usikkerhet; få anmeldelser; tingene personen har gjort synlige for venner; ingen side for slettede eller blokkerende brukere.
- **Ser / handler:** den som har legitim tilgang (venner, felles miljø, part i lån). Handlinger etter relasjon: send, trekk, godta eller avslå forespørsel, fjern venn, blokker og opphev blokkering.
- **Regler:** UX-IA-010, UX-IA-019, UX-P15, UX-PRIV-007, UX-PRIV-010, UX-PRIV-012, PS-USR-002–007, PS-USR-011, PS-USR-012, PS-TRUST-006, PS-TRUST-007, PS-TRUST-010, PS-TRUST-011, PS-TRUST-017.
- **Forløp:** normal.
- **UI-pakke:** WP-86; venners ting i WP-27.

#### Samtaler

- **Oppgave:** snakke privat med en annen part, særlig om et konkret lån.
- **Tilstander:** privat samtale, én per person, med de pågående lånene mellom dere (PS-COM-017); strukturert første kontakt mottatt, der mottakeren kan åpne for fri samtale; smal logistikk-kanal etter blokkering; ingen lesebekreftelser; enheten er ikke koblet; skjult fra egen liste; ingen samtaler.
- **Ser / handler:** deltakerne. Ved første kontakt mellom ikke-venner er det bare mottakeren av den strukturerte henvendelsen som kan åpne fri samtale.
- **Regler:** UX-IA-001, UX-EXC-004, PS-COM-001, PS-COM-004–007, PS-COM-009, PS-COM-017, PS-COM-018, PS-USR-005.
- **Forløp:** begge.
- **UI-pakke:** WP-80, med enhetene under [enheter for privat chat](#enheter-for-privat-chat); åpning av fri samtale fra strukturert kontakt, demping, arkivering og start fra personens side står under «Senere» i UI-planen.

#### Enheter for privat chat

Privat chat leses bare på enheter brukeren selv har godkjent. Innlogging alene gir ingen tilgang til samtalene, og en ny enhet ser bare meldinger som sendes etter at den ble koblet til ([ADR-0010](../architecture/decisions/ADR-0010-e2ee-protokoll-enheter-og-recovery.md)). Flatene under finnes allerede (WP-43) og tas over på designsystemet i WP-80 uten å endre hva de gjør. Som resten av privat chat er de av for ekte brukere til Port C, som krever at nøkkel- og enhetstap har definert UX ([kvalitetsportene](../implementation/quality-gates.md)).

##### Slå på privat chat på første enhet

- **Oppgave:** ta i bruk privat chat første gang, slik at denne enheten blir den første som kan lese samtalene.
- **Tilstander:** ikke slått på, med kort forklaring og «Slå på privat chat»; slått på, videre til samtalene; «Om krypteringen» sier hva krypteringen beskytter mot og ikke, og at ingen får vite om en melding er lest; chat er åpen i en annen fane; kunne ikke hentes, prøv igjen.
- **Ser / handler:** brukeren selv, på enheten.
- **Regler:** PS-COM-004, PS-COM-005, PS-NFR-007, ADR-0010 punkt 3, 13 og 14.
- **Forløp:** normal.
- **UI-pakke:** WP-80 (finnes fra WP-43).

##### Koble til en ny enhet

- **Oppgave:** få privat chat på en enhet til når kontoen allerede har chat på en annen.
- **Tilstander:** enheten er ikke koblet, med forklaring om at den må godkjennes fra en annen enhet og bare ser nye meldinger; QR-kode og en kode på 26 tegn for den som ikke kan skanne; venter på godkjenning; koblet, videre til samtalene; koblingen ble ikke fullført eller koden har utløpt, med ny kode; allerede koblet; enheten har mistet nøklene (for eksempel fordi nettleserdataene er slettet) og må logge inn igjen og kobles på nytt.
- **Ser / handler:** brukeren selv, på den nye enheten. Har brukeren ingen annen enhet med chat, vises veien til [tilbakestilling](#tilbakestill-privat-chat).
- **Regler:** PS-COM-005, PS-NFR-007, ADR-0010 punkt 5 og 8.
- **Forløp:** normal.
- **UI-pakke:** WP-80 (finnes fra WP-43).

##### Godkjenn en ny enhet fra en eksisterende enhet

- **Oppgave:** på en enhet som allerede har chat: godkjenne den nye enheten ved å skanne QR-koden eller skrive inn koden.
- **Tilstander:** skann med kameraet; skriv inn koden når kameraet mangler eller ikke kan brukes; enheten som ber om tilgang og når den ba, vises før brukeren godkjenner eller avbryter; godkjent; fant ingen enhet med koden (feil, utløpt eller allerede brukt).
- **Ser / handler:** brukeren selv, på en godkjent enhet. Kameraet brukes bare på denne siden.
- **Regler:** PS-COM-005, ADR-0010 punkt 5, UX-INT-003.
- **Forløp:** normal.
- **UI-pakke:** WP-80 (finnes fra WP-43). Overføring av gammel historikk ved kobling er ikke bygget (se [hull](#hull-flater-uten-ui-pakke)).

##### Mine enheter

- **Oppgave:** se hvilke enheter som kan lese de private samtalene, fjerne en tapt eller ukjent enhet, og finne veien til å koble til en ny.
- **Tilstander:** enhetene med når de ble lagt til, og hvilken som er denne; enheter som venter på godkjenning nå; fjern en annen enhet, med konsekvensen at den stenges ute med en gang, logges ut og ikke kan lese nye meldinger; fjern denne enheten, med konsekvensen at den mister chatten og alt den har lagret av samtaler, og at brukeren logges ut her; fjernet.
- **Ser / handler:** brukeren selv, på en godkjent enhet. Nås fra Samtaler.
- **Regler:** UX-INT-007, PS-COM-005, ADR-0010 punkt 4 og 7.
- **Forløp:** begge.
- **UI-pakke:** WP-80 (finnes fra WP-43).

#### Konto og innstillinger

- **Oppgave:** forvalte egen konto, relasjoner, saker og varsler.
- **Tilstander:** venner, forespørsler og blokkerte; egne saker; varslingsvalg per nivå; profilfelt og synlighet; slette konto, med hva som hindrer sletting.
- **Ser / handler:** brukeren selv.
- **Regler:** UX-IA-003, UX-IA-020, UX-PRIV-001, PS-USR-002, PS-COM-002, PS-COM-003, PS-ADM-004, PS-ADM-005, PS-ADM-012.
- **Forløp:** begge.
- **UI-pakke:** WP-80 (eksisterende varslingsvalg, kontostatus, deaktivering/reaktivering og sletting), WP-86 (relasjoner) og WP-88 (egne saker). Profilbildet, med beskjæring og synlighetsvalg, ligger på Konto og vises som sirkel (PS-USR-002). Presentasjon og synlighetsvalg for andre profilfelt står under «Senere».

### Avvik og unntak

#### Lånets side i avvik

- **Oppgave:** forstå hva som er uavklart og finne veien videre, på samme side som lånet.
- **Tilstander:** avventer overleveringsavklaring (72 timer); ikke gjennomført; avventer returavklaring; forsinket (bare når det er kjent at låntaker har tingen); usikker/uenighet; gjenåpnet fordi en tidligere retur er bestridt; avsluttet som administrativt uavklart; stanset av plattformen (skilt fra kansellering); rapporter problem etter angrefristen; skade, mangel eller tap registrert av en part, med motpartens svar (PS-LOAN-023); be miljøet om mekling.
- **Ser / handler:** partene. I miljølån kan miljøets administratorer mekle gjennom en sak.
- **Regler:** UX-EXC-001–003, UX-EXC-007, UX-EXC-010, UX-INT-001, UX-P23, PS-LOAN-011–014, PS-LOAN-017–019, PS-LOAN-022, PS-LOAN-023, PS-COM-012.
- **Forløp:** avvik.
- **UI-pakke:** WP-87; meklingssaken i WP-88.

#### Kansellering før overlevering

- **Oppgave:** avslutte et godkjent lån før tingen er overlevert.
- **Tilstander:** konsekvens for den andre parten; kansellert; ikke lenger mulig etter overlevering.
- **Ser / handler:** begge parter.
- **Regler:** PS-LOAN-011, UX-INT-007, UX-P17.
- **Forløp:** avvik.
- **UI-pakke:** WP-87.

#### Bekreft kontroll over tingen

- **Oppgave:** for eier: bekrefte at man har tingen igjen etter et uavklart lån, så den kan lånes ut igjen.
- **Tilstander:** venter på bekreftelse (på Hjem og tingens side); bekreftet.
- **Ser / handler:** registrerte eiere av tingen.
- **Regler:** PS-LOAN-019, PS-OBJ-005, UX-IA-005.
- **Forløp:** avvik.
- **UI-pakke:** WP-87 (Hjem) og WP-82 (tingens side).

#### Ansvarsoverføring mellom medeiere

- **Oppgave:** gi ansvaret for et pågående lån til en annen medeier.
- **Tilstander:** tilbudt; godtatt; avslått; trukket; låntakers samtykke kreves når mottakeren ble medeier etter godkjenningen.
- **Ser / handler:** ansvarlig utlåner tilbyr; medeieren svarer; låntaker samtykker ved behov.
- **Regler:** PS-LOAN-008, PS-LOAN-009, UX-JRN-011.
- **Forløp:** avvik.
- **UI-pakke:** WP-87. Overtakelse når utlåner er utilgjengelig vises ikke før OD-0016.

#### Vilkår endret mens forespørselen venter

- **Oppgave:** for låntaker: se hva som er endret og bekrefte de nye vilkårene eller trekke forespørselen.
- **Tilstander:** satt på vent; nye vilkår bekreftet; trukket.
- **Ser / handler:** låntaker bekrefter; eierne ser at forespørselen venter på det.
- **Regler:** PS-LOAN-005, UX-INT-004, scenario 6 i [UX-scenariovalideringen](07-scenariovalidering.md).
- **Forløp:** avvik.
- **UI-pakke:** WP-83; forklaringen ved redigering i WP-81.

#### Blokkering og tapt relasjon under lån

- **Oppgave:** fullføre et lån når vennskap, medlemskap eller kontakt er borte.
- **Tilstander:** vanlig chat stengt, smal logistikk-kanal merket; lånet består selv om miljø eller vennskap er borte; ingen lenker som gjenåpner profil eller miljø.
- **Ser / handler:** partene, med bare det som trengs for å avslutte lånet.
- **Regler:** UX-EXC-004, UX-EXC-005, UX-PRIV-007, PS-COM-007, PS-USR-007, PS-LOAN-002, PS-LOAN-021, PS-DOM-002.
- **Forløp:** avvik.
- **UI-pakke:** WP-87 og WP-86.

#### Medeierkonflikt og frysing

- **Oppgave:** for eiere: forstå at tingen ikke kan lånes ut og hva som må til.
- **Tilstander:** begrenset av en medeier; fryst fordi medeiere har blokkert hverandre; andre ser bare at tingen ikke er ledig.
- **Ser / handler:** eiere. Den som satte begrensningen kan oppheve den.
- **Regler:** UX-EXC-006, PS-OBJ-008–011, scenario 8 i [UX-scenariovalideringen](07-scenariovalidering.md).
- **Forløp:** avvik.
- **UI-pakke:** WP-82.

#### Typeendring og nye krav, sett fra medlemmet

- **Oppgave:** ta et personlig valg når miljøet blir mindre privat, og oppfylle nye krav i tide.
- **Tilstander:** lukket→åpent (akseptere, forlate eller ikke svare; 7 dager; ikke-svar gir passivt medlemskap); skjult→lukket (akseptere eller forlate; 7 dager; 2/3 må akseptere; den som ikke aksepterer, fjernes hvis endringen vedtas); strengere type (bare informasjon); nye krav med 14 dagers frist; passivt medlemskap og veien tilbake.
- **Ser / handler:** aktive medlemmer.
- **Regler:** UX-PRIV-008, PS-ENV-005, PS-ENV-006, PS-ENV-007, PS-ENV-008, PS-ENV-009.
- **Forløp:** avvik.
- **UI-pakke:** WP-84.

#### Rapportere og kontakte administratorene

- **Oppgave:** si fra om en person, en ting eller en anmeldelse, eller kontakte miljøets administratorer som funksjon.
- **Tilstander:** hvor rapporten går (miljøet; rapport til Lånbort vises som ikke tilgjengelig ennå); hva som skjer videre; sendt; saken følges fra Konto; ingen administrator kan behandle nå.
- **Ser / handler:** aktive medlemmer rapporterer i miljøet og kontakter administratorene. Rapport til Lånbort tilbys ikke før plattformforvalterne kan behandle saker (UX-EXC-011, OD-0023).
- **Regler:** UX-IA-007, UX-EXC-009, UX-EXC-011, PS-COM-010, PS-TRUST-010, PS-TRUST-013, PS-ENV-014, [visjon 07](../vision/07-tillit-anmeldelser-og-moderering.md) («Rapportering»).
- **Forløp:** avvik.
- **UI-pakke:** WP-88.

#### Sakens side for en part

- **Oppgave:** følge en sak man er part i, skrive når det er ens tur, og sende inn dokumentasjon.
- **Tilstander:** venter på behandler; din tur; egen forklaring levert og skjult for den andre parten; forklaringer delt; ingen behandler tilgjengelig; lukket med avslutningsmelding; henvendelse avsluttet eller rapport trukket av den som åpnet den; kopi av private meldinger valgt og sendt inn.
- **Ser / handler:** partene og den som meldte saken. Den som tok kontakt, kan avslutte henvendelsen, og den som rapporterte, kan trekke rapporten; en mekling lukkes bare av en habil administrator.
- **Regler:** UX-IA-007, UX-EXC-003, UX-PRIV-003, PS-COM-011–014, PS-COM-020, PS-COM-021.
- **Forløp:** avvik.
- **UI-pakke:** WP-88.

#### Melding om mulig dødsfall eller varig utilgjengelighet

- **Oppgave:** si fra om at en person man har et forhold til kan være død eller varig utilgjengelig.
- **Tilstander:** forklaring før innsending (starter bare en verifisering, gir ingen tilgang, falske meldinger er misbruk); sendt; melderen ser bare at saken behandles.
- **Ser / handler:** den som har et konkret felles forhold til personen.
- **Regler:** UX-EXC-008, PS-COM-015, PS-ADM-007, [visjon 06](../vision/06-kommunikasjon-varsler-og-saker.md).
- **Forløp:** avvik.
- **UI-pakke:** ingen.

#### Egen konto deaktivert, suspendert eller under avslutning

- **Oppgave:** forstå hva man fortsatt kan og må gjøre.
- **Tilstander:** ny aktivitet stanset; lån og saker som må avsluttes er fortsatt tilgjengelige; plattformstans vist uten mer begrunnelse enn nødvendig.
- **Ser / handler:** brukeren selv, med minimumstilgang.
- **Regler:** UX-EXC-007, PS-ADM-001–003, PS-LOAN-021.
- **Forløp:** avvik.
- **UI-pakke:** WP-80 på den eksisterende Konto-siden; lånets side (WP-87) viser handlingene som gjenstår.

#### Slette konto

- **Oppgave:** slette egen konto og forstå hva som forsvinner og hva som består.
- **Tilstander:** hindringer (pågående lån, ansvar, saker, miljøeierskap); konsekvensvisning; slettet, med «Tidligere bruker» i felles historikk.
- **Ser / handler:** brukeren selv.
- **Regler:** UX-INT-007, UX-PRIV-010, PS-ADM-004–006, PS-USR-010.
- **Forløp:** avvik.
- **UI-pakke:** WP-80 på den eksisterende Konto-siden.

#### Tilbakestill privat chat

- **Oppgave:** få privat chat igjen når brukeren ikke lenger har noen godkjent enhet å koble fra.
- **Tilstander:** konsekvensvisning før start: denne enheten får nye nøkler, alle andre enheter stenges ute, meldinger fra før kan ikke leses på nye enheter, og de brukeren skriver med får beskjed om at sikkerhetskoden er endret; kode sendt til e-posten for å bekrefte at det er brukeren; feil eller utløpt kode; for mange forsøk; tilbakestilt, med påkrevd varsel og e-post om tilbakestillingen. Hos kontaktene: «Sikkerhetskoden til … er endret», som må godtas før samtalen fortsetter.
- **Ser / handler:** brukeren selv, fra en enhet som ikke er koblet eller har mistet nøklene, og fra Mine enheter. Kontaktene godtar den nye sikkerhetskoden i samtalen.
- **Regler:** UX-INT-003, UX-INT-007, PS-COM-005, PS-NFR-007, ADR-0010 punkt 3, 7 og 8.
- **Forløp:** avvik.
- **UI-pakke:** WP-80 (finnes fra WP-43). Gjenoppretting med gjenopprettingsnøkkel uten å miste historikken er ikke bygget (se [hull](#hull-flater-uten-ui-pakke)), så tilbakestilling er i dag eneste vei når alle enheter er borte.

## Miljøadministrator

Miljøadministrator omfatter miljøets eier, som også er administrator, og administratoren som saksbehandler. Administrative handlinger ligger på miljøet og saken, ikke i et eget kontrollpanel, og rollen vises tydelig når den brukes (UX-PRIV-005, UX-PRIV-006). En inhabil administrator får ingen behandlingshandlinger (PS-USR-009).

#### Oppgaver på Hjem

- **Oppgave:** se hvilke administrative oppgaver som venter i egne miljøer.
- **Tilstander:** innmeldinger; ting som venter på godkjenning; saker i køen; svar på administrator- eller eierskapstilbud; miljø uten eier som trenger en ny.
- **Ser / handler:** miljøets administratorer.
- **Regler:** UX-IA-005, UX-IA-012, UX-JRN-012, UX-PRIV-006.
- **Forløp:** normal.
- **UI-pakke:** WP-85 og WP-88.

#### Administrer miljøet

- **Oppgave:** samle miljøets administrative oppgaver på ett sted i miljøet.
- **Tilstander:** hva som venter; rollen tydelig; eierens ekstra handlinger bare for eieren.
- **Ser / handler:** bare miljøets administratorer og eier.
- **Regler:** UX-JRN-012, UX-PRIV-005, UX-PRIV-006, UX-INT-001, PS-ENV-003.
- **Forløp:** normal.
- **UI-pakke:** WP-85.

#### Innmeldinger og invitasjoner

- **Oppgave:** vurdere søknader og invitere til miljøet.
- **Tilstander:** søknad med svar på krav; be om mer informasjon; godkjenn; avslå; avslå og steng for nye forsøk; passivt medlem som vil bli aktivt igjen; invitasjon sendt eller trukket; ingenting venter.
- **Ser / handler:** administratorer. Bare administratorer kan invitere til et skjult miljø.
- **Regler:** UX-PRIV-009, PS-ENV-004, PS-ENV-005, PS-ENV-010, PS-ENV-017–020, PS-NFR-008, [visjon 03](../vision/03-miljoer.md) («Krav ved innmelding»).
- **Forløp:** normal.
- **UI-pakke:** WP-85.

#### Medlemmer og utestengelse

- **Oppgave:** se medlemmene og hvem som er stengt ute fra nye forsøk.
- **Tilstander:** aktive og passive medlemmer; hvem som er stengt ute fra nye forsøk, og oppheving av det.
- **Ser / handler:** administratorer. En habil administrator kan avslutte et aktivt medlemskap med begrunnelse og velge separat om personen også stenges ute (PS-ENV-021, ikke bygget).
- **Regler:** PS-ENV-004, PS-ENV-009, PS-ENV-021, PS-TRUST-016, PS-TRUST-018, UX-PRIV-009.
- **Forløp:** avvik.
- **UI-pakke:** ingen.

#### Publiseringer og forhåndsgodkjenning

- **Oppgave:** bestemme hvilke ting som vises i miljøet.
- **Tilstander:** forhåndsgodkjenning av eller på (å slå den på setter publiserte ting og forespørsler på vent); venter; godkjent; avvist; sperret; sperre opphevet.
- **Ser / handler:** administratorer. Eieren av tingen varsles og ser status på tingens side.
- **Regler:** UX-EXC-007, PS-ENV-011, PS-OBJ-017, [visjon 03](../vision/03-miljoer.md) («Moderering av objekter i et miljø»).
- **Forløp:** begge.
- **UI-pakke:** WP-85.

#### Innstillinger og medlemskrav

- **Oppgave:** endre navn, beskrivelse, område og krav.
- **Tilstander:** lempet krav gjelder straks; nytt krav gir medlemmene 14 dagers frist; lagret.
- **Ser / handler:** administratorer.
- **Regler:** UX-INT-007, UX-PRIV-009, PS-ENV-002, PS-ENV-005, PS-ENV-006.
- **Forløp:** normal.
- **UI-pakke:** WP-85.

#### Roller og eierskap

- **Oppgave:** holde miljøet bemannet og ha én eier.
- **Tilstander:** administrator invitert, godtatt eller avslått; tre ut som administrator (ikke den siste); fjerne en administrator (bare eier); tilby eierskap; miljø uten eier, med 7 dager til å melde interesse og regelen for hvem som får det; ingen overtar, og miljøet avvikles.
- **Ser / handler:** administratorer; eierens ekstra handlinger bare for eieren.
- **Regler:** UX-EXC-009, PS-ENV-003, PS-ENV-013, PS-ENV-014.
- **Forløp:** begge.
- **UI-pakke:** WP-85.

#### Typeendring

- **Oppgave:** gjøre miljøet mer eller mindre privat med riktig medvirkning fra medlemmene.
- **Tilstander:** strengere type gjennomføres direkte, med konsekvens; lukket→åpent og skjult→lukket med frist og status for svarene; skjult→åpent ikke mulig i ett steg; vedtatt; ikke vedtatt; trukket.
- **Ser / handler:** administratorer starter og følger; medlemmene svarer selv (se [medlemmets side av saken](#typeendring-og-nye-krav-sett-fra-medlemmet)).
- **Regler:** UX-INT-007, UX-PRIV-008, PS-ENV-007, PS-ENV-008, PS-ENV-009.
- **Forløp:** avvik.
- **UI-pakke:** WP-85.

#### Avvikling

- **Oppgave:** avslutte miljøet kontrollert.
- **Tilstander:** konsekvensvisning; under avvikling med 7 dagers angrefrist; avbrutt; endelig.
- **Ser / handler:** bare eieren starter og avbryter; medlemmene ser at miljøet avvikles.
- **Regler:** UX-INT-007, PS-ENV-012, PS-ENV-013.
- **Forløp:** avvik.
- **UI-pakke:** WP-85.

#### Miljøets sakskø og saksbehandling

- **Oppgave:** behandle kontakt, rapporter og mekling i miljøet.
- **Tilstander:** felles kø; tatt av meg eller en annen; tilbake i køen fordi behandleren mistet rollen; inhabil; forklaringsrunde åpen; forklaringer delt; tiltak på en publisering, med varsel til eieren; rapporten trukket av den som meldte den; lånet avklart av partene, med «Lukk saken» som neste steg; lukket med avslutningsmelding. Å sende en rapport videre til Lånbort tilbys ikke før plattformforvalterne kan behandle saker (UX-EXC-011). Sakstyper: kontakt med administratorene, rapport i miljøet, mekling i et miljølån.
- **Ser / handler:** habile administratorer. Privat chat åpnes ikke for behandleren.
- **Regler:** UX-IA-007, UX-PRIV-006, UX-EXC-003, UX-EXC-009, UX-EXC-011, PS-COM-010–014, PS-COM-020–022, PS-USR-009, PS-TRUST-013, PS-TRUST-016, PS-TRUST-018.
- **Forløp:** avvik.
- **UI-pakke:** WP-88; administrativ avslutning av et lån som uavklart vises ikke før OD-0017.

#### Manglende behandlingsevne

- **Oppgave:** vise ærlig at ingen kan behandle noe nå.
- **Tilstander:** ingen habil administrator; prosessen venter; ingen knapp for å eskalere til plattformen.
- **Ser / handler:** medlemmer og søkere som venter, og administratorer som er inhabile.
- **Regler:** UX-EXC-009, PS-ENV-014, scenario 35 i [UX-scenariovalideringen](07-scenariovalidering.md).
- **Forløp:** avvik.
- **UI-pakke:** WP-84, WP-85 og WP-88.

## Plattformforvalter

Plattformforvalter er en eksplisitt global rolle, ikke det samme som systemutvikler (PS-USR-008). Handlingene ligger i plattformkontekst, og en inhabil forvalter får ingen behandlingshandlinger (UX-PRIV-006, PS-USR-009). Ifølge UI-planen vises plattformforvalternes kø ikke før WebAuthn er bygget (OD-0023), fordi handlingene avvises til da. Flatene står her så designet kan planlegges i fase 7.

#### Plattformkø

- **Oppgave:** se plattformsaker som venter og ta dem.
- **Tilstander:** rapporter til plattformen og rapporter tatt videre fra et miljø (tilbys ikke før forvalterne kan behandle dem, UX-EXC-011); verifiseringssaker om mulig dødsfall; tatt eller ikke; inhabil.
- **Ser / handler:** habile plattformforvaltere.
- **Regler:** UX-IA-005, UX-IA-007, UX-PRIV-005, UX-PRIV-006, PS-USR-008, PS-USR-009, PS-NFR-003.
- **Forløp:** avvik.
- **UI-pakke:** WP-88, skjult til OD-0023.

#### Plattformrapport og tiltak

- **Oppgave:** vurdere en rapport og treffe et begrunnet, sporbart tiltak.
- **Tilstander:** sperre en ting for nye lån overalt og oppheve det; fjerne en anmeldelse, teksten, én skår eller et tilsvar; ingen tiltak; lukket. Tiltaket viser hvem det gjelder, omfang, begrunnelse, hvem som besluttet og når.
- **Ser / handler:** habile plattformforvaltere.
- **Regler:** UX-INT-008, PS-TRUST-013–016, PS-TRUST-018, PS-OBJ-017, PS-OBJ-019, scenario 15 i [UX-scenariovalideringen](07-scenariovalidering.md).
- **Forløp:** avvik.
- **UI-pakke:** WP-88, skjult til OD-0023.

#### Verifisering ved mulig dødsfall

- **Oppgave:** behandle en melding fortrolig uten å endre konto, lån eller tilgang.
- **Tilstander:** åpen; dokumentasjon etterspurt; lukket. Representanttilgang finnes ikke i piloten.
- **Ser / handler:** bare habile plattformforvaltere.
- **Regler:** UX-EXC-008, UX-PRIV-011, PS-COM-015, PS-ADM-007, PS-ADM-008.
- **Forløp:** avvik.
- **UI-pakke:** WP-88, skjult til OD-0023; representantflaten utsatt til OD-0003.

#### Inngrep på kontoer

- **Oppgave:** suspendere og gjeninnsette, avslutte en konto kontrollert, og håndtere duplikater og falsk identitet.
- **Tilstander:** konsekvens for pågående lån (forespørsler avsluttes nøytralt, reserverte lån stanses, overleverte følges til retur); begrunnelse; registrert; opphevet (stansede reservasjoner kommer ikke tilbake).
- **Ser / handler:** habile plattformforvaltere, fra en sak i plattformkøen (PS-ADM-015). Stengt til OD-0023.
- **Regler:** UX-EXC-007, PS-ADM-015, PS-ADM-003, PS-ADM-009, PS-ADM-010, PS-ADM-014, PS-LOAN-011, PS-LOAN-021.
- **Forløp:** avvik.
- **UI-pakke:** ingen.

#### Inngrep i et miljø ved misbruk av administratorrollen

- **Oppgave:** stanse en administrators rettigheter eller overføre eierskap kontrollert når rollen misbrukes.
- **Tilstander:** begrunnelse; gjennomført; miljøets medlemmer ser bare resultatet.
- **Ser / handler:** habile plattformforvaltere, fra en sak i plattformkøen (PS-ADM-015). Stengt til OD-0023.
- **Regler:** PS-ADM-015, PS-ADM-014, PS-TRUST-016, [visjon 03](../vision/03-miljoer.md) («Administrasjon»).
- **Forløp:** avvik.
- **UI-pakke:** ingen.

#### Inhabilitet og manglende uavhengig behandling

- **Oppgave:** vise at en sak ikke kan behandles av den som er part eller rapportert, og at uavhengig behandling ikke finnes når ingen er habile.
- **Tilstander:** inhabil (ingen behandlingshandlinger, bare egen partsrolle); ingen habil forvalter.
- **Ser / handler:** plattformforvaltere og partene.
- **Regler:** UX-PRIV-006, PS-USR-009, PS-ADM-013, scenario 73 i [UX-scenariovalideringen](07-scenariovalidering.md).
- **Forløp:** avvik.
- **UI-pakke:** WP-88; den organisatoriske ordningen er OD-0008.

Utnevnelse av plattformforvaltere har ingen flate i appen; den skjer med en driftskommando til OD-0021 er avgjort.

## Kjerneflyten i fase 4

Designplanens fase 4 dekker én sammenhengende flyt. Flatene den går gjennom:

| Steg                  | Flate                                                                                                      | Viktigste avvik å ta med                                   |
| --------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Oppdage objekt        | [Finn](#finn), [miljøets side](#miljøets-side)                                                             | ikke ledig nå, uten å røpe hvorfor                         |
| Objektside            | [Tingens side for andre](#tingens-side-for-andre)                                                          | tilgang borte                                              |
| Låneforespørsel       | [Låneforespørsel](#låneforespørsel)                                                                        | ukjent utfall ved sending                                  |
| Godkjenning           | [Forespørselens side](#forespørselens-side)                                                                | nye vilkår, avsluttet nøytralt ved kollisjon               |
| Reservert lån         | [Lånets side](#lånets-side)                                                                                | foreslå endring, [kansellering](#kansellering-før-overlevering) |
| Overlevering          | [Lånets side](#lånets-side)                                                                                | [avventer overleveringsavklaring](#lånets-side-i-avvik)    |
| Aktivt lån            | [Lånets side](#lånets-side)                                                                                | forlengelse, nærmer seg retur                              |
| Retur                 | [Lånets side](#lånets-side)                                                                                | venter på returbekreftelse, angre, [avventer returavklaring](#lånets-side-i-avvik) |

## Dekningssjekk

### Sentrale sider i informasjonsarkitekturen

Alle sidene i UX-IA-modellens liste over sentrale sider er dekket:

| Side i UX-IA            | Flate i inventaret                                                                                           | UI-pakke             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------- |
| Hjem                    | [Hjem](#hjem), [oppgaver på Hjem](#oppgaver-på-hjem)                                                          | WP-80, WP-85, WP-88  |
| Finn                    | [Finn](#finn)                                                                                                | WP-80, WP-27         |
| Objekt                  | [For andre](#tingens-side-for-andre), [for eiere](#tingens-side-for-eiere)                                   | WP-83, WP-82         |
| Mine ting               | [Mine ting](#mine-ting)                                                                                      | WP-81                |
| Opprett/rediger objekt  | [Registrer og rediger en ting](#registrer-og-rediger-en-ting)                                                | WP-81                |
| Miljø                   | [Miljøets side](#miljøets-side), [administrer miljøet](#administrer-miljøet)                                 | WP-84, WP-85         |
| Lån / lånedetalj        | [Lån](#lån), [forespørselens side](#forespørselens-side), [lånets side](#lånets-side)                        | WP-80, WP-83, WP-87  |
| Samtaler                | [Samtaler](#samtaler), [enheter for privat chat](#enheter-for-privat-chat), [tilbakestilling](#tilbakestill-privat-chat) | WP-80                |
| Varslingssenter         | [Varslingssenteret](#varslingssenteret-og-varselslenker)                                                     | WP-80                |
| Profil / bruker         | [Personens side](#personens-side)                                                                            | WP-86                |
| Konto og innstillinger  | [Konto og innstillinger](#konto-og-innstillinger)                                                            | WP-80, WP-86, WP-88 |
| Sak                     | [Sakens side for en part](#sakens-side-for-en-part)                                                          | WP-88                |
| Rollebasert arbeidskø   | [Miljøets sakskø](#miljøets-sakskø-og-saksbehandling), [plattformkø](#plattformkø)                           | WP-88                |

Scenariene i [UX-scenariovalideringen](07-scenariovalidering.md) ligger alle på flater over. Scenario 62 (representant) har ingen flate i piloten (OD-0003).

### Hull: flater uten UI-pakke

Disse flatene følger av spesifikasjonen og UX-modellen, men ingen pakke i UI-planen bygger dem ennå:

- **Melding om mulig dødsfall** fra personens side eller et felles lån (PS-COM-015, UX-EXC-008).
- **Medlemmer og utestengelse** for administratorer, inkludert å oppheve at noen er stengt ute (PS-ENV-004). Å avslutte et aktivt medlemskap er vedtatt (PS-ENV-021), men ikke bygget.
- **Plattformforvalterens inngrep** på kontoer og miljøer, fra en sak i plattformkøen (PS-ADM-015). Venter på OD-0023.
- **Varsel før utlogging på en enhet med privat chat** (ADR-0010 punkt 7). Konto-sidens «Logg ut» har ikke dette varselet ennå; «Fjern denne enheten» i Mine enheter sier hva enheten mister.
- **Gjenopprettingsnøkkel og overføring av gammel historikk** for privat chat (ADR-0010 punkt 5 og 8, PS-COM-019). Begge er vedtatt som valgfrie for brukeren, men ikke bygget; til da er kobling fra en annen enhet eller tilbakestilling de eneste veiene.
- Presentasjon og synlighet for andre profilfelt, og demping og arkivering av lånesamtalen, står allerede under «Senere» i UI-planen.

### Åpne beslutninger som berører flatene

Til en beslutning finnes, viser UI-et ikke funksjonen den gjelder.

| Beslutning | Flater                                                    | Til den er avgjort                                                 |
| ---------- | --------------------------------------------------------- | ------------------------------------------------------------------ |
| OD-0003    | Verifisering ved mulig dødsfall                           | Bare en fortrolig verifiseringssak; ingen representantflate        |
| OD-0004    | Varslingsvalg                                             | Varslingssenteret og e-post for påkrevde og tidskritiske varsler   |
| OD-0014    | Registrer og rediger en ting, forespørselens side         | Enhver vilkårsendring krever ny bekreftelse                        |
| OD-0016    | Ansvarsoverføring, lånets side i avvik                    | Ingen overtakelse eller snever mottaksbekreftelse                  |
| OD-0017    | Lånets side i avvik, miljøets sakskø                      | Ingen administrativ avslutning som uavklart                        |
| OD-0018    | Egen kontostatus                                          | Ingen automatisk dvale                                             |
| OD-0019    | Tingens side for andre                                    | «Følg» varsler bare når tingen blir ledig igjen                    |
| OD-0023    | Plattformkø og alle plattformforvalterflater              | Vises ikke                                                         |

### Vedtatt, men ikke bygget

Til disse er bygget, gjør appen det som står i siste kolonne. Prototypen for fase 7 viser begge deler, med en bryter.

| Regel      | Flater                                                    | Til den er bygget                                                  |
| ---------- | --------------------------------------------------------- | ------------------------------------------------------------------ |
| PS-ENV-018 | Innmeldinger og invitasjoner, personens side              | Administratorene inviterer bare egne venner                        |
| PS-ENV-019 | Innmeldinger og invitasjoner, innmelding og invitasjon    | «Be om mer informasjon» uten tekst og uten varsel til søkeren      |
| PS-ENV-020 | Innmeldinger og invitasjoner, miljøets side               | Den som er stengt ute, ser et vanlig avslag                        |
| PS-ENV-021 | Medlemmer og utestengelse                                 | Ingen handling for å fjerne et aktivt medlem                       |
| PS-ADM-015 | Inngrep på kontoer, inngrep i et miljø                    | Ingen flate (også stengt til OD-0023)                              |
