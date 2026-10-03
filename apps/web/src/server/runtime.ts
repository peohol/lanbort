import {
  type AuthAdmin,
  type AuthGateway,
  type CookieStore,
  createAuthAdmin,
  createAuthGateway,
} from "@lanbort/auth";
import { createDatabase } from "@lanbort/database";
import {
  accountIdentityRemoval,
  ConsumerRegistry,
  type DomainContext,
  type IdentityProviderAdmin,
  notificationGenerator,
  objectImageFileCleanup,
} from "@lanbort/domain";
import { serverEnv } from "./env";
import { objectImageServices } from "./object-images";

/**
 * The composition root: the only place that wires the database, the auth
 * provider and the outbox consumers together. Everything else receives them
 * through a {@link Runtime}, which keeps route code testable with fakes.
 */
export interface Runtime {
  domain(): DomainContext;
  auth(cookies: CookieStore, options: { secureCookies: boolean }): AuthGateway;
  cronSecret(): string | undefined;
}

let authAdmin: AuthAdmin | undefined;

/**
 * The provider's identity administration, or undefined when this environment
 * has no secret key configured; removing deleted accounts' identities then
 * waits in the outbox and is retried.
 */
function identityAdmin(): IdentityProviderAdmin | undefined {
  const env = serverEnv();

  if (!env.SUPABASE_SECRET_KEY) {
    return undefined;
  }

  const admin = (authAdmin ??= createAuthAdmin({
    url: env.SUPABASE_URL,
    secretKey: env.SUPABASE_SECRET_KEY,
  }));

  return { deleteIdentity: (subject) => admin.deleteUser(subject) };
}

/**
 * Side effects run from the outbox (ADR-0004, ADR-0008): image file cleanup,
 * the in-app notifications (WP-40) and removing a deleted account's sign-in
 * identity (WP-53). E-mail delivery arrives with WP-41.
 */
export const outboxConsumers = new ConsumerRegistry([
  objectImageFileCleanup({
    store: () => objectImageServices()?.store,
    db: () => runtime.domain().db,
  }),
  notificationGenerator({ db: () => runtime.domain().db }),
  accountIdentityRemoval({
    identities: identityAdmin,
    domain: () => runtime.domain(),
  }),
]);

let domain: DomainContext | undefined;

export const runtime: Runtime = {
  domain() {
    domain ??= {
      // Serverless functions keep the pool deliberately small (ADR-0007).
      db: createDatabase({
        connectionString: serverEnv().DATABASE_URL,
        maxConnections: 5,
      }),
      consumers: outboxConsumers,
    };

    return domain;
  },
  auth(cookies, options) {
    const env = serverEnv();

    return createAuthGateway(
      {
        url: env.SUPABASE_URL,
        publishableKey: env.SUPABASE_PUBLISHABLE_KEY,
        secureCookies: options.secureCookies,
      },
      cookies,
    );
  },
  cronSecret() {
    return serverEnv().CRON_SECRET;
  },
};
