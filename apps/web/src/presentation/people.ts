import type { DimensionTrust, Person, ProfileReview } from "@lanbort/contracts";
import type { Tone } from "@/components/tag";
import type { PersonRole } from "@/navigation/routes";

/** A deleted account in shared history (UX-PRIV-010). */
export const formerUser = "Tidligere bruker";

/** A person by name; a deleted account as a former user. */
export const personName = (person: { readonly realName: string | null }) =>
  person.realName ?? formerUser;

/** Where the reader stands with the person, in words and as a tag. */
export interface RelationText {
  readonly tag: string | null;
  readonly tone: Tone;
  readonly status: string;
}

/**
 * The reader's relation to the person (PS-USR-003–006), said as a
 * situation. A block the person has placed is never part of it.
 */
export function describeRelation(person: Person): RelationText {
  const { relation, realName } = person;

  if (!relation) {
    return {
      tag: "Deg",
      tone: "neutral",
      status: "Dette er deg, slik andre med tilgang ser deg.",
    };
  }

  if (relation.blockedByMe) {
    return {
      tag: "Blokkert",
      tone: "danger",
      status: `Du har blokkert ${realName}. Dere kan ikke få ny kontakt før du opphever blokkeringen.`,
    };
  }

  switch (relation.friendship) {
    case "friends":
      return { tag: "Venner", tone: "positive", status: "Dere er venner." };
    case "incoming_pending":
      return {
        tag: "Vil bli venn med deg",
        tone: "waiting",
        status: `${realName} vil bli venn med deg.`,
      };
    case "outgoing_pending":
      return {
        tag: "Venneforespørsel sendt",
        tone: "waiting",
        status: `Venter på svar fra ${realName}.`,
      };
    case "none":
      // Never why a request cannot be sent now (PS-USR-012).
      return {
        tag: null,
        tone: "neutral",
        status: relation.canRequest
          ? "Dere er ikke venner."
          : `Dere er ikke venner. Du kan ikke sende ${realName} en venneforespørsel nå.`,
      };
  }
}

/** What each dimension asks about (PS-TRUST-001), by its code. */
const dimensionLabels: Record<string, string> = {
  pickup_on_time: "Hentet til avtalt tid",
  return_on_time: "Leverte tilbake til avtalt tid",
  condition_at_return: "Stand ved retur",
  available_at_handover: "Tilgjengelig ved overlevering",
  available_for_return: "Tilgjengelig ved retur",
  matches_description: "Som beskrevet",
  communication: "Kommunikasjon",
};

/** A dimension's label, or its code when Lånbort has no words for it yet. */
export const dimensionLabel = (code: string) => dimensionLabels[code] ?? code;

/** The person's role in a loan, as what the review is about. */
export const subjectRoleLabels: Record<ProfileReview["subjectRole"], string> = {
  borrower: "Som låntaker",
  lender: "Som utlåner",
};

/** The roles of a trust profile when nothing puts one first (OD-0032). */
const standardRoleOrder: readonly PersonRole[] = ["borrower", "lender"];

/**
 * A trust profile's roles, `first` at the top when the person's page was
 * opened in that role, otherwise in the standard order. Both are always
 * there (UX-PRIV-012).
 */
export const rolesInOrder = (
  first: PersonRole | null,
): readonly PersonRole[] =>
  first
    ? [first, ...standardRoleOrder.filter((role) => role !== first)]
    : standardRoleOrder;

const meanFormat = new Intl.NumberFormat("nb-NO", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/**
 * Below this many scores, a dimension says that its mean rests on little,
 * so a few scores never look as certain as many (UX-P15, PS-TRUST-006).
 */
export const fewScores = 5;

const scores = (count: number) =>
  `${count} ${count === 1 ? "vurdering" : "vurderinger"}`;

/**
 * One dimension of a role in words (PS-TRUST-006): the mean, how many
 * scores it rests on and how they spread over 1–5, without ever turning the
 * person into one number.
 */
export function describeDimension(trust: DimensionTrust): {
  readonly summary: string;
  readonly spread: string | null;
  readonly note: string | null;
} {
  const setAside =
    trust.setAside > 0
      ? `${scores(trust.setAside)} er holdt utenfor fordi returen ble bestridt etter publisering.`
      : null;

  if (trust.mean === null) {
    return { summary: "Ingen vurderinger ennå", spread: null, note: setAside };
  }

  const spread = trust.distribution
    .map((count, index) => ({ count, score: index + 1 }))
    .filter(({ count }) => count > 0)
    .reverse()
    .map(({ count, score }) => `${count} × ${score}`)
    .join(", ");
  const few =
    trust.count < fewScores ? "Få vurderinger, så snittet sier lite." : null;

  return {
    summary: `${meanFormat.format(trust.mean)} av 5 fra ${scores(trust.count)}`,
    spread: `Fordeling: ${spread}`,
    note: [few, setAside].filter(Boolean).join(" ") || null,
  };
}
