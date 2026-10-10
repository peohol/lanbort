import {
  type AuthAdmin,
  type AuthGateway,
  AuthProviderError,
  type CookieStore,
  createAuthAdmin,
  createAuthGateway,
  createPasskeyCeremonies,
  passkeyConfigFor,
} from "@lanbort/auth";
import { createDatabase } from "@lanbort/database";
import {
  type DomainContext,
  type IdentityProviderAdmin,
  outboxConsumers,
  type StewardPasskeyCommands,
  stewardPasskeyCommands,
} from "@lanbort/domain";
import { platformStewardsEnabled, serverEnv } from "./env";
import { objectImageServices, profilePictureServices } from "./images";

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

/** The outbox consumers, wired to this runtime (`outboxConsumers`). */
const consumers = outboxConsumers({
  domain: () => runtime.domain(),
  imageStore: () => objectImageServices()?.store,
  pictureStore: () => profilePictureServices()?.store,
  identities: identityAdmin,
});

let domain: DomainContext | undefined;
let passkeys: StewardPasskeyCommands | undefined;

export const runtime: Runtime = {
  domain() {
    domain ??= {
      // Serverless functions keep the pool deliberately small (ADR-0007).
      db: createDatabase({
        connectionString: serverEnv().DATABASE_URL,
        maxConnections: 5,
      }),
      consumers,
      platformStewards: platformStewardsEnabled(),
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

/**
 * Stewards' passkey ceremonies for this deployment's relying party
 * (APP_URL, WEBAUTHN_RP_ID); `unavailable` without APP_URL.
 */
export function passkeyCommands(): StewardPasskeyCommands {
  if (!passkeys) {
    const env = serverEnv();

    if (!env.APP_URL) {
      throw new AuthProviderError("unavailable");
    }

    passkeys = stewardPasskeyCommands(
      createPasskeyCeremonies(
        passkeyConfigFor(env.APP_URL, env.WEBAUTHN_RP_ID),
      ),
    );
  }

  return passkeys;
}
