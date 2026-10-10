import { z } from "zod";
import { approximateMembersSchema, membershipStateSchema } from "./environment";
import { completeNearSearch, geoAreaSchema, nearSearchShape } from "./geo";
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
 * Objects the caller finds in their environments (PS-OBJ-006) and through
 * their friends (PS-OBJ-020): by text, by category (with the categories below
 * it), within one of their environments or only through friends (the filter
 * «Venner»), and only those actually available the whole period from
 * `availableFrom` through `availableTo` (both inclusive). Text or category is
 * required. Near an area (WP-62), only in the caller's environments whose own
 * approximate area overlaps it: objects have no place of their own, so none
 * is found through friends there.
 */
export const objectSearchQuerySchema = z
  .strictObject({
    q: searchTextSchema.optional(),
    categoryId: objectCategoryIdSchema.optional(),
    environmentId: z.uuid().optional(),
    /** Also as text, from the address of a search. */
    friends: z.union([z.boolean(), z.stringbool()]).optional(),
    availableFrom: calendarDateSchema.optional(),
    availableTo: calendarDateSchema.optional(),
    ...nearSearchShape,
  })
  .refine(({ q, categoryId }) => q !== undefined || categoryId !== undefined, {
    message: "Search by text or category",
  })
  .refine(completeNearSearch, { message: "An area needs a centre and a size" })
  .refine(
    ({ friends, environmentId }) => !friends || environmentId === undefined,
    { message: "Search one environment or through friends, not both" },
  )
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
 * An object as Finn shows it: like in the environment, its availability does
 * not say what blocks it, and `owners` names the owners who are active
 * members of an environment it is found in (PS-ENV-015) and, found through
 * friends, the owners the caller is a friend of (PS-OBJ-022). It is found in at
 * least one of the caller's environments or through a friend. Images are read
 * through one of the environments it is found in, or through friends.
 */
export const foundObjectSchema = z.strictObject({
  objectId: objectIdSchema,
  ...environmentObjectSchema.omit({ publicationId: true, objectId: true })
    .shape,
  foundIn: z.array(objectFoundInSchema),
  /** A friend who owns it has made it visible to friends (PS-OBJ-020). */
  foundThroughFriends: z.boolean(),
});

export const objectSearchResultSchema = z.strictObject({
  objects: z.array(foundObjectSchema),
  /** There are more matches than shown. */
  more: z.boolean(),
});

/**
 * Open and closed environments that take new members (PS-ENV-001), by text,
 * by an area their own approximate area overlaps (WP-62), or both.
 */
export const environmentSearchQuerySchema = z
  .strictObject({
    q: searchTextSchema.optional(),
    type: z.enum(["open", "closed"]).optional(),
    ...nearSearchShape,
  })
  .refine(completeNearSearch, { message: "An area needs a centre and a size" })
  .refine(({ q, latitude }) => q !== undefined || latitude !== undefined, {
    message: "Search by text or area",
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
  area: geoAreaSchema.nullable(),
  /** About how many active members it has (PS-ENV-016). */
  members: approximateMembersSchema,
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
