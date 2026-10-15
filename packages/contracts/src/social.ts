import { z } from "zod";
import { emailAddressSchema } from "./auth";
import { normalizeBase32 } from "./base32";

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
 * caller is never part of it (PS-USR-006). `canRequest` says whether the
 * caller may send a friend request now, never why not, so it does not tell
 * the caller that an earlier request was declined (PS-USR-012).
 */
export const socialRelationSchema = z.strictObject({
  userId: z.uuid(),
  friendship: friendshipStateSchema,
  blockedByMe: z.boolean(),
  canRequest: z.boolean(),
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

/** An environment named on a person's page. */
export const sharedEnvironmentSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
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
  /**
   * When the friendship began, or when the pending request between them
   * was sent; null when there is neither.
   */
  relationSince: z.iso.datetime().nullable(),
  /**
   * The environments both are active members of now, by name: where they
   * see each other (UX-PRIV-003). Empty while the caller blocks the person,
   * as they are then hidden from each other there.
   */
  sharedEnvironments: z.array(sharedEnvironmentSchema),
  trustProfile: z.boolean(),
});

export type SocialTarget = z.infer<typeof socialTargetSchema>;
export type FriendshipState = z.infer<typeof friendshipStateSchema>;
export type SocialRelation = z.infer<typeof socialRelationSchema>;
export type SocialContact = z.infer<typeof socialContactSchema>;
export type SocialOverview = z.infer<typeof socialOverviewSchema>;
export type SharedEnvironment = z.infer<typeof sharedEnvironmentSchema>;
export type Person = z.infer<typeof personSchema>;
export type PersonLink = z.infer<typeof personLinkSchema>;

/**
 * PS-USR-013: invite someone by e-mail address. With `befriend`, the
 * recipient also gets a friend request, at once if the address has an
 * account, or once they have registered. Without it, only a new participant
 * gets anything: an invitation to Lånbort (PS-USR-015).
 */
export const sendFriendInvitationSchema = z.strictObject({
  email: emailAddressSchema,
  befriend: z.boolean(),
});

/**
 * An invitation as its sender sees it, the same whether the address has an
 * account or not, and whatever the recipient did about it: only what the
 * sender wrote and when it ends (PS-USR-013).
 */
export const friendInvitationSchema = z.strictObject({
  id: z.uuid(),
  email: z.string(),
  befriend: z.boolean(),
  sentAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
});

/** The caller's open invitations, newest first. */
export const friendInvitationsSchema = z.strictObject({
  invitations: z.array(friendInvitationSchema),
});

export const friendInvitationTargetSchema = z.strictObject({
  invitationId: z.uuid(),
});

/** How many characters a friend code has (PS-USR-014). */
export const friendCodeLength = 10;

/**
 * A friend code as someone may type it from the screen: any case, spaces
 * and dashes, O for 0 (Crockford base32).
 */
export const friendCodeSchema = z
  .string()
  .max(40)
  .transform(normalizeBase32)
  .pipe(
    z.string().regex(new RegExp(`^[0-9A-HJKMNP-TV-Z]{${friendCodeLength}}$`)),
  );

export const friendCodeInputSchema = z.strictObject({ code: friendCodeSchema });

/** The caller's own friend code, shown as a QR code until it expires. */
export const ownFriendCodeSchema = z.strictObject({
  code: z.string(),
  expiresAt: z.iso.datetime(),
});

/**
 * The person whose friend code was scanned, as the scanner sees them: the
 * name the person chose to show and the scanner's relation to them, never
 * an id or an address (PS-USR-014).
 */
export const friendCodeOwnerSchema = z.strictObject({
  realName: z.string(),
  friendship: friendshipStateSchema,
  blockedByMe: z.boolean(),
  canRequest: z.boolean(),
});

export type SendFriendInvitation = z.infer<typeof sendFriendInvitationSchema>;
export type FriendInvitation = z.infer<typeof friendInvitationSchema>;
export type FriendInvitations = z.infer<typeof friendInvitationsSchema>;
export type OwnFriendCode = z.infer<typeof ownFriendCodeSchema>;
export type FriendCodeOwner = z.infer<typeof friendCodeOwnerSchema>;
