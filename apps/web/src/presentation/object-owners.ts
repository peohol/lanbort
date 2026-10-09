import type {
  CoOwnerLoan,
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
import type { LoanStep } from "./loan-status";
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

  if (object.lentOut) return { status: "Utlånt", tone: "waiting", why: null };

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

/**
 * What a co-owner who is not a party may do on a loan of the thing now
 * (PS-LOAN-009, PS-LOAN-015, PS-LOAN-019), worded as what each step does
 * (UX-INT-003). They cannot open the loan itself, so the steps are here.
 */
export function coOwnerLoanSteps(loan: CoOwnerLoan): LoanStep[] {
  const api = `/api/loans/${loan.loanId}`;
  const { transfer, title } = loan;
  const steps: LoanStep[] = [];

  // The list only has transfers to the caller: an offer to answer, or
  // their own takeover, which they proposed and may take back.
  if (transfer?.kind === "voluntary" && !transfer.recipientAccepted) {
    const answer = `${api}/responsibility/${transfer.id}`;
    steps.push(
      { label: "Bli ansvarlig utlåner", path: `${answer}/accept`, body: {} },
      {
        label: "Ikke bli ansvarlig utlåner",
        path: `${answer}/decline`,
        body: {},
      },
    );
  } else if (transfer?.kind === "takeover") {
    steps.push({
      label: "Trekk tilbake overtakelsen",
      path: `${api}/responsibility/${transfer.id}/withdraw`,
      body: {},
    });
  }

  if (loan.mayTakeOver) {
    steps.push({
      label: "Overta som ansvarlig utlåner",
      path: `${api}/responsibility/take-over`,
      body: {},
    });
  }

  if (loan.pending) {
    steps.push({
      label: "Angre bekreftelsen",
      path: `${api}/return/undo`,
      body: {},
    });
  } else if (loan.mayConfirmReceipt) {
    steps.push({
      label: `Jeg har fått tilbake ${title}`,
      path: `${api}/return`,
      body: { agreementVersion: loan.agreementVersion, outcome: "received" },
    });
  }

  if (loan.mayConfirmControl) {
    steps.push({
      label: `Jeg har ${title} igjen`,
      path: `${api}/control`,
      body: {},
    });
  }

  return steps;
}

/** Where such a loan stands, as the co-owner needs to know it. */
export function describeCoOwnerLoan(loan: CoOwnerLoan): string {
  if (loan.mayConfirmControl) {
    return "Lånet ble avsluttet uten at det ble avklart om tingen kom tilbake. Den kan ikke lånes ut igjen før en eier bekrefter at dere har den.";
  }

  const { transfer } = loan;

  if (transfer?.kind === "takeover") {
    return "Du har bedt om å overta som ansvarlig utlåner. Venter på at låntakeren godtar det.";
  }

  if (transfer && !transfer.recipientAccepted) {
    return "Du er spurt om å bli ansvarlig utlåner for lånet.";
  }

  if (transfer) {
    return "Du har sagt ja til å bli ansvarlig utlåner. Venter på at låntakeren godtar det.";
  }

  if (loan.pending) {
    return "Du har bekreftet at tingen er levert tilbake. Du kan angre en kort stund.";
  }

  return "Ansvarlig utlåner er ikke tilgjengelig, så du kan ta over eller bekrefte returen.";
}

/** Where a thing is shown now, as Mine ting says it (PS-OBJ-006, PS-OBJ-020). */
export interface WhereShown {
  /** The environments it is shown in, or waits for approval in. */
  readonly environments: readonly string[];
  readonly friends: boolean;
}

export function whereShown(list: {
  readonly publications: readonly ObjectPublication[];
  readonly friends: unknown;
}): WhereShown {
  return {
    environments: list.publications.flatMap((publication) =>
      withdrawable(publication) && publication.environment
        ? [
            publication.status === "pending"
              ? `${publication.environment.name} (venter på godkjenning)`
              : publication.environment.name,
          ]
        : [],
    ),
    friends: list.friends !== null,
  };
}

/** One place the thing can be shown, as the owners' «Hvor den vises» lists it. */
export interface ShownPlace {
  readonly key: string;
  /** Null when the owners no longer share a membership there. */
  readonly environment: { readonly id: string; readonly name: string } | null;
  /** The latest publication there; null where it never was. */
  readonly publication: ObjectPublication | null;
  /** The user may publish it here now (PS-OBJ-006, PS-OBJ-017). */
  readonly publishable: boolean;
}

/**
 * Every environment the thing is or was published in, and every other one
 * the user may publish it in, one row each: the latest publication per
 * environment comes from the API, so nothing is listed twice.
 */
export function shownPlaces(
  publications: readonly ObjectPublication[],
  environments: readonly EnvironmentSummary[],
): ShownPlace[] {
  const open = new Set(
    publishableEnvironments(environments, publications).map(({ id }) => id),
  );
  const listed = new Set(
    publications.flatMap(({ environment }) =>
      environment ? [environment.id] : [],
    ),
  );

  return [
    ...publications.map((publication) => ({
      key: publication.id,
      environment: publication.environment,
      publication,
      publishable:
        publication.environment !== null &&
        open.has(publication.environment.id),
    })),
    ...environments
      .filter(({ id }) => open.has(id) && !listed.has(id))
      .map(({ id, name }) => ({
        key: id,
        environment: { id, name },
        publication: null,
        publishable: true,
      })),
  ];
}
