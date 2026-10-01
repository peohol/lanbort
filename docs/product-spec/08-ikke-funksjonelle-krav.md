# Ikke-funksjonelle krav

> **Status:** Arbeidsversjon av produktspesifikasjonen. Kravene beskriver egenskaper produktet må ha uavhengig av konkret teknologistakk.

### PS-NFR-001 — Autorisasjon skal håndheves på server-/datagrensen
**Forankring:** VP-08, VP-10, VP-16

UI-skjuling er ikke tilgangskontroll. Enhver lesing og mutasjon av kontekstbegrensede data skal valideres mot faktisk rettighet i den aktuelle konteksten.

### PS-NFR-002 — Skjulte miljøer skal være ikke-avslørende
**Forankring:** VP-08

Uautorisert tilgang skal ikke gi meningsfull forskjell som røper navn, eksistens, medlemskap, geografi, aktivitet eller andre data om skjult miljø.

### PS-NFR-003 — Minste privilegium skal gjelde alle administrative roller
**Forankring:** VP-16

Miljøadministrator, miljøeier, saksbehandler, plattformforvalter og eventuell representanttilgang skal ha avgrensede rettigheter. Tilgang skal kunne trekkes tilbake uten å omskrive historikk.

### PS-NFR-004 — Viktige mutasjoner skal være konsistente under samtidighet
**Forankring:** VP-07

Godkjenning av lån, reservasjonsendringer, retur, eierskapsoverføring og andre konkurrerende handlinger skal enten lykkes som en konsistent helhet eller avvises; systemet skal ikke kunne ende med to kolliderende sannheter.

### PS-NFR-005 — Gjentatte kall skal ikke duplisere viktige handlinger
**Forankring:** UX-P21, UX-P22

Nettverksretry eller dobbelttrykk skal ikke opprette flere lån, dobbelt bekrefte retur, sende samme invitasjon flere ganger eller utføre tilsvarende irreversible operasjoner flere ganger.

### PS-NFR-006 — Viktig arbeid skal tåle midlertidig nettverksbrudd
**Forankring:** UX-P22

Utfylt tekst/skjema skal så langt mulig bevares lokalt. Handlinger som etablerer eller endrer forpliktelser skal ikke vises som fullført før systemet faktisk har bekreftet dem.

### PS-NFR-007 — Privat chat skal støtte reell ende-til-ende-kryptering
**Forankring:** PS-COM-005

Arkitekturen skal utformes slik at server/driftspersonell ikke har ordinær tilgang til klartekst i privat part-til-part-chat. Administrative samtaler og strukturerte lånehendelser skal samtidig kunne behandles etter sine egne tilgangsregler.

### PS-NFR-008 — Data skal minimeres og formålsbindes
**Forankring:** VP-08

Systemet skal ikke samle inn mer presis identitet, geografi, medlemsinformasjon eller historikk enn funksjonen krever. Data innsamlet for medlemsverifisering skal ikke automatisk brukes til profil eller oppdagelse.

### PS-NFR-009 — Revisjonshistorikk skal være manipulasjonsrobust
**Forankring:** VP-15

Kritiske administrative og avtalemessige hendelser skal kunne rekonstrueres i riktig rekkefølge med aktør og tidspunkt. Ordinære brukere eller administratorer skal ikke kunne slette historikk som forklarer gjeldende rettighet eller avtale.

### PS-NFR-010 — Universell utforming er grunnkrav
**Forankring:** UX-P10

Kjernefunksjoner skal kunne brukes med tastatur og relevante hjelpemidler, uten informasjon som bare bæres av farge, og med lesbar struktur og tilstrekkelige berøringsmål. Konkret WCAG-mål fastsettes etter gjeldende lovkrav før offentlig lansering.

### PS-NFR-011 — Mobil først, samme produktmodell på desktop
**Forankring:** UX-P12; [Plattformretning](../vision/01-formal-prinsipper-og-produktgrenser.md)

Første versjon er nettleserbasert og skal fungere godt på mobil og desktop. Responsiv presentasjon skal ikke skape parallelle produktregler.

### PS-NFR-012 — Feil skal gi entydig resultat
**Forankring:** UX-P09, UX-P21

Etter en mislykket eller uklar operasjon skal systemet kunne vise om handlingen ikke skjedde, skjedde, eller fortsatt må avklares. Produktet skal unngå skjulte delvise mutasjoner.

### PS-NFR-013 — Sikkerhets- og personvernhendelser skal kunne undersøkes
**Forankring:** VP-17

Relevante tekniske sikkerhetshendelser kan logges med begrenset oppbevaring og streng tilgang slik at misbruk og uautorisert tilgang kan oppdages og undersøkes.

### PS-NFR-014 — Backup skal ikke omgå sletting og tilgang
**Forankring:** VP-08

Backup/gjenoppretting må kunne gjenopprette tjenesten uten at slettede eller tilgangsbegrensede data blir ordinært synlige igjen. Konkrete RPO/RTO og backupfrister fastsettes i arkitekturen.

### PS-NFR-015 — Produktet skal kunne begrenses til pilotmiljø
**Forankring:** [Begrenset pilot før bred utrulling](../vision/01-formal-prinsipper-og-produktgrenser.md)

Det skal være mulig å kjøre en lukket pilot med begrenset bruker-/miljøtilgang uten å endre domenemodellen.
