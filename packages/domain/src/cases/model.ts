import type {
  CaseActionKind,
  CaseAudience,
  CaseCapacity,
  CaseHandling,
  CaseKind,
  CaseParticipantRole,
  CaseQueueReturnReason,
  CaseStatus,
  ReportTargetKind,
} from "@lanbort/contracts";

/**
 * Administrative cases (WP-45, PS-COM-010–015). The database guards who may
 * open, write in and handle a case; this module holds what only the domain
 * decides: whose turn it is, and what each viewer sees.
 */
export interface CaseRecord {
  readonly id: string;
  readonly kind: CaseKind;
  readonly environmentId: string | null;
  readonly loanId: string | null;
  /**
   * The user a report is about; for a reported review or response, its
   * author.
   */
  readonly subjectUserId: string | null;
  /** What a moderation report is about (WP-52), and its object or review. */
  readonly reportTarget: ReportTargetKind | null;
  readonly objectId: string | null;
  readonly reviewId: string | null;
  readonly escalatedFromCaseId: string | null;
  readonly openedByUserId: string;
  readonly openedAt: Date;
  readonly status: CaseStatus;
  readonly assigneeUserId: string | null;
  readonly closedAt: Date | null;
}

export interface ParticipantRecord {
  readonly userId: string;
  readonly role: CaseParticipantRole;
  readonly mayWrite: boolean;
}

/** Entries and actions share one order (`position`). */
export interface EntryRecord {
  readonly id: string;
  readonly authorUserId: string;
  readonly capacity: CaseCapacity;
  readonly audience: CaseAudience;
  readonly audienceUserId: string | null;
  readonly body: string;
  readonly correctsEntryId: string | null;
  readonly createdAt: Date;
  readonly position: bigint;
}

export interface ActionRecord {
  readonly kind: CaseActionKind;
  readonly actorUserId: string | null;
  readonly targetUserId: string | null;
  readonly reason: CaseQueueReturnReason | null;
  readonly at: Date;
  readonly position: bigint;
}

/**
 * How each kind lets its participants write:
 * - `turns`: one entry, then wait until a handler opens a new round (vision
 *   06, «Saker og prosessmeldinger»). A member contacting the
 *   administrators writes freely.
 * - `separateStatements`: the parties do not see each other's entries until a
 *   handler shares them (PS-COM-012). Only a mediation has two parties.
 */
export const caseKinds: Record<
  CaseKind,
  {
    readonly turns: boolean;
    readonly separateStatements: boolean;
    /** Handled by the platform stewards, not an environment's administrators. */
    readonly platform: boolean;
  }
> = {
  environment_contact: {
    turns: false,
    separateStatements: false,
    platform: false,
  },
  loan_mediation: { turns: true, separateStatements: true, platform: false },
  unavailability_report: {
    turns: true,
    separateStatements: false,
    platform: true,
  },
  environment_report: {
    turns: true,
    separateStatements: false,
    platform: false,
  },
  platform_report: { turns: true, separateStatements: false, platform: true },
};

/** The kinds the platform stewards handle (`app.case_platform_kind`). */
export const platformCaseKinds = (Object.keys(caseKinds) as CaseKind[]).filter(
  (kind) => caseKinds[kind].platform,
);

/** Where the latest sharing of the statements stands, if they were shared. */
export function sharedUpTo(actions: readonly ActionRecord[]): bigint | null {
  return actions.reduce<bigint | null>(
    (latest, action) =>
      action.kind === "statements_shared" ? action.position : latest,
    null,
  );
}

/**
 * Whether every participant sees the entry: one written to all of them,
 * where a party's own statement in a mediation counts only once a handler
 * has shared the statements written before that.
 */
export function sharedWithParties(
  entry: EntryRecord,
  kind: CaseKind,
  shared: bigint | null,
): boolean {
  if (entry.audience !== "parties") {
    return false;
  }

  if (entry.capacity === "handler" || !caseKinds[kind].separateStatements) {
    return true;
  }

  return shared !== null && entry.position < shared;
}

/** What a participant sees: their own entries and what was written to them. */
export function visibleToParticipant(
  entry: EntryRecord,
  userId: string,
  kind: CaseKind,
  shared: bigint | null,
): boolean {
  if (entry.capacity === "party" && entry.authorUserId === userId) {
    return true;
  }

  if (entry.audience === "party") {
    return entry.audienceUserId === userId;
  }

  return sharedWithParties(entry, kind, shared);
}

/**
 * How the participants see the handling: someone has it, it waits in the
 * queue, or nobody can handle it now (UX-EXC-009).
 */
export function handlingOf(
  assigneeUserId: string | null,
  handlerAvailable: boolean,
): CaseHandling {
  if (assigneeUserId !== null) {
    return "assigned";
  }

  return handlerAvailable ? "queued" : "unavailable";
}
