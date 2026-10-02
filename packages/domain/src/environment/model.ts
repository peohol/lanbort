import type {
  EnvironmentRole,
  EnvironmentState,
  EnvironmentType,
  MembershipOrigin,
  MembershipPassiveReason,
  MembershipReviewStage,
  MembershipState,
  RequirementAnswer,
  RequirementDraft,
  RequirementKind,
  WindDownReason,
} from "@lanbort/contracts";
import { DomainError } from "../errors";

/**
 * Pure rules of the environment core (WP-21, PS-ENV-001–006). Everything here
 * is derived from stored rows and the clock, so there is no second copy of
 * a membership's state to drift out of date.
 */
export interface EnvironmentRecord {
  readonly id: string;
  readonly type: EnvironmentType;
  readonly state: EnvironmentState;
  readonly name: string;
  readonly description: string | null;
  readonly audience: string | null;
  readonly objectFocus: string | null;
  readonly location: string | null;
  readonly version: number;
  readonly requirementsRevision: number;
}

export interface RequirementRecord {
  readonly id: string;
  readonly kind: RequirementKind;
  readonly text: string;
  readonly introducedInRevision: number;
}

export interface MembershipRecord {
  readonly id: string;
  readonly environmentId: string;
  readonly userId: string;
  readonly state: MembershipState;
  readonly origin: MembershipOrigin;
  readonly reviewStage: MembershipReviewStage | null;
  /** Start of the current or last active period. */
  readonly activatedAt: Date | null;
  readonly activationRevision: number | null;
  readonly transitionDeadline: Date | null;
  readonly passiveReason: MembershipPassiveReason | null;
  readonly passiveSince: Date | null;
}

export interface GivenAnswer {
  readonly requirementId: string;
  readonly answer: string | null;
}

/**
 * PS-ENV-006 pilot default: existing members get 14 days to meet new
 * requirements. A shorter period for safety or legal reasons is not
 * implemented; who may decide that is not specified.
 */
export const requirementTransitionDays = 14;

export function daysAfter(now: Date, days: number): Date {
  return new Date(now.getTime() + days * 86_400_000);
}

export function transitionDeadlineFrom(now: Date): Date {
  return daysAfter(now, requirementTransitionDays);
}

/**
 * An active member whose transition deadline has passed is passive, even
 * before the scheduled job has recorded it (PS-ENV-006).
 */
export function isTransitionExpired(
  membership: Pick<MembershipRecord, "state" | "transitionDeadline">,
  now: Date,
): boolean {
  return (
    membership.state === "active" &&
    membership.transitionDeadline !== null &&
    membership.transitionDeadline.getTime() <= now.getTime()
  );
}

export function effectiveState(
  membership: Pick<MembershipRecord, "state" | "transitionDeadline">,
  now: Date,
): MembershipState {
  return isTransitionExpired(membership, now) ? "passive" : membership.state;
}

/**
 * What a membership still lacks. For an active member these are only the
 * requirements introduced after the member was activated, which is what the
 * transition period is about; everyone else must meet every current one.
 */
export function unmetRequirements(
  membership: Pick<MembershipRecord, "state" | "activationRevision">,
  requirements: readonly RequirementRecord[],
  answeredIds: ReadonlySet<string>,
): RequirementRecord[] {
  const since =
    membership.state === "active" ? (membership.activationRevision ?? 0) : -1;

  return requirements.filter(
    (requirement) =>
      requirement.introducedInRevision > since &&
      !answeredIds.has(requirement.id),
  );
}

/**
 * Checks that the answers cover exactly the current requirements. A missing
 * or unknown requirement means the caller saw an outdated set, which gives
 * `conflict` so that nobody is bound by requirements they have not seen
 * (PS-ENV-005).
 */
export function validateAnswers(
  requirements: readonly RequirementRecord[],
  answers: readonly RequirementAnswer[],
): GivenAnswer[] {
  const byId = new Map(requirements.map((r) => [r.id, r]));
  const seen = new Set<string>();

  const given = answers.map((answer, index) => {
    const requirement = byId.get(answer.requirementId);

    if (seen.has(answer.requirementId)) {
      throw new DomainError("invalid_input", "Duplicate answer", [
        `answers.${index}.requirementId`,
      ]);
    }
    seen.add(answer.requirementId);

    if (!requirement) {
      throw new DomainError("conflict", "The requirements have changed");
    }

    const isInformation = "answer" in answer;
    if (isInformation !== (requirement.kind === "information")) {
      throw new DomainError("invalid_input", "Wrong kind of answer", [
        `answers.${index}`,
      ]);
    }

    return {
      requirementId: requirement.id,
      answer: isInformation ? answer.answer : null,
    };
  });

  if (seen.size !== requirements.length) {
    throw new DomainError("conflict", "The requirements have changed");
  }

  return given;
}

export interface RequirementPlan {
  /** Kept requirements with their new display position. */
  readonly kept: readonly { id: string; position: number }[];
  readonly added: readonly {
    kind: RequirementKind;
    text: string;
    position: number;
  }[];
  readonly retiredIds: readonly string[];
  readonly changed: boolean;
}

/** Turns the desired list into what to keep, add and retire. */
export function planRequirementChange(
  current: readonly RequirementRecord[],
  drafts: readonly RequirementDraft[],
): RequirementPlan {
  const currentIds = new Set(current.map((r) => r.id));
  const keptIds = new Set<string>();
  const kept: { id: string; position: number }[] = [];
  const added: { kind: RequirementKind; text: string; position: number }[] = [];

  drafts.forEach((draft, position) => {
    if ("id" in draft) {
      if (!currentIds.has(draft.id) || keptIds.has(draft.id)) {
        throw new DomainError("invalid_input", "Unknown requirement", [
          `requirements.${position}.id`,
        ]);
      }
      keptIds.add(draft.id);
      kept.push({ id: draft.id, position });
    } else {
      added.push({ kind: draft.kind, text: draft.text, position });
    }
  });

  const retiredIds = current.filter((r) => !keptIds.has(r.id)).map((r) => r.id);
  const reordered = kept.some(({ id }, index) => current[index]?.id !== id);

  return {
    kept,
    added,
    retiredIds,
    changed: added.length > 0 || retiredIds.length > 0 || reordered,
  };
}

/** The caller's relation to an environment, as the policies see it. */
export interface Viewer {
  /** The current (not ended) membership, with its effective state. */
  readonly membership: {
    readonly id: string;
    readonly state: Exclude<MembershipState, "ended">;
  } | null;
  /** Active role grants. */
  readonly roles: readonly EnvironmentRole[];
  /** Barred from new membership attempts (PS-ENV-004). */
  readonly restricted: boolean;
}

/** One of the caller's own environments, for their list. */
export interface OwnEnvironmentRow {
  readonly id: string;
  readonly type: EnvironmentType;
  readonly name: string;
  readonly state: MembershipState;
  readonly transitionDeadline: Date | null;
  readonly roles: readonly EnvironmentRole[];
}

/** What environment policies decide on, loaded inside the command. */
export interface EnvironmentAccess {
  readonly environment: EnvironmentRecord;
  /** The caller's current membership as stored. */
  readonly ownMembership: MembershipRecord | null;
  readonly viewer: Viewer;
}

/** PS-ENV-013: how long administrators may claim a vacant ownership. */
export const ownershipClaimDays = 7;

/** PS-ENV-012: how long the owner may cancel a voluntary winding down. */
export const windDownCancellationDays = 7;

/**
 * PS-ENV-012: only an active environment takes new members and new
 * environment-based activity. Publishing (WP-25) and loans (Phase 3) use the
 * same rule, so a winding-down environment starts nothing new.
 */
export function acceptsNewActivity(
  environment: Pick<EnvironmentRecord, "state">,
): boolean {
  return environment.state === "active";
}

export interface OwnershipVacancyRecord {
  readonly id: string;
  readonly claimDeadline: Date;
}

export interface WindDownRecord {
  readonly id: string;
  readonly reason: WindDownReason;
  readonly finalAt: Date;
  /** The job has closed the processes left waiting. */
  readonly settled: boolean;
}

/** The environment's current continuity exceptions, if any. */
export interface ContinuityRecord {
  readonly vacancy: OwnershipVacancyRecord | null;
  readonly windDown: WindDownRecord | null;
}

export function isClaimOpen(vacancy: OwnershipVacancyRecord, now: Date) {
  return now.getTime() < vacancy.claimDeadline.getTime();
}

/** Only a voluntary winding down, and only within its cancellation period. */
export function isWindDownCancellable(
  windDown: WindDownRecord,
  now: Date,
): boolean {
  return (
    windDown.reason === "voluntary" &&
    !windDown.settled &&
    now.getTime() < windDown.finalAt.getTime()
  );
}

/** An administrator who registered interest in a vacant ownership. */
export interface OwnershipCandidate {
  readonly userId: string;
  /** Start of the continuous administrator period. */
  readonly administratorSince: Date;
  readonly grantId: string;
}

/**
 * PS-ENV-013: the candidate who has been administrator the longest without
 * interruption becomes owner. When to register interest does not matter, so
 * there is no race to react first. The grant id only breaks exact ties, to
 * keep the outcome deterministic.
 */
export function chooseNewOwner(
  candidates: readonly OwnershipCandidate[],
): OwnershipCandidate | null {
  return (
    [...candidates].sort(
      (a, b) =>
        a.administratorSince.getTime() - b.administratorSince.getTime() ||
        (a.grantId < b.grantId ? -1 : a.grantId > b.grantId ? 1 : 0),
    )[0] ?? null
  );
}
