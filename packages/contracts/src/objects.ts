import { z } from "zod";

/** Max images per object (PS-OBJ-002). */
export const objectImageMaxCount = 5;

/**
 * Largest image upload the API accepts. Below the hosting platform's request
 * body limit; the client scales larger photos down before uploading.
 */
export const objectImageMaxUploadBytes = 4 * 1024 * 1024;

/**
 * The longest side, in pixels, the client scales a photo down to when it is
 * too large to upload. The server keeps nothing larger anyway.
 */
export const objectImageUploadMaxSide = 2048;

/** Max separate availability intervals per object. */
export const availabilityMaxIntervals = 50;

const noControlCharacters = /^[^\p{Cc}]*$/u;
/** Free text may contain line breaks and tabs, but no other control characters. */
export const multilineText = /^(?:[^\p{Cc}]|[\t\n\r])*$/u;

export const objectIdSchema = z.uuid();
export const objectImageIdSchema = z.uuid();
export const objectCategoryIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]{0,62}$/);

export const objectTitleSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(noControlCharacters);

export const objectDescriptionSchema = z
  .string()
  .trim()
  .min(1)
  .max(5000)
  .regex(multilineText);

/** Optional loan terms as free text; `null` means none. */
export const loanTermsSchema = z
  .string()
  .trim()
  .min(1)
  .max(2000)
  .regex(multilineText)
  .nullable();

/**
 * Calendar days follow the product's time zone, so "today" is the same date
 * for every user and server, and times are shown in it.
 */
export const productTimeZone = "Europe/Oslo";

/** A calendar date, `YYYY-MM-DD`, in {@link productTimeZone}. */
export const calendarDateSchema = z.iso
  .date()
  .refine((date) => date >= "2000-01-01" && date <= "2199-12-31");

/**
 * General availability (PS-OBJ-003): from `start` through `end`, both
 * inclusive calendar dates. `end: null` means no end date.
 */
export const availabilityIntervalSchema = z
  .strictObject({
    start: calendarDateSchema,
    end: calendarDateSchema.nullable(),
  })
  .refine(({ start, end }) => end === null || end >= start, {
    path: ["end"],
  });

/**
 * A set of intervals. They may not overlap; intervals that touch are one
 * logical space and are merged (PS-OBJ-003).
 */
export const availabilitySchema = z
  .array(availabilityIntervalSchema)
  .max(availabilityMaxIntervals);

export const createObjectSchema = z.strictObject({
  title: objectTitleSchema,
  categoryId: objectCategoryIdSchema,
  description: objectDescriptionSchema,
  loanTerms: loanTermsSchema.default(null),
  // Optional at creation; at least one interval is required before the
  // object can be offered for new loans (PS-OBJ-002).
  availability: availabilitySchema.default([]),
});

/** The fields an edit can change, also used in change events. */
export const objectChangeFields = [
  "title",
  "categoryId",
  "description",
  "loanTerms",
  "availability",
] as const;

/**
 * Edits the given fields. `expectedVersion` is the version the edit was based
 * on; if the object changed since, the edit is refused with `conflict` so it
 * never silently overwrites newer data.
 */
export const objectEditSchema = z.strictObject({
  expectedVersion: z.int().min(1),
  title: objectTitleSchema.optional(),
  categoryId: objectCategoryIdSchema.optional(),
  description: objectDescriptionSchema.optional(),
  loanTerms: loanTermsSchema.optional(),
  availability: availabilitySchema.optional(),
});

/** An edit must change at least one field. */
export const changesSomething = (
  edit: Partial<Record<(typeof objectChangeFields)[number], unknown>>,
) => objectChangeFields.some((field) => edit[field] !== undefined);

export const updateObjectSchema = objectEditSchema.refine(changesSomething, {
  path: ["$"],
});

export const objectStatusSchema = z.enum(["active", "archived"]);

export const objectImageSchema = z.strictObject({
  id: objectImageIdSchema,
  width: z.int(),
  height: z.int(),
});

/** A registered owner, as every owner of the object sees it. */
export const objectOwnerSchema = z.strictObject({
  userId: z.uuid(),
  since: z.iso.datetime(),
});

/**
 * A co-owner's explicit restriction on new commitments (PS-OBJ-008): no new
 * loan in `period`, or on any date when it is null.
 */
export const objectRestrictionSchema = z.strictObject({
  id: z.uuid(),
  setByUserId: z.uuid(),
  period: availabilityIntervalSchema.nullable(),
  createdAt: z.iso.datetime(),
});

/** A pending co-ownership invitation, as the object's owners see it. */
export const pendingCoOwnerInvitationSchema = z.strictObject({
  id: z.uuid(),
  userId: z.uuid(),
  invitedByUserId: z.uuid(),
  createdAt: z.iso.datetime(),
});

/** An object as its owners see it. */
export const ownObjectSchema = z.strictObject({
  id: objectIdSchema,
  title: z.string(),
  categoryId: objectCategoryIdSchema,
  description: z.string(),
  loanTerms: z.string().nullable(),
  status: objectStatusSchema,
  version: z.int(),
  /** General availability as the owners set it. */
  availability: z.array(availabilityIntervalSchema),
  /**
   * Derived actual availability from today: general availability minus
   * everything that blocks the object. Never stored.
   */
  effectiveAvailability: z.array(availabilityIntervalSchema),
  /** Derived: whether the object can be offered for new loans now. */
  availableForNewLoans: z.boolean(),
  images: z.array(objectImageSchema),
  /** Every registered owner has the same rights (PS-OBJ-007). */
  owners: z.array(objectOwnerSchema),
  restrictions: z.array(objectRestrictionSchema),
  /**
   * A conflict between co-owners stops new loans until the ownership is
   * clarified to one owner (PS-OBJ-009). Says nothing about who or why.
   */
  frozenForNewLoans: z.boolean(),
  /**
   * Handed over in a loan that has not ended, so it is out of the owners'
   * hands. Every owner sees this; it says nothing about the loan.
   */
  lentOut: z.boolean(),
  /** Owners who consented to permanent deletion (PS-OBJ-011). */
  deletionConsents: z.array(z.uuid()),
  pendingInvitations: z.array(pendingCoOwnerInvitationSchema),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const ownObjectListSchema = z.strictObject({
  objects: z.array(ownObjectSchema),
});

export const objectVersionSchema = z.strictObject({
  objectId: objectIdSchema,
  version: z.int(),
});

export const objectImageAddedSchema = z.strictObject({
  objectId: objectIdSchema,
  imageId: objectImageIdSchema,
  version: z.int(),
});

export const objectCategorySchema = z.strictObject({
  id: objectCategoryIdSchema,
  parentId: objectCategoryIdSchema.nullable(),
  label: z.string(),
});

export const objectCategoryListSchema = z.strictObject({
  categories: z.array(objectCategorySchema),
});

/** Invites `userId` to become a co-owner (PS-OBJ-007). */
export const coOwnerInvitationInputSchema = z.strictObject({
  objectId: objectIdSchema,
  userId: z.uuid(),
});

export const coOwnerInvitationIdSchema = z.uuid();

export const coOwnerInvitationStatusSchema = z.enum([
  "pending",
  "accepted",
  "declined",
  "withdrawn",
  "closed",
]);

export const coOwnerInvitationResultSchema = z.strictObject({
  invitationId: coOwnerInvitationIdSchema,
  status: coOwnerInvitationStatusSchema,
});

/** An invitation as the invited user sees it, with what they would co-own. */
export const receivedCoOwnerInvitationSchema = z.strictObject({
  id: coOwnerInvitationIdSchema,
  objectId: objectIdSchema,
  invitedByUserId: z.uuid(),
  createdAt: z.iso.datetime(),
  object: z.strictObject({
    title: z.string(),
    categoryId: objectCategoryIdSchema,
    description: z.string(),
  }),
});

export const receivedCoOwnerInvitationListSchema = z.strictObject({
  invitations: z.array(receivedCoOwnerInvitationSchema),
});

/** No new loans in `period`; `null` restricts every date (PS-OBJ-008). */
export const setObjectRestrictionSchema = z.strictObject({
  objectId: objectIdSchema,
  period: availabilityIntervalSchema.nullable(),
});

export const objectRestrictionResultSchema = z.strictObject({
  objectId: objectIdSchema,
  restrictionId: z.uuid(),
});

export const objectDeletionResultSchema = z.strictObject({
  objectId: objectIdSchema,
  /** True once every owner has consented and the object is gone. */
  deleted: z.boolean(),
});

/** What caused a version of the object (PS-OBJ-013). */
export const objectRevisionChangeSchema = z.enum([
  "baseline",
  "created",
  "updated",
  "archived",
  "restored",
  "image_added",
  "image_removed",
  "reverted",
]);

export const objectRevisionContentSchema = z.strictObject({
  title: z.string(),
  categoryId: objectCategoryIdSchema,
  description: z.string(),
  loanTerms: z.string().nullable(),
  status: objectStatusSchema,
  availability: z.array(availabilityIntervalSchema),
  imageIds: z.array(objectImageIdSchema),
});

/** Content parts that can differ between two versions. */
export const objectRevisionFields = [
  "title",
  "categoryId",
  "description",
  "loanTerms",
  "status",
  "availability",
  "images",
] as const;

export const objectRevisionSchema = z.strictObject({
  version: z.int(),
  change: objectRevisionChangeSchema,
  /** For a revert: the version whose content it brought back. */
  revertedToVersion: z.int().nullable(),
  /** Null only for history from before co-ownership tracking began. */
  actorUserId: z.uuid().nullable(),
  recordedAt: z.iso.datetime(),
  /** What differs from the previous version; everything for the first. */
  changedFields: z.array(z.enum(objectRevisionFields)),
  content: objectRevisionContentSchema,
});

export const objectHistoryQuerySchema = z.strictObject({
  objectId: objectIdSchema,
  /** Only versions before this one, for the next page. */
  beforeVersion: z.coerce.number().int().min(2).optional(),
});

export const objectHistorySchema = z.strictObject({
  /** Newest first. */
  revisions: z.array(objectRevisionSchema),
  /** Pass as `beforeVersion` for older revisions; null when there are none. */
  nextBeforeVersion: z.int().nullable(),
});

/**
 * Brings back the content of `version` as a new version (PS-OBJ-013). Like
 * any edit it must be based on the current version.
 */
export const revertObjectSchema = z.strictObject({
  objectId: objectIdSchema,
  version: z.int().min(1),
  expectedVersion: z.int().min(1),
});

export type AvailabilityInterval = z.infer<typeof availabilityIntervalSchema>;
export type CreateObject = z.infer<typeof createObjectSchema>;
export type UpdateObject = z.infer<typeof updateObjectSchema>;
export type ObjectChangeField = (typeof objectChangeFields)[number];
export type ObjectStatus = z.infer<typeof objectStatusSchema>;
export type OwnObject = z.infer<typeof ownObjectSchema>;
export type OwnObjectList = z.infer<typeof ownObjectListSchema>;
export type ObjectVersion = z.infer<typeof objectVersionSchema>;
export type ObjectImageAdded = z.infer<typeof objectImageAddedSchema>;
export type ObjectCategory = z.infer<typeof objectCategorySchema>;
export type ObjectCategoryList = z.infer<typeof objectCategoryListSchema>;
export type ObjectOwner = z.infer<typeof objectOwnerSchema>;
export type ObjectRestriction = z.infer<typeof objectRestrictionSchema>;
export type CoOwnerInvitationStatus = z.infer<
  typeof coOwnerInvitationStatusSchema
>;
export type CoOwnerInvitationResult = z.infer<
  typeof coOwnerInvitationResultSchema
>;
export type ReceivedCoOwnerInvitationList = z.infer<
  typeof receivedCoOwnerInvitationListSchema
>;
export type ObjectRevisionChange = z.infer<typeof objectRevisionChangeSchema>;
export type ObjectRevisionField = (typeof objectRevisionFields)[number];
export type ObjectRevision = z.infer<typeof objectRevisionSchema>;
export type ObjectHistory = z.infer<typeof objectHistorySchema>;
