import type { PlatformLookupResult } from "@lanbort/contracts";
import { accountStatusLabels, type ConsequenceRow } from "./interventions";

/**
 * A steward's own inquiry, where no report came in (PS-ADM-015,
 * «Plattformforvaltning v1», «Åpne saksgrunnlag»), and how its account or
 * thing is found: only from what the steward already has, the full e-mail
 * address or the link to its page, and every lookup is logged (OD-0055).
 */
export const inquiryKinds = {
  user: {
    label: "En konto",
    detail: "For eksempel en mulig duplikatkonto eller falsk identitet.",
    field: "Lenke eller e-postadresse",
    help: "Lim inn lenken til personens side, eller skriv hele e-postadressen. Det finnes ikke søk på navn, og hvert oppslag loggføres.",
    unreadable:
      "Skriv hele e-postadressen, eller lim inn lenken til personens side.",
    none: "Fant ingen konto med den adressen eller lenken.",
    own: "Du kan ikke åpne saksgrunnlag om din egen konto.",
  },
  object: {
    label: "En ting",
    detail: "For eksempel en ting som kan være farlig.",
    field: "Lenke til tingen",
    help: "Lim inn lenken til tingens side. Det finnes ikke søk, og hvert oppslag loggføres.",
    unreadable: "Lim inn lenken til tingens side.",
    none: "Fant ingen ting med den lenken.",
    own: "Du kan ikke åpne saksgrunnlag om din egen ting.",
  },
} as const;

export type InquiryKind = keyof typeof inquiryKinds;

type Found = NonNullable<PlatformLookupResult["found"]>;

/** What was found, as the steward checks it is the right one. */
export function foundText(found: Found): { name: string; detail: string } {
  if (found.kind === "user") {
    const status = accountStatusLabels[found.status];

    return {
      name: found.name ?? "Konto uten navn",
      detail: `Konto ${status}`,
    };
  }

  return {
    name: `«${found.title}»`,
    detail:
      found.ownerNames.length > 0
        ? `Eies av ${found.ownerNames.join(" og ")}`
        : "Uten eier",
  };
}

/** The last look before the inquiry is opened. */
export function inquiryConsequences(found: Found): ConsequenceRow[] {
  const whom =
    found.kind === "user" ? (found.name ?? "Den det gjelder") : "Eieren";

  return [
    {
      icon: "flag",
      tone: "goes_on",
      text: "Saken åpnes i plattformkøen, og du har den med en gang.",
    },
    {
      icon: "lock",
      tone: "note",
      text: "Grunnlaget blir første innlegg, bare for behandlerne.",
    },
    {
      icon: "hidden",
      tone: "note",
      text: `${whom} får aldri vite om saken, og ingen er part i den.`,
    },
    {
      icon: "shield",
      tone: "goes_on",
      text: "Inngrep gjør du etterpå fra saken, hvert med sin egen begrunnelse.",
    },
  ];
}
