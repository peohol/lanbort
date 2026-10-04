import type { Database } from "@lanbort/database";
import type { Kysely } from "kysely";
import {
  accountIdentityRemoval,
  type IdentityProviderAdmin,
} from "../account/deletion";
import { chatSessionEnding } from "../chat/maintenance";
import type { DomainContext } from "../commands/command";
import { notificationGenerator } from "../notifications/generator";
import {
  type ObjectImageStore,
  objectImageFileCleanup,
} from "../objects/images";
import { searchIndexer } from "../search/indexer";
import { objectAvailabilityWatcher } from "../subscriptions/availability";
import { ConsumerRegistry } from "./consumer";

/** What the outbox consumers reach when they run. */
export interface OutboxConsumerDependencies {
  readonly domain: () => DomainContext;
  /** Undefined where no file store is configured; deliveries are retried. */
  readonly imageStore: () => ObjectImageStore | undefined;
  /** Undefined where no provider key is configured; deliveries are retried. */
  readonly identities: () => IdentityProviderAdmin | undefined;
}

/**
 * Every side effect that runs from the outbox (ADR-0004, ADR-0008): image
 * file cleanup, the in-app notifications (WP-40), telling object subscribers
 * when an object has become available (WP-63), the derived search index
 * (WP-61), removing a deleted account's sign-in identity (WP-53) and
 * ending the sign-in sessions of revoked chat devices (WP-43).
 * Notification e-mails have their own queue and job.
 *
 * Messages are written for these consumers when an event is recorded, so
 * anything that records events against the product's database (the app, and
 * operational commands such as a restore, WP-72) registers this same set.
 */
export function outboxConsumers({
  domain,
  imageStore,
  identities,
}: OutboxConsumerDependencies): ConsumerRegistry {
  const db = (): Kysely<Database> => domain().db;

  return new ConsumerRegistry([
    objectImageFileCleanup({ store: imageStore, db }),
    notificationGenerator({ db }),
    objectAvailabilityWatcher({ db }),
    searchIndexer({ db }),
    accountIdentityRemoval({ identities, domain }),
    chatSessionEnding({ db }),
  ]);
}
