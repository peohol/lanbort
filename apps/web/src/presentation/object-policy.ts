/**
 * The pilot's limit for risky things (PS-OBJ-019), in the user's words. The
 * product spec is the canonical list; this is the one place it is worded for
 * the app, so wherever things are managed or registered says the same.
 */
export interface ObjectPolicyGroup {
  readonly heading: string;
  readonly items: readonly string[];
}

export const pilotObjectPolicy: readonly ObjectPolicyGroup[] = [
  {
    heading: "Kan ikke lånes ut gjennom Lånbort",
    items: [
      "Våpen, våpendeler og ammunisjon, også luftvåpen, armbrøster og annet som er laget for å skade. Kniver til vanlig bruk, som kjøkkenkniver og tollekniver, går fint.",
      "Fyrverkeri, sprengstoff og annen pyroteknikk.",
      "Legemidler, rusmidler, dopingmidler, alkohol, tobakk og nikotinprodukter.",
      "Farlige kjemikalier, drivstoff og fylte gassflasker, for eksempel plantevernmidler, løsemidler og propan. En gassgrill uten flaske går fint.",
      "Levende dyr.",
      "Ulovlige, stjålne eller forfalskede ting.",
    ],
  },
  {
    heading: "Venter til senere",
    items: [
      "Motorkjøretøy og andre kjøretøy med registrerings- eller forsikringsplikt, som bil, motorsykkel, moped, ATV, snøscooter, elsparkesykkel og registrert tilhenger. Vanlige sykler, også elsykler, sykkelvogner og trillevogner går fint.",
      "Båter med motor og vannscootere.",
      "Droner.",
      "Medisinsk utstyr og hjelpemidler, som rullestol, rullator, krykker og måleapparater.",
      "Sikkerhetsutstyr der skjult svikt kan gi alvorlig skade: bilseter, hjelmer, klatreseler og -tau, skredutstyr og redningsvester.",
      "Motorsager, ryddesager, flishuggere og andre maskiner med særlig høy skaderisiko.",
    ],
  },
];

export const pilotObjectPolicySummary =
  "Lånbort er i en prøveperiode og tar foreløpig ikke med alt som kan lånes ut. Kategorien «Annet» er for vanlige ting som ikke passer andre steder, ikke for noe på disse listene.";
