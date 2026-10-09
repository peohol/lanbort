import {
  type DimensionTrust,
  type Person,
  type ProfileReview,
  productTimeZone,
} from "@lanbort/contracts";
import type { IconName } from "@/components/icon";
import type { Tone } from "@/components/tag";
import type { PersonRole } from "@/navigation/routes";

/** A deleted account in shared history (UX-PRIV-010). */
export const formerUser = "Tidligere bruker";

/** A person by name; a deleted account as a former user. */
export const personName = (person: { readonly realName: string | null }) =>
  person.realName ?? formerUser;

/** Where the reader stands with the person, as the page says it. */
export interface RelationText {
  /** The tag beside the person's name, if the relation has one. */
  readonly tag: {
    readonly text: string;
    readonly icon: IconName;
    readonly tone: Tone;
  } | null;
  readonly tone: Tone;
  /** The card's heading: the situation in a few words. */
  readonly status: string;
  /** What the situation means, under the heading. */
  readonly detail: string;
}

/** What being friends gives (PS-USR-003, PS-OBJ-020). */
const friendsGive =
  "Som venner kan dere låne direkte av hverandre og se tingene dere har gjort synlige for venner.";

const sinceFormat = new Intl.DateTimeFormat("nb-NO", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: productTimeZone,
});

/**
 * The reader's relation to the person (PS-USR-003–006), said as a
 * situation. A block the person has placed is never part of it, and
 * nothing says that a request was declined (PS-USR-012).
 */
export function describeRelation(person: Person): RelationText {
  const { relation, realName, relationSince } = person;

  if (!relation) {
    return {
      tag: { text: "Deg", icon: "person", tone: "neutral" },
      tone: "neutral",
      status: "Dette er deg",
      detail:
        "Andre ser ikke nødvendigvis alt som står her. Anmeldelser fra lån ser bare venner og de som er med i et miljø sammen med deg nå.",
    };
  }

  if (relation.blockedByMe) {
    return {
      tag: { text: "Blokkert", icon: "block", tone: "danger" },
      tone: "danger",
      status: `Du har blokkert ${realName}`,
      detail:
        "Dere kan ikke få ny kontakt før du opphever blokkeringen. Lån dere har sammen, fortsetter.",
    };
  }

  switch (relation.friendship) {
    case "friends":
      return {
        tag: { text: "Venn", icon: "personCheck", tone: "positive" },
        tone: "positive",
        status: "Dere er venner",
        detail: [
          relationSince &&
            `Siden ${sinceFormat.format(new Date(relationSince))}.`,
          "Dere kan låne direkte av hverandre.",
        ]
          .filter(Boolean)
          .join(" "),
      };
    case "incoming_pending":
      return {
        tag: null,
        tone: "attention",
        status: `${realName} vil bli venn med deg`,
        detail: friendsGive,
      };
    case "outgoing_pending":
      return {
        tag: null,
        tone: "waiting",
        status: "Venneforespørselen er sendt",
        detail: `${realName} finner den i Hjem og i varslene. Dere blir venner når ${realName} godtar.`,
      };
    case "none":
      return {
        tag: null,
        tone: "neutral",
        status: "Dere er ikke venner",
        // Never why a request cannot be sent now (PS-USR-012).
        detail: relation.canRequest
          ? friendsGive
          : `Du kan ikke sende ${realName} en venneforespørsel nå.`,
      };
  }
}

const listFormat = new Intl.ListFormat("nb-NO", {
  style: "long",
  type: "conjunction",
});

/** The environments the reader shares with the person: «Lia og Tåsen». */
export const sharedNames = (person: Person) =>
  person.sharedEnvironments.length > 0
    ? listFormat.format(person.sharedEnvironments.map(({ name }) => name))
    : null;

/**
 * Why the reader sees the person (UX-PRIV-003): what gives them access to
 * the page now. Nothing for the reader's own page or someone they block,
 * where the card already says it.
 */
export function whyVisible(person: Person): string | null {
  const { relation, realName } = person;

  if (!relation || relation.blockedByMe) return null;

  const names = sharedNames(person);
  const shared = names && `begge er med i ${names}`;
  const reason =
    relation.friendship === "friends"
      ? shared
        ? `dere er venner og ${shared}`
        : "dere er venner"
      : shared
        ? `dere ${shared}`
        : {
            incoming_pending: `${realName} vil bli venn med deg`,
            outgoing_pending: `du har sendt ${realName} en venneforespørsel`,
            none: null,
          }[relation.friendship];

  return reason && `Du ser ${realName} fordi ${reason}.`;
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
export function describeDimension(
  trust: DimensionTrust,
  {
    fewSaid = false,
  }: {
    /** The page already says that the role's figures rest on little. */
    fewSaid?: boolean;
  } = {},
): {
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
    trust.count < fewScores && !fewSaid
      ? "Få vurderinger, så snittet sier lite."
      : null;

  return {
    summary: `${meanFormat.format(trust.mean)} av 5 fra ${scores(trust.count)}`,
    spread: `Fordeling: ${spread}`,
    note: [few, setAside].filter(Boolean).join(" ") || null,
  };
}
