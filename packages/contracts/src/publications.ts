import { z } from "zod";
import { environmentTypeSchema } from "./environment";
import {
  availabilityIntervalSchema,
  objectCategoryIdSchema,
  objectIdSchema,
  objectImageIdSchema,
  objectImageSchema,
} from "./objects";
import { personLinkShape } from "./social";

/**
 * A publication of an object in one environment (PS-OBJ-006, PS-ENV-011). The
 * object has no row at all in an environment it is not published in ("ikke
 * publisert").
 *
 * - `pending`: waits for an administrator's approval; hidden from discovery.
 * - `active`: visible to the environment's active members.
 * - `rejected`: an administrator rejected or removed it. It stands until an
 *   administrator changes the decision.
 * - `blocked`: a separate local safety or moderation measure.
 * - `unpublished`: ended; see `endReason`.
 */
export const publicationStatusSchema = z.enum([
  "pending",
  "active",
  "rejected",
  "blocked",
  "unpublished",
]);

/** Why a publication ended. */
export const publicationEndReasonSchema = z.enum([
  "withdrawn",
  "access_lost",
  "environment_wound_down",
]);

export const publicationIdSchema = z.uuid();

export const publishObjectSchema = z.strictObject({
  objectId: objectIdSchema,
  environmentId: z.uuid(),
});

export const withdrawPublicationSchema = z.strictObject({
  objectId: objectIdSchema,
  publicationId: publicationIdSchema,
});

/** An administrator's decision on a publication in their environment. */
export const publicationDecisionSchema = z.strictObject({
  environmentId: z.uuid(),
  publicationId: publicationIdSchema,
});

/** PS-ENV-011: whether new and existing publications need approval. */
export const setObjectApprovalSchema = z.strictObject({
  environmentId: z.uuid(),
  required: z.boolean(),
});

export const publicationResultSchema = z.strictObject({
  publicationId: publicationIdSchema,
  status: publicationStatusSchema,
});

export const objectApprovalResultSchema = z.strictObject({
  required: z.boolean(),
  /** Publications the change moved between pending and active. */
  changed: z.int().nonnegative(),
});

/**
 * One of the object's publications, as its owners see it. Co-owners see that
 * the object is published somewhere, but not which closed or hidden
 * environment, or who published it, unless they are members there themselves.
 */
export const objectPublicationSchema = z.strictObject({
  id: publicationIdSchema,
  status: publicationStatusSchema,
  endReason: publicationEndReasonSchema.nullable(),
  environment: z
    .strictObject({
      id: z.uuid(),
      type: environmentTypeSchema,
      name: z.string(),
    })
    .nullable(),
  publishedByUserId: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
  statusChangedAt: z.iso.datetime(),
});

/**
 * PS-OBJ-020: the object is visible to friends, a publishing choice of its
 * own next to the environments. Off unless an owner turns it on.
 */
export const objectFriendPublicationSchema = z.strictObject({
  publishedByUserId: z.uuid(),
  publishedAt: z.iso.datetime(),
});

export const objectPublicationListSchema = z.strictObject({
  /** The latest publication per environment, newest first. */
  publications: z.array(objectPublicationSchema),
  /** Null while the object is not visible to friends. */
  friends: objectFriendPublicationSchema.nullable(),
});

/** An owner turns the object's visibility to friends on or off. */
export const friendPublicationSchema = z.strictObject({
  objectId: objectIdSchema,
});

export const friendPublicationResultSchema = z.strictObject({
  objectId: objectIdSchema,
  visibleToFriends: z.boolean(),
});

/** The object's global content, as it is shown through a publication. */
export const publishedObjectContentSchema = z.strictObject({
  title: z.string(),
  categoryId: objectCategoryIdSchema,
  description: z.string(),
  loanTerms: z.string().nullable(),
  images: z.array(objectImageSchema),
});

/** A publication as the environment's administrators review it. */
export const reviewedPublicationSchema = z.strictObject({
  id: publicationIdSchema,
  objectId: objectIdSchema,
  status: publicationStatusSchema,
  publishedByUserId: z.uuid(),
  createdAt: z.iso.datetime(),
  statusChangedAt: z.iso.datetime(),
  object: publishedObjectContentSchema,
  /** The caller owns the object, so another administrator decides (PS-USR-009). */
  ownedByYou: z.boolean(),
});

/** Lists come newest first, a page at a time. */
export const publicationPageSize = 50;

/** The last item of the previous page, for the next one. */
const cursor = publicationIdSchema.optional();

export const environmentPublicationsQuerySchema = z.strictObject({
  environmentId: z.uuid(),
  status: z.enum(["pending", "active", "rejected", "blocked"]).optional(),
  cursor,
});

export const environmentPublicationListSchema = z.strictObject({
  publications: z.array(reviewedPublicationSchema),
  /** Pass as `cursor` for the next page; null on the last one. */
  nextCursor: publicationIdSchema.nullable(),
});

/**
 * An owner a member is shown of an object in an environment (PS-ENV-015),
 * linked to their page while the caller may open it.
 */
export const shownOwnerSchema = z.strictObject({
  realName: z.string(),
  ...personLinkShape,
});

/**
 * An object an active member finds in the environment. Its actual
 * availability is derived without saying what blocks it.
 */
export const environmentObjectSchema = z.strictObject({
  publicationId: publicationIdSchema,
  objectId: objectIdSchema,
  ...publishedObjectContentSchema.shape,
  effectiveAvailability: z.array(availabilityIntervalSchema),
  availableForNewLoans: z.boolean(),
  ownedByYou: z.boolean(),
  /**
   * The other owners who are active members of the environment, by name; a
   * co-owner outside it is not named (PS-ENV-015).
   */
  owners: z.array(shownOwnerSchema),
});

/**
 * One of the caller's own things they can add to the environment now
 * (PS-OBJ-006): active, not frozen (PS-OBJ-009), not stopped by another
 * owner (PS-OBJ-008), and not already there, waiting or stopped by the
 * administrators (PS-OBJ-017).
 */
export const addableObjectSchema = z.strictObject({
  objectId: objectIdSchema,
  title: z.string(),
  categoryId: objectCategoryIdSchema,
  images: z.array(objectImageSchema),
});

export const addableObjectListSchema = z.strictObject({
  objects: z.array(addableObjectSchema),
});

/**
 * A list of things to look through, such as an environment's or a friend's,
 * is shown whole, grouped by category and filtered where it is read, so it
 * is not paged (UX-IA-021). It holds at most this many, the newest first;
 * `more` says that there are others, which a search finds.
 */
export const thingListLimit = 200;

export const environmentObjectsQuerySchema = z.strictObject({
  environmentId: z.uuid(),
});

export const environmentObjectListSchema = z.strictObject({
  objects: z.array(environmentObjectSchema),
  /** There are more than {@link thingListLimit}. */
  more: z.boolean(),
});

/**
 * An object a friend has made visible to friends (PS-OBJ-020), as it is shown
 * on their profile: its availability does not say what blocks it, and
 * `owners` names the owners the caller is a friend of (PS-OBJ-022), as
 * everywhere a thing is found.
 */
export const friendObjectSchema = environmentObjectSchema.omit({
  publicationId: true,
});

/** The objects a friend has made visible to friends. */
export const friendObjectsQuerySchema = z.strictObject({
  userId: z.uuid(),
});

export const friendObjectListSchema = z.strictObject({
  objects: z.array(friendObjectSchema),
  /** There are more than {@link thingListLimit}. */
  more: z.boolean(),
});

/** An image of an object the caller finds through a friend. */
export const friendObjectImageSchema = z.strictObject({
  objectId: objectIdSchema,
  imageId: objectImageIdSchema,
});

export const publishedObjectImageSchema = z.strictObject({
  environmentId: z.uuid(),
  objectId: objectIdSchema,
  imageId: objectImageIdSchema,
});

export type PublicationStatus = z.infer<typeof publicationStatusSchema>;
export type PublicationEndReason = z.infer<typeof publicationEndReasonSchema>;
export type ObjectPublication = z.infer<typeof objectPublicationSchema>;
export type ObjectPublicationList = z.infer<typeof objectPublicationListSchema>;
export type ReviewedPublication = z.infer<typeof reviewedPublicationSchema>;
export type EnvironmentPublicationList = z.infer<
  typeof environmentPublicationListSchema
>;
export type ShownOwner = z.infer<typeof shownOwnerSchema>;
export type EnvironmentObject = z.infer<typeof environmentObjectSchema>;
export type EnvironmentObjectList = z.infer<typeof environmentObjectListSchema>;
export type AddableObject = z.infer<typeof addableObjectSchema>;
export type AddableObjectList = z.infer<typeof addableObjectListSchema>;
export type ObjectFriendPublication = z.infer<
  typeof objectFriendPublicationSchema
>;
export type FriendObject = z.infer<typeof friendObjectSchema>;
export type FriendObjectList = z.infer<typeof friendObjectListSchema>;
