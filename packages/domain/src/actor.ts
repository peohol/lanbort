import {
  type AccountStatus as ContractAccountStatus,
  platformRoleSchema,
} from "@lanbort/contracts";

/**
 * The internal actor model. Every authorization decision, event and
 * idempotency record is attributed to one of these, never to an auth
 * provider's identity directly (ADR-0007: identity is normalized first).
 */
/** PS-ADM-001: the lifecycle states, see `account/model.ts`. */
export type AccountStatus = ContractAccountStatus;

/**
 * Authentication assurance level. `aal2` is the stronger authentication that
 * privileged roles need; its mechanism is not decided (OD-0010).
 */
export type AssuranceLevel = "aal1" | "aal2";

export interface AuthenticationMethod {
  /** The provider's name for the method, for example `otp` (e-mail code). */
  readonly method: string;
  readonly at: Date;
}

/** How the current session was authenticated, as verified by the server. */
export interface AuthenticationContext {
  readonly sessionId: string;
  readonly assurance: AssuranceLevel;
  readonly methods: readonly AuthenticationMethod[];
}

/**
 * Global product roles (PS-USR-008). Granted explicitly in the database,
 * never derived from auth metadata or technical access. Contextual roles such
 * as environment administrator are not global and do not belong here.
 */
export const platformRoles = platformRoleSchema.options;

export type PlatformRole = (typeof platformRoles)[number];

export interface UserActor {
  readonly kind: "user";
  /** Internal user id (`app.users.id`), not the auth provider's subject. */
  readonly userId: string;
  readonly accountStatus: AccountStatus;
  readonly authentication: AuthenticationContext;
  /** Active platform role grants, read from the database on every request. */
  readonly platformRoles: readonly PlatformRole[];
}

/** Scheduled jobs, workers and operational scripts. */
export interface SystemActor {
  readonly kind: "system";
  readonly process: string;
}

export interface AnonymousActor {
  readonly kind: "anonymous";
}

export type Actor = UserActor | SystemActor | AnonymousActor;

export const anonymousActor: AnonymousActor = Object.freeze({
  kind: "anonymous",
});

const processPattern = /^[a-z][a-z0-9_.-]{0,63}$/;

export function systemActor(process: string): SystemActor {
  if (!processPattern.test(process)) {
    throw new Error(`Invalid system process name: ${process}`);
  }

  return Object.freeze({ kind: "system", process });
}

/**
 * Stable namespace for data that must never cross actors, such as stored
 * idempotent results. Anonymous callers have no scope.
 */
export function actorScope(actor: Actor): string | null {
  switch (actor.kind) {
    case "user":
      return userScope(actor.userId);
    case "system":
      return `system:${actor.process}`;
    case "anonymous":
      return null;
  }
}

/** A user's scope (see {@link actorScope}), also once they cannot act. */
export function userScope(userId: string): string {
  return `user:${userId}`;
}
