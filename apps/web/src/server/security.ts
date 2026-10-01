import type { AuthGateway, VerifiedIdentity } from "@lanbort/auth";
import type { SecurityStatus, TotpEnrollment } from "@lanbort/contracts";
import {
  AuthorizationError,
  authorize,
  authorizeActor,
  type DomainContext,
  enrollMfaPolicy,
  executeCommand,
  type Policy,
  readSecurityPolicy,
  reauthenticatePolicy,
  recordMfaEnabled,
  resolveUserActor,
  stepUpMfaPolicy,
  type UserActor,
} from "@lanbort/domain";

/**
 * Sign-in security for the signed-in user (WP-12): authenticator app (TOTP)
 * and re-authentication. The auth provider holds the factors and sessions;
 * every step is authorized by a domain policy before the provider is asked.
 */
export interface SecurityContext {
  readonly actor: UserActor;
  readonly identity: VerifiedIdentity;
  readonly auth: AuthGateway;
  readonly domain: DomainContext;
  readonly requestId: string;
}

function now(context: SecurityContext): Date {
  return context.domain.clock?.() ?? new Date();
}

function allowActor(context: SecurityContext, policy: Policy<never, never>) {
  authorizeActor(policy, { actor: context.actor, now: now(context) });
}

/**
 * Normalizes the identity of a session the provider just issued, and makes
 * sure it still belongs to the same user. Anything else ends the session.
 */
async function sameUserAfter(
  context: SecurityContext,
  identity: VerifiedIdentity,
): Promise<UserActor> {
  const actor = await resolveUserActor(
    context.domain,
    identity,
    context.requestId,
  );

  if (actor?.userId !== context.actor.userId) {
    await context.auth.signOut();
    throw new AuthorizationError("account.session", "unauthenticated");
  }

  return actor;
}

export async function securityStatus(
  context: SecurityContext,
): Promise<SecurityStatus> {
  allowActor(context, readSecurityPolicy);

  return {
    totp: await context.auth.totpStatus(),
    sessionAssurance: context.actor.authentication.assurance,
    platformRoles: [...context.actor.platformRoles],
  };
}

export async function startTotpEnrollment(
  context: SecurityContext,
): Promise<TotpEnrollment> {
  // Actor rules first, so a stale session never reaches the provider.
  allowActor(context, enrollMfaPolicy as Policy<never, never>);
  authorize(enrollMfaPolicy, {
    actor: context.actor,
    now: now(context),
    resource: { totp: await context.auth.totpStatus() },
    context: undefined,
  });

  return context.auth.enrollTotp();
}

/**
 * A code from the authenticator app. With a pending app it completes the
 * enrollment (which needs a recent sign-in); with a confirmed app it raises
 * the session to `aal2`.
 */
export async function verifyTotp(
  context: SecurityContext,
  code: string,
): Promise<SecurityStatus> {
  const totp = await context.auth.totpStatus();
  const enrolling = totp === "pending";

  authorize(enrolling ? enrollMfaPolicy : stepUpMfaPolicy, {
    actor: context.actor,
    now: now(context),
    resource: { totp },
    context: undefined,
  });

  const actor = await sameUserAfter(
    context,
    await context.auth.verifyTotp(code),
  );

  // Also after a step-up: repairs the audit record if writing it failed
  // right after the provider confirmed the app.
  await executeCommand(context.domain, recordMfaEnabled, {
    actor,
    input: {},
    correlationId: context.requestId,
  });

  return {
    totp: "verified",
    sessionAssurance: actor.authentication.assurance,
    platformRoles: [...actor.platformRoles],
  };
}

/** Sends a new code to the account's own verified address. */
export async function requestReauthentication(
  context: SecurityContext,
): Promise<void> {
  allowActor(context, reauthenticatePolicy);

  if (!context.identity.email) {
    throw new AuthorizationError(reauthenticatePolicy.action, "forbidden");
  }

  await context.auth.requestEmailCode(context.identity.email);
}

export async function confirmReauthentication(
  context: SecurityContext,
  code: string,
): Promise<void> {
  allowActor(context, reauthenticatePolicy);

  if (!context.identity.email) {
    throw new AuthorizationError(reauthenticatePolicy.action, "forbidden");
  }

  await sameUserAfter(
    context,
    await context.auth.verifyEmailCode(context.identity.email, code),
  );
}
