import {
  type AuthGateway,
  type CookieStore,
  createAuthGateway,
} from "@lanbort/auth";
import { createDatabase } from "@lanbort/database";
import { ConsumerRegistry, type DomainContext } from "@lanbort/domain";
import { serverEnv } from "./env";

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

/**
 * Side effects run from the outbox. Empty until Phase 4 adds notifications
 * and e-mail delivery (ADR-0004, ADR-0008).
 */
export const outboxConsumers = new ConsumerRegistry([]);

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
