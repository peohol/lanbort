import {
  type AuthGateway,
  type CookieStore,
  createAuthGateway,
} from "@lanbort/auth";
import { createDatabase } from "@lanbort/database";
import {
  ConsumerRegistry,
  type DomainContext,
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

/**
 * Side effects run from the outbox (ADR-0004, ADR-0008): image file cleanup
 * and the in-app notifications (WP-40). Notification e-mails have their own
 * queue and job (`notification-emails.ts`).
 */
export const outboxConsumers = new ConsumerRegistry([
  objectImageFileCleanup({
    store: () => objectImageServices()?.store,
    db: () => runtime.domain().db,
  }),
  notificationGenerator({ db: () => runtime.domain().db }),
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
