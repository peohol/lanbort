import { z } from "zod";
import { availabilityIntervalSchema, objectIdSchema } from "./objects";
import {
  publicationIdSchema,
  publishedObjectContentSchema,
} from "./publications";

/**
 * Subscriptions to objects (PS-OBJ-014). A user can subscribe to an object
 * they find in one of their environments, and is then told when it becomes
 * available again and when its content changes. The subscription follows
 * the user's access: while they no longer find the object anywhere it is
 * inactive, shows nothing about the object and tells them nothing.
 */
export const objectSubscriptionIdSchema = z.uuid();

export const subscribeToObjectSchema = z.strictObject({
  objectId: objectIdSchema,
});

export const unsubscribeFromObjectSchema = z.strictObject({
  objectId: objectIdSchema,
});

export const objectSubscriptionResultSchema = z.strictObject({
  objectId: objectIdSchema,
  subscribed: z.boolean(),
});

/** Where the subscriber finds the object now. */
export const objectSubscriptionPlaceSchema = z.strictObject({
  environmentId: z.uuid(),
  publicationId: publicationIdSchema,
});

export const objectSubscriptionSchema = z.strictObject({
  id: objectSubscriptionIdSchema,
  objectId: objectIdSchema,
  createdAt: z.iso.datetime(),
  /** False while the caller does not find the object in any environment. */
  active: z.boolean(),
  /** The object as the caller finds it now; null while inactive. */
  object: z
    .strictObject({
      ...publishedObjectContentSchema.shape,
      effectiveAvailability: z.array(availabilityIntervalSchema),
      availableForNewLoans: z.boolean(),
      foundIn: z.array(objectSubscriptionPlaceSchema).min(1),
    })
    .nullable(),
});

/** Lists come newest first, a page at a time. */
export const objectSubscriptionPageSize = 50;

export const objectSubscriptionsQuerySchema = z.strictObject({
  cursor: objectSubscriptionIdSchema.optional(),
});

export const objectSubscriptionListSchema = z.strictObject({
  subscriptions: z.array(objectSubscriptionSchema),
  /** Pass as `cursor` for the next page; null on the last one. */
  nextCursor: objectSubscriptionIdSchema.nullable(),
});

export type ObjectSubscription = z.infer<typeof objectSubscriptionSchema>;
export type ObjectSubscriptionList = z.infer<
  typeof objectSubscriptionListSchema
>;
