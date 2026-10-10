import type { AuthGateway, VerifiedIdentity } from "@lanbort/auth";
import {
  AuthorizationError,
  authorizeActor,
  type DomainContext,
  reauthenticatePolicy,
  renewChatSession,
  resolveUserActor,
  type UserActor,
} from "@lanbort/domain";

/**
 * Re-authentication before sensitive actions (WP-12): the signed-in user
 * proves their identity again with a new e-mail code. Policies that need it
 * deny with `reauthentication_required`.
 */
export interface ReauthenticationContext {
  readonly actor: UserActor;
  readonly identity: VerifiedIdentity;
  readonly auth: AuthGateway;
  readonly domain: DomainContext;
  readonly requestId: string;
}

function allow(context: ReauthenticationContext): string {
  authorizeActor(reauthenticatePolicy, {
    actor: context.actor,
    now: context.domain.clock?.() ?? new Date(),
  });

  // The code only ever goes to the account's own verified address.
  if (!context.identity.email) {
    throw new AuthorizationError(reauthenticatePolicy.action, "forbidden");
  }

  return context.identity.email;
}

/** Sends a new code to the account's own verified address. */
export async function requestReauthentication(
  context: ReauthenticationContext,
): Promise<void> {
  await context.auth.requestEmailCode(allow(context));
}

/**
 * The new code renews the session. It must still belong to the same user;
 * anything else ends the session. The old session ends, and its chat
 * device carries on in the new one.
 */
export async function confirmReauthentication(
  context: ReauthenticationContext,
  code: string,
): Promise<void> {
  const identity = await context.auth.verifyEmailCode(allow(context), code);
  const actor = await resolveUserActor(
    context.domain,
    identity,
    context.requestId,
  );

  if (actor?.userId !== context.actor.userId) {
    await context.auth.signOut();
    throw new AuthorizationError("account.session", "unauthenticated");
  }

  // The browser now has a new session; its chat device moves to it.
  await renewChatSession(
    context.domain.db,
    actor.userId,
    context.actor.authentication.sessionId,
    actor.authentication.sessionId,
  );
}
