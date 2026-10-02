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

export const socialContactSchema = z.strictObject({
  userId: z.uuid(),
  /** Null for an account without a profile, such as an unfinished one. */
  realName: z.string().nullable(),
  since: z.iso.datetime(),
});

/** The caller's own friends, requests and blocks, newest first. */
export const socialOverviewSchema = z.strictObject({
  friends: z.array(socialContactSchema),
  incomingRequests: z.array(socialContactSchema),
  outgoingRequests: z.array(socialContactSchema),
  blocked: z.array(socialContactSchema),
});

export type SocialTarget = z.infer<typeof socialTargetSchema>;
export type FriendshipState = z.infer<typeof friendshipStateSchema>;
export type SocialRelation = z.infer<typeof socialRelationSchema>;
export type SocialContact = z.infer<typeof socialContactSchema>;
export type SocialOverview = z.infer<typeof socialOverviewSchema>;
