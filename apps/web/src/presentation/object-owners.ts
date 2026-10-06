import type {
  EnvironmentSummary,
  Loan,
  ObjectPublication,
  ObjectRestriction,
  ObjectRevision,
  ObjectRevisionChange,
  ObjectRevisionField,
  OwnObject,
} from "@lanbort/contracts";
import type { Tone } from "@/components/tag";
import { formatPeriod } from "./dates";
import { describeAvailability, formatInterval } from "./objects";

/**
 * Who someone is to the owners of a thing (PS-OBJ-007): the user
 * themselves («du» as the subject, «deg» otherwise), an owner or an
 * invited person by name, or someone who is no longer either without
 * guessing who (UX-PRIV-010).
 */
export function personName(
  object: Pick<OwnObject, "owners" | "pendingInvitations">,
  userId: string | null,
  me: string,
  subject = false,
): string {
  if (userId === me) return subject ? "du" : "deg";

  const known = [...object.owners, ...object.pendingInvitations].find(
    (person) => person.userId === userId,
  );

  if (!known) return "en tidligere eier";
  return known.realName ?? "en tidligere bruker";
}

/** The same, at the start of a sentence. */
export const capitalized = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);

/** A restriction's reach: one period, or every date (PS-OBJ-008). */
export function restrictionReach(restriction: ObjectRestriction): string {
  return restriction.period
    ? formatInterval(restriction.period).toLowerCase()
    : "på alle datoer";
}

/**
 * The owners' status of a thing (UX-EXC-006): whether it can be lent out
 * now, and if not, what the owners themselves have to resolve. Only owners
 * see why; others get a neutral answer (`describeAvailability`).
 */
export function ownerStatus(
  object: OwnObject,
  me: string,
  today: string,
): { status: string; tone: Tone; why: string | null } {
  if (object.status === "archived") {
    return {
      status: "Arkivert",
      tone: "neutral",
      why: "Tingen kan ikke lånes ut før den er gjenopprettet.",
    };
  }

  if (object.frozenForNewLoans) {
    return {
      status: "Kan ikke lånes ut nå",
      tone: "warning",
      why: "Eierne har blokkert hverandre. Nye lån kan avtales først når tingen har én eier igjen.",
    };
  }

  const veto = object.restrictions.find(
    (restriction) => restriction.period === null,
  );

  if (veto) {
    return {
      status: "Kan ikke lånes ut nå",
      tone: "warning",
      why: `${capitalized(personName(object, veto.setByUserId, me, true))} har stanset alle nye lån.`,
    };
  }

  if (object.availability.length === 0) {
    return {
      status: "Kan ikke lånes ut ennå",
      tone: "neutral",
      why: "Tingen har ingen tilgjengelighet. Legg til når den kan lånes.",
    };
  }

  const status = describeAvailability(object, today);

  return {
    status,
    tone: object.availableForNewLoans ? "positive" : "neutral",
    why: null,
  };
}

/**
 * The loan the owners most need to know about now: one under way, or else
 * the next one agreed (UX-IA-008).
 */
export function nextLoan(loans: readonly Loan[]): Loan | null {
  const current = loans.filter((loan) => loan.status !== "ended");
  const underway = current.find((loan) => loan.status !== "reserved");

  if (underway) return underway;

  return (
    current.toSorted((a, b) =>
      a.period.start.localeCompare(b.period.start),
    )[0] ?? null
  );
}

/** What the status card says about that loan. */
export function describeNextLoan(loan: Loan): string {
  const borrower = loan.parties.borrower.realName ?? "en tidligere bruker";

  return loan.status === "reserved"
    ? `Neste lån: ${borrower}, ${formatPeriod(loan.period)}`
    : `Lånt av ${borrower} til ${formatPeriod(loan.period)}`;
}

/** A publication's status in an environment, in words and tone. */
export const publicationStatusLabels: Record<
  ObjectPublication["status"],
  { label: string; tone: Tone }
> = {
  pending: { label: "Venter på godkjenning", tone: "waiting" },
  active: { label: "Synlig for medlemmene", tone: "positive" },
  rejected: { label: "Avvist av administratorene", tone: "danger" },
  blocked: { label: "Sperret av administratorene", tone: "danger" },
  unpublished: { label: "Ikke publisert lenger", tone: "neutral" },
};

/** Why a publication ended, when it did. */
export const publicationEndLabels: Record<
  NonNullable<ObjectPublication["endReason"]>,
  string
> = {
  withdrawn: "Trukket tilbake av en eier",
  access_lost: "Ingen av eierne er aktive medlemmer der lenger",
  environment_wound_down: "Miljøet er avviklet",
};

/** Publications the owners can still take back (PS-OBJ-006). */
export const withdrawable = (publication: ObjectPublication) =>
  publication.status === "pending" || publication.status === "active";

/**
 * Environments the user can publish the thing in now: those where they are
 * an active member and it is not already published, waiting or stopped by
 * the administrators, whose decision stands (PS-OBJ-017).
 */
export function publishableEnvironments(
  environments: readonly EnvironmentSummary[],
  publications: readonly ObjectPublication[],
): EnvironmentSummary[] {
  const taken = new Set(
    publications
      .filter((publication) => publication.status !== "unpublished")
      .flatMap((publication) =>
        publication.environment ? [publication.environment.id] : [],
      ),
  );

  return environments.filter(
    (environment) =>
      environment.membershipState === "active" && !taken.has(environment.id),
  );
}

/** What caused a version of the thing (PS-OBJ-013). */
export const revisionChangeLabels: Record<ObjectRevisionChange, string> = {
  baseline: "Første lagrede versjon",
  created: "Registrert",
  updated: "Endret",
  archived: "Arkivert",
  restored: "Gjenopprettet fra arkivet",
  image_added: "Bilde lagt til",
  image_removed: "Bilde fjernet",
  reverted: "Tidligere versjon hentet tilbake",
};

export const revisionFieldLabels: Record<ObjectRevisionField, string> = {
  title: "tittel",
  categoryId: "kategori",
  description: "beskrivelse",
  loanTerms: "vilkår",
  status: "status",
  availability: "tilgjengelighet",
  images: "bilder",
};

/**
 * Whether bringing back a version would change anything: its text,
 * category or general availability differs from the thing now. Images and
 * the archive state are never brought back (PS-OBJ-013).
 */
export function revertible(
  revision: ObjectRevision,
  object: OwnObject,
): boolean {
  const { content } = revision;

  return (
    revision.version < object.version &&
    (content.title !== object.title ||
      content.categoryId !== object.categoryId ||
      content.description !== object.description ||
      content.loanTerms !== object.loanTerms ||
      JSON.stringify(content.availability) !==
        JSON.stringify(object.availability))
  );
}
