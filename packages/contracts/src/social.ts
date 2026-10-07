import { z } from "zod";

/**
 * Friendships and blocks (PS-USR-003–007). Every command names only the other
 * user: the caller is always one side of the relation, so a request can never
 * reach someone else's relations.
 */
export const socialTargetSchema = z.strictObject({
  // Ids are compared as stored, in lower case.
  userId: z.uuid().transform((id) => id.toLowerCase()),
});

/** The caller's friendship with the other user, from the caller's side. */
export const friendshipStateSchema = z.enum([
  "none",
  "outgoing_pending",
  "incoming_pending",
  "friends",
]);

/**
 * The caller's relation to one other user. Whether the other user blocks the
 * caller is never part of it (PS-USR-006).
 */
export const socialRelationSchema = z.strictObject({
  userId: z.uuid(),
  friendship: friendshipStateSchema,
  blockedByMe: z.boolean(),
});

/**
 * The page of a person (WP-86) as a link target: their id while the reader
 * may open it now (`person.read`), otherwise null, so nothing links to a
 * page the reader may not see (UX-PRIV-007) or to a deleted account
 * (UX-PRIV-010).
 */
export const profileIdSchema = z.uuid().nullable();

/**
 * A person's profile picture (PS-USR-002) as an address target: the id of
 * their current picture while the reader may see it, otherwise null. Only
 * someone who may open the page may see the picture, so it is null whenever
 * `profileId` is.
 */
export const pictureIdSchema = z.uuid().nullable();

/** How a read model that names a person points to their page and picture. */
export const personLinkShape = {
  profileId: profileIdSchema,
  pictureId: pictureIdSchema,
} as const;

export const personLinkSchema = z.strictObject(personLinkShape);

export const socialContactSchema = z.strictObject({
  userId: z.uuid(),
  /** Null for an account without a profile, such as an unfinished one. */
  realName: z.string().nullable(),
  ...personLinkShape,
  since: z.iso.datetime(),
});

/** The caller's own friends, requests and blocks, newest first. */
export const socialOverviewSchema = z.strictObject({
  friends: z.array(socialContactSchema),
  incomingRequests: z.array(socialContactSchema),
  outgoingRequests: z.array(socialContactSchema),
  blocked: z.array(socialContactSchema),
});

/**
 * A person as the caller may see them (WP-86): their real name, the
 * caller's relation to them (null on the caller's own page), and whether
 * the caller may read their trust profile (`trust_profile.read`). Whether
 * they block the caller is never part of it (PS-USR-006).
 */
export const personSchema = z.strictObject({
  userId: z.uuid(),
  realName: z.string(),
  pictureId: pictureIdSchema,
  relation: socialRelationSchema.nullable(),
  trustProfile: z.boolean(),
});

export type SocialTarget = z.infer<typeof socialTargetSchema>;
export type FriendshipState = z.infer<typeof friendshipStateSchema>;
export type SocialRelation = z.infer<typeof socialRelationSchema>;
export type SocialContact = z.infer<typeof socialContactSchema>;
export type SocialOverview = z.infer<typeof socialOverviewSchema>;
export type Person = z.infer<typeof personSchema>;
export type PersonLink = z.infer<typeof personLinkSchema>;
