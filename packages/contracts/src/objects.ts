import { z } from "zod";

/** Max images per object (PS-OBJ-002). */
export const objectImageMaxCount = 5;

/**
 * Largest image upload the API accepts. Below the hosting platform's request
 * body limit; the client scales larger photos down before uploading.
 */
export const objectImageMaxUploadBytes = 4 * 1024 * 1024;

/** Max separate availability intervals per object. */
export const availabilityMaxIntervals = 50;

const noControlCharacters = /^[^\p{Cc}]*$/u;
// Free text may contain line breaks and tabs, but no other control characters.
const multilineText = /^(?:[^\p{Cc}]|[\t\n\r])*$/u;

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

/** A calendar date, `YYYY-MM-DD`. */
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
