import type { UserActor } from "../actor";
import {
  type ActorInput,
  type ActorRule,
  allow,
  type Decision,
  deny,
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
