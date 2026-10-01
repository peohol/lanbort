import type { Actor } from "../actor";
import { AuthorizationError, type DenialReason } from "../errors";

/**
 * Authorization is decided as actor + action + resource + context + current
 * state (ADR-0002, docs/architecture/04-autorisasjon-og-tilgang.md).
 *
 * A policy is a named action with two ordered rule lists:
 * - `actor` rules only look at the actor (signed in, account state, roles,
 *   authentication strength). They run before any resource is loaded, so an
 *   unauthorized caller never causes domain data to be read.
 * - `resource` rules look at the loaded resource, its context and current
 *   state.
 *
 * Every rule must explicitly allow. The first denial wins, and a policy
 * without rules cannot be defined, so the default is always deny.
 */
export type Decision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: DenialReason };

export const allow: Decision = Object.freeze({ allowed: true });

export function deny(reason: DenialReason): Decision {
  return { allowed: false, reason };
}

export interface ActorInput {
  readonly actor: Actor;
  readonly now: Date;
}

export interface PolicyInput<R, C> extends ActorInput {
  readonly resource: R;
  readonly context: C;
}

export type ActorRule = (input: ActorInput) => Decision;
export type ResourceRule<R, C> = (input: PolicyInput<R, C>) => Decision;

export interface Policy<R = void, C = void> {
  readonly action: string;
  readonly actorRules: readonly ActorRule[];
  readonly resourceRules: readonly ResourceRule<R, C>[];
}

const actionPattern = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

export function definePolicy<R = void, C = void>(definition: {
  action: string;
  actor?: readonly ActorRule[];
  resource?: readonly ResourceRule<R, C>[];
}): Policy<R, C> {
  const actorRules = definition.actor ?? [];
  const resourceRules = definition.resource ?? [];

  if (!actionPattern.test(definition.action)) {
    throw new Error(`Invalid policy action name: ${definition.action}`);
  }

  if (actorRules.length + resourceRules.length === 0) {
    throw new Error(
      `Policy ${definition.action} has no rules; a policy must allow explicitly.`,
    );
  }

  return Object.freeze({
    action: definition.action,
    actorRules: Object.freeze([...actorRules]),
    resourceRules: Object.freeze([...resourceRules]),
  });
}

function firstDenial<I>(
  rules: readonly ((input: I) => Decision)[],
  input: I,
): Decision {
  for (const rule of rules) {
    const decision = rule(input);

    if (!decision.allowed) {
      return decision;
    }
  }

  return allow;
}

export function evaluateActor(
  policy: Policy<never, never>,
  input: ActorInput,
): Decision {
  return firstDenial(policy.actorRules, input);
}

export function evaluate<R, C>(
  policy: Policy<R, C>,
  input: PolicyInput<R, C>,
): Decision {
  const actorDecision = firstDenial(policy.actorRules, input);

  return actorDecision.allowed
    ? firstDenial(policy.resourceRules, input)
    : actorDecision;
}

function enforce(action: string, decision: Decision): void {
  if (!decision.allowed) {
    throw new AuthorizationError(action, decision.reason);
  }
}

/** Throws {@link AuthorizationError} unless the actor rules allow. */
export function authorizeActor(
  policy: Policy<never, never>,
  input: ActorInput,
): void {
  enforce(policy.action, evaluateActor(policy, input));
}

/** Throws {@link AuthorizationError} unless every rule of the policy allows. */
export function authorize<R, C>(
  policy: Policy<R, C>,
  input: PolicyInput<R, C>,
): void {
  enforce(policy.action, evaluate(policy, input));
}
