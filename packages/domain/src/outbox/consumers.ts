import type { Database } from "@lanbort/database";
import type { Kysely } from "kysely";
import {
  accountIdentityRemoval,
  type IdentityProviderAdmin,
} from "../account/deletion";
import { chatSessionEnding } from "../chat/maintenance";
import type { DomainContext } from "../commands/command";
import type { NotificationEmailServices } from "../notifications/delivery";
import { notificationGenerator } from "../notifications/generator";
import { type ImageStore, objectImageFileCleanup } from "../objects/images";
import { type ThumbnailMaker, thingThumbnails } from "../objects/thumbnails";
import { profilePictureFileCleanup } from "../people/pictures";
import { searchIndexer } from "../search/indexer";
import {
  friendInvitationDelivery,
  friendInvitationIdentityRemoval,
} from "../social/invitation-delivery";
import { objectAvailabilityWatcher } from "../subscriptions/availability";
import { ConsumerRegistry } from "./consumer";

/** What the outbox consumers reach when they run. */
export interface OutboxConsumerDependencies {
  readonly domain: () => DomainContext;
  /** Undefined where no file store is configured; deliveries are retried. */
  readonly imageStore: () => ImageStore | undefined;
  /** The same for profile pictures, which have their own private bucket. */
  readonly pictureStore: () => ImageStore | undefined;
  /** Makes things' thumbnails; undefined the same way as the image store. */
  readonly thumbnails: () => ThumbnailMaker | undefined;
  /** Undefined where no provider key is configured; deliveries are retried. */
  readonly identities: () => IdentityProviderAdmin | undefined;
  /**
   * The e-mail adapter for invitations to new participants; undefined where
   * e-mail is not configured, and deliveries are retried.
   */
  readonly emails: () => NotificationEmailServices | undefined;
}

/**
 * Every side effect that runs from the outbox (ADR-0004, ADR-0008): image
 * and profile picture file cleanup, things' thumbnails (PS-OBJ-021), the in-app notifications (WP-40), telling object subscribers
 * when an object has become available (WP-63), the derived search index
 * (WP-61), removing a deleted account's sign-in identity (WP-53),
 * ending the sign-in sessions of revoked chat devices (WP-43), and inviting
 * new participants by e-mail and removing their unused sign-in identities
 * (PS-USR-015).
 * Notification e-mails have their own queue and job.
 *
 * Messages are written for these consumers when an event is recorded, so
 * anything that records events against the product's database (the app, and
 * operational commands such as a restore, WP-72) registers this same set.
 */
export function outboxConsumers({
  domain,
  imageStore,
  pictureStore,
  thumbnails,
  identities,
  emails,
}: OutboxConsumerDependencies): ConsumerRegistry {
  const db = (): Kysely<Database> => domain().db;

  return new ConsumerRegistry([
    objectImageFileCleanup({ store: imageStore, db }),
    thingThumbnails({ store: imageStore, thumbnails, db }),
    profilePictureFileCleanup({ store: pictureStore, db }),
    notificationGenerator({ db }),
    objectAvailabilityWatcher({ db }),
    searchIndexer({ db }),
    accountIdentityRemoval({ identities, domain }),
    chatSessionEnding({ db }),
    friendInvitationDelivery({ domain, identities, emails }),
    friendInvitationIdentityRemoval({ domain, identities }),
  ]);
}
