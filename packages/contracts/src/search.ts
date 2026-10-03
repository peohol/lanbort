import { z } from "zod";
import { membershipStateSchema } from "./environment";
import {
  calendarDateSchema,
  objectCategoryIdSchema,
  objectIdSchema,
} from "./objects";
import { environmentObjectSchema, publicationIdSchema } from "./publications";

const noControlCharacters = /^[^\p{Cc}]*$/u;

/** What the user typed in Finn. */
export const searchTextSchema = z
  .string()
  .trim()
  .min(2)
  .max(100)
  .regex(noControlCharacters);

/**
 * Finn shows the best matches, not a feed to scroll (UX-P20): at most this
 * many, and `more` says that a narrower search would find others.
 */
export const searchResultLimit = 30;

/**
 * Objects the caller finds in their environments (PS-OBJ-006): by text, by
 * category (with the categories below it), within one of their environments,
 * and only those actually available the whole period from `availableFrom`
 * through `availableTo` (both inclusive). Text or category is required.
 */
export const objectSearchQuerySchema = z
  .strictObject({
    q: searchTextSchema.optional(),
    categoryId: objectCategoryIdSchema.optional(),
    environmentId: z.uuid().optional(),
    availableFrom: calendarDateSchema.optional(),
    availableTo: calendarDateSchema.optional(),
  })
  .refine(({ q, categoryId }) => q !== undefined || categoryId !== undefined, {
    message: "Search by text or category",
  })
  .refine(
    ({ availableFrom, availableTo }) =>
      (availableFrom === undefined) === (availableTo === undefined) &&
      (availableFrom === undefined ||
        availableTo === undefined ||
        availableFrom <= availableTo),
    { message: "A period needs a start and an end, in order" },
  );

/** One of the caller's environments where they find the object. */
export const objectFoundInSchema = z.strictObject({
  environmentId: z.uuid(),
  environmentName: z.string(),
  publicationId: publicationIdSchema,
});

/**
 * An object as Finn shows it: like in the environment, its owners are not
 * named and its availability does not say what blocks it. Images are read
 * through one of the environments it is found in.
 */
export const foundObjectSchema = z.strictObject({
  objectId: objectIdSchema,
  ...environmentObjectSchema.omit({ publicationId: true, objectId: true })
    .shape,
  foundIn: z.array(objectFoundInSchema).min(1),
});

export const objectSearchResultSchema = z.strictObject({
  objects: z.array(foundObjectSchema),
  /** There are more matches than shown. */
  more: z.boolean(),
});

/** Open and closed environments that take new members (PS-ENV-001). */
export const environmentSearchQuerySchema = z.strictObject({
  q: searchTextSchema,
  type: z.enum(["open", "closed"]).optional(),
});

/**
 * An environment as Finn shows it: what anyone signed in may read of it.
 * The details and requirements are read from the environment itself.
 */
export const foundEnvironmentSchema = z.strictObject({
  id: z.uuid(),
  type: z.enum(["open", "closed"]),
  name: z.string(),
  description: z.string().nullable(),
  location: z.string().nullable(),
  /** The caller's own membership, if they have one. */
  membershipState: membershipStateSchema.exclude(["ended"]).nullable(),
});

export const environmentSearchResultSchema = z.strictObject({
  environments: z.array(foundEnvironmentSchema),
  /** There are more matches than shown. */
  more: z.boolean(),
});

export type ObjectSearchQuery = z.infer<typeof objectSearchQuerySchema>;
export type FoundObject = z.infer<typeof foundObjectSchema>;
export type ObjectSearchResult = z.infer<typeof objectSearchResultSchema>;
export type EnvironmentSearchQuery = z.infer<
  typeof environmentSearchQuerySchema
>;
export type FoundEnvironment = z.infer<typeof foundEnvironmentSchema>;
export type EnvironmentSearchResult = z.infer<
  typeof environmentSearchResultSchema
>;
