import type { AssuranceLevel, PlatformRole, UserActor } from "../actor";
import {
  type ActorInput,
  type ActorRule,
  allow,
  type Decision,
  deny,
  type PolicyInput,
  type ResourceRule,
} from "./policy";

/**
 * Builds an actor rule that only applies to signed-in users. Anyone else is
 * denied as unauthenticated, so the rule body can rely on a {@link UserActor}.
 */
export function userRule(
  check: (actor: UserActor, input: ActorInput) => Decision,
): ActorRule {
  return (input) =>
    input.actor.kind === "user"
      ? check(input.actor, input)
      : deny("unauthenticated");
}

export const requireUser: ActorRule = userRule(() => allow);

/**
 * The default for every product action: a signed-in user whose registration
 * is complete (PS-USR-001). Pending accounts may only finish registering.
 */
export const requireActiveAccount: ActorRule = userRule((actor) =>
  actor.accountStatus === "active" ? allow : deny("registration_required"),
);

/** Only the named scheduled job or worker may act. */
export function requireSystemProcess(process: string): ActorRule {
  return ({ actor }) =>
    actor.kind === "system" && actor.process === process
      ? allow
      : deny("forbidden");
}

/**
 * The actor holds the global product role (PS-USR-008). Roles come from
 * explicit grants in the database, never from auth metadata.
 */
export function requirePlatformRole(role: PlatformRole): ActorRule {
  return userRule((actor) =>
    actor.platformRoles.includes(role) ? allow : deny("forbidden"),
  );
}

const assuranceRank: Record<AssuranceLevel, number> = { aal1: 1, aal2: 2 };

/**
 * The session reached the given assurance level. `aal2` is the stronger
 * authentication privileged roles need; which mechanism provides it is not
 * decided (OD-0010), see `account/identity.ts`.
 */
export function requireAssurance(level: AssuranceLevel): ActorRule {
  return userRule((actor) =>
    assuranceRank[actor.authentication.assurance] >= assuranceRank[level]
      ? allow
      : deny("stronger_authentication_required"),
  );
}

/** How recently a user must have proven their identity for sensitive actions. */
export const recentAuthenticationMaxAgeMs = 10 * 60 * 1000;

/**
 * The user proved their identity (for example with an e-mail code) within
 * `maxAgeMs`. Used for sensitive actions so that a stolen or forgotten
 * session alone is not enough (docs/architecture/04, 08).
 */
export function requireRecentAuthentication(
  maxAgeMs = recentAuthenticationMaxAgeMs,
): ActorRule {
  return userRule((actor, { now }) => {
    const latest = Math.max(
      ...actor.authentication.methods.map((method) => method.at.getTime()),
    );

    return now.getTime() - latest <= maxAgeMs
      ? allow
      : deny("reauthentication_required");
  });
}

/**
 * Conflict of interest (PS-USR-009): a user who is a party to, reported in or
 * otherwise directly involved in the resource cannot act on it through an
 * administrative or platform role, whatever role they hold. Place it in the
 * administrative policy for the resource; the user's rights as an ordinary
 * party are decided by the party's own policy.
 */
export function requireNotInvolved<R, C>(
  involvedUserIds: (input: PolicyInput<R, C>) => Iterable<string>,
): ResourceRule<R, C> {
  return (input) => {
    if (input.actor.kind !== "user") {
      return allow;
    }

    for (const userId of involvedUserIds(input)) {
      if (userId === input.actor.userId) {
        return deny("conflict_of_interest");
      }
    }

    return allow;
  };
}
