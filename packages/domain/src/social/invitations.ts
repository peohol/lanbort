import {
  type FriendInvitation,
  type FriendInvitations,
  friendInvitationSchema,
  friendInvitationTargetSchema,
  sendFriendInvitationSchema,
} from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import { type Kysely, sql, type Transaction } from "kysely";
import { z } from "zod";
import { rateLimits } from "../abuse/rate-limits";
import type { AccountDeletionStep } from "../account/deletion";
import { takesNewActivity } from "../account/model";
import type { AccountStatus } from "../actor";
import { defineCommand } from "../commands/command";
import { defineQuery } from "../commands/query";
import type { EventRecorder } from "../events/recorder";
import { endFriendship, requestFriendship } from "./commands";
import {
  friendInvitationExpired,
  friendInvitationSent,
  friendInvitationWithdrawn,
  friendshipWithdrawn,
} from "./events";
import { loadPair, lockPair, mayRequestFriendship } from "./pair";
import {
  expireFriendInvitationsPolicy,
  type OwnInvitation,
  readFriendInvitationsPolicy,
  recordInvitationIdentityPolicy,
  sendFriendInvitationPolicy,
  withdrawFriendInvitationPolicy,
} from "./policies";

type Db = Kysely<Database>;

const day = 24 * 60 * 60 * 1000;

/** How long an invitation sent to an e-mail address lasts (PS-USR-013). */
export const friendInvitationLifetimeMs = 14 * day;

interface InvitationRow {
  readonly id: string;
  readonly inviter_id: string;
  readonly address: string;
  readonly befriend: boolean;
  readonly created_at: Date;
  readonly expires_at: Date;
  readonly ended_at: Date | null;
  readonly friendship_id: string | null;
}

const invitationColumns = [
  "id",
  "inviter_id",
  "address",
  "befriend",
  "created_at",
  "expires_at",
  "ended_at",
  "friendship_id",
] as const;

const present = (row: InvitationRow): FriendInvitation => ({
  id: row.id,
  email: row.address,
  befriend: row.befriend,
  sentAt: row.created_at.toISOString(),
  expiresAt: row.expires_at.toISOString(),
});

/** The account an address belongs to now, if any (PS-USR-001). */
export async function accountWithAddress(
  db: Db,
  address: string,
): Promise<string | null> {
  const row = await db
    .selectFrom("app.verified_contacts")
    .select("user_id")
    .where("kind", "=", "email")
    .where("address", "=", address)
    .executeTakeFirst();

  return row?.user_id ?? null;
}

/**
 * The friend request an invitation asks for, from its sender to the account
 * `recipientId`, made only where an ordinary request could be and the
 * recipient may be reached: no block either way, no declined request to
 * wait out (PS-USR-006, PS-USR-012), and no relation already open. Hidden
 * from the sender until it is accepted, and otherwise silent: the sender
 * learns nothing either way (PS-USR-013).
 */
async function requestByInvitation(
  tx: Transaction<Database>,
  invitation: Pick<InvitationRow, "id" | "inviter_id">,
  recipientId: string,
  events: EventRecorder,
  now: Date,
): Promise<void> {
  await lockPair(tx, invitation.inviter_id, recipientId);
  // Both accounts hold still until the request is made, so neither stops
  // taking new activity in between, which would fail the whole command
  // and tell the sender something (`app.require_active_accounts`).
  const accounts = await tx
    .selectFrom("app.users")
    .select(["id", "status"])
    .where("id", "in", [invitation.inviter_id, recipientId])
    .orderBy("id")
    .forShare()
    .execute();
  const pair = await loadPair(tx, invitation.inviter_id, recipientId);

  if (
    !pair ||
    !accounts.every((account) =>
      takesNewActivity(account.status as AccountStatus),
    ) ||
    pair.openFriendship ||
    pair.blockedByOther ||
    !mayRequestFriendship(pair)
  ) {
    return;
  }

  const friendshipId = await requestFriendship({ tx, pair, events, now }, true);

  await tx
    .updateTable("app.friend_invitations")
    .set({ friendship_id: friendshipId })
    .where("id", "=", invitation.id)
    .execute();
}

/**
 * Ends an open invitation, and the friend request it became while that
 * still waits: as if its sender had withdrawn it (PS-USR-011, nobody is
 * told). An accepted or declined request stays as it is.
 */
async function endInvitation(
  tx: Transaction<Database>,
  invitation: Pick<InvitationRow, "id" | "inviter_id" | "friendship_id">,
  reason: "withdrawn" | "expired",
  events: EventRecorder,
  now: Date,
): Promise<void> {
  if (invitation.friendship_id) {
    const request = await tx
      .selectFrom("app.friendships")
      .select(["status", "requester_id", "addressee_id"])
      .where("id", "=", invitation.friendship_id)
      .executeTakeFirstOrThrow();

    await lockPair(tx, request.requester_id, request.addressee_id);
    const pair = await loadPair(
      tx,
      invitation.inviter_id,
      request.addressee_id,
    );

    if (pair?.openFriendship?.id === invitation.friendship_id) {
      if (pair.openFriendship.status === "pending") {
        await endFriendship(
          { tx, pair, events, now },
          invitation.friendship_id,
          "withdrawn",
          friendshipWithdrawn,
        );
      }
    }
  }

  await tx
    .updateTable("app.friend_invitations")
    .set({ ended_at: now, end_reason: reason })
    .where("id", "=", invitation.id)
    .execute();

  events.record(
    reason === "withdrawn"
      ? friendInvitationWithdrawn
      : friendInvitationExpired,
    { resourceId: invitation.id, payload: {} },
  );
}

/** One sender's invitations to one address are decided one at a time. */
async function lockInvitations(
  tx: Transaction<Database>,
  inviterId: string,
  address: string,
): Promise<void> {
  const key = JSON.stringify(["friend_invitation", inviterId, address]);

  await sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`.execute(
    tx,
  );
}

/**
 * PS-USR-013: invite someone by e-mail address, optionally as a friend.
 * The answer is the same whatever the address is: the invitation as the
 * sender wrote it. Sending the same again while it is open changes nothing;
 * changing whether to befriend replaces it. What happens behind it is
 * decided here and after commit, and never told to the sender: an existing
 * account gets the request in the app, a new participant an e-mail
 * (`friendInvitationDelivery`, PS-USR-015), anyone else nothing.
 */
export const sendFriendInvitation = defineCommand({
  name: "friend_invitation.send",
  input: sendFriendInvitationSchema,
  output: friendInvitationSchema,
  policy: sendFriendInvitationPolicy,
  rateLimit: rateLimits.emailInvitations,
  idempotency: "required",
  load: async ({ tx, actor, input }) => {
    if (actor.kind !== "user") {
      return null;
    }

    await lockInvitations(tx, actor.userId, input.email);

    return { resource: { inviterId: actor.userId }, context: undefined };
  },
  execute: async ({ tx, input, resource, events, now }) => {
    const open = await tx
      .selectFrom("app.friend_invitations")
      .select(invitationColumns)
      .where("inviter_id", "=", resource.inviterId)
      .where("address", "=", input.email)
      .where("ended_at", "is", null)
      .executeTakeFirst();

    if (open && open.expires_at > now && open.befriend === input.befriend) {
      return present(open);
    }

    if (open) {
      await endInvitation(
        tx,
        open,
        open.expires_at > now ? "withdrawn" : "expired",
        events,
        now,
      );
    }

    const invitation = await tx
      .insertInto("app.friend_invitations")
      .values({
        inviter_id: resource.inviterId,
        address: input.email,
        befriend: input.befriend,
        created_at: now,
        expires_at: new Date(now.getTime() + friendInvitationLifetimeMs),
      })
      .returning(invitationColumns)
      .executeTakeFirstOrThrow();

    events.record(friendInvitationSent, {
      resourceId: invitation.id,
      payload: {},
    });

    const recipientId = invitation.befriend
      ? await accountWithAddress(tx, invitation.address)
      : null;

    if (recipientId && recipientId !== resource.inviterId) {
      await requestByInvitation(tx, invitation, recipientId, events, now);
    }

    return present(invitation);
  },
});

/** Loads one of the caller's own invitations, locked for a change. */
async function loadOwnInvitation(
  tx: Transaction<Database>,
  invitationId: string,
): Promise<{
  resource: OwnInvitation & InvitationRow;
  context: undefined;
} | null> {
  const row = await tx
    .selectFrom("app.friend_invitations")
    .select(invitationColumns)
    .where("id", "=", invitationId)
    .forUpdate()
    .executeTakeFirst();

  return row
    ? { resource: { ...row, inviterId: row.inviter_id }, context: undefined }
    : null;
}

/**
 * PS-USR-013: the sender takes an invitation back. A request it became that
 * still waits ends with it; one already accepted or declined stays as it
 * is, so withdrawing tells the sender nothing either.
 */
export const withdrawFriendInvitation = defineCommand({
  name: "friend_invitation.withdraw",
  input: friendInvitationTargetSchema,
  output: z.strictObject({}),
  policy: withdrawFriendInvitationPolicy,
  idempotency: "required",
  load: ({ tx, input }) => loadOwnInvitation(tx, input.invitationId),
  execute: async ({ tx, resource, events, now }) => {
    if (resource.ended_at === null && resource.expires_at > now) {
      await endInvitation(tx, resource, "withdrawn", events, now);
    }

    return {};
  },
});

/**
 * The caller's open invitations, newest first: until they expire, are
 * withdrawn or become a friendship, whatever else happened to them.
 */
export const listFriendInvitations = defineQuery({
  name: "friend_invitation.list",
  input: z.strictObject({}),
  policy: readFriendInvitationsPolicy,
  load: async ({ db, actor, now }) => {
    if (actor.kind !== "user") {
      return null;
    }

    const rows = await db
      .selectFrom("app.friend_invitations as invitation")
      .leftJoin(
        "app.friendships as friendship",
        "friendship.id",
        "invitation.friendship_id",
      )
      .select(
        invitationColumns.map((column) => `invitation.${column}` as const),
      )
      .where("invitation.inviter_id", "=", actor.userId)
      .where("invitation.ended_at", "is", null)
      .where("invitation.expires_at", ">", now)
      .where("friendship.accepted_at", "is", null)
      .orderBy("invitation.created_at", "desc")
      .orderBy("invitation.id")
      .execute();

    return { resource: rows, context: undefined };
  },
  present: ({ resource }): FriendInvitations => ({
    invitations: resource.map(present),
  }),
});

/**
 * PS-USR-013: once the recipient of invitations with a friend request has
 * registered with the address they were sent to, each sender's request is
 * made as if they had an account all along. Runs in the registration's
 * transaction, which has just activated the account.
 */
export async function redeemFriendInvitations(
  tx: Transaction<Database>,
  userId: string,
  events: EventRecorder,
  now: Date,
): Promise<void> {
  const invitations = await tx
    .selectFrom("app.friend_invitations as invitation")
    .innerJoin("app.verified_contacts as contact", (join) =>
      join
        .onRef("contact.address", "=", "invitation.address")
        .on("contact.kind", "=", "email"),
    )
    .select(["invitation.id", "invitation.inviter_id"])
    .where("contact.user_id", "=", userId)
    .where("invitation.befriend", "=", true)
    .where("invitation.friendship_id", "is", null)
    .where("invitation.ended_at", "is", null)
    .where("invitation.expires_at", ">", now)
    .where("invitation.inviter_id", "<>", userId)
    .orderBy("invitation.created_at")
    .orderBy("invitation.id")
    .execute();

  for (const invitation of invitations) {
    await requestByInvitation(tx, invitation, userId, events, now);
  }
}

/**
 * Ends invitations that have expired, with the requests they became that
 * still wait, and deletes expired friend codes (PS-USR-013, PS-USR-014).
 * Safe to run repeatedly and concurrently.
 */
export const expireFriendInvitations = defineCommand({
  name: "friend_invitation.expire_due",
  input: z.strictObject({}),
  output: z.strictObject({
    invitations: z.int().nonnegative(),
    codes: z.int().nonnegative(),
  }),
  policy: expireFriendInvitationsPolicy,
  idempotency: "none",
  load: async () => ({ resource: undefined, context: undefined }),
  execute: async ({ tx, events, now }) => {
    const due = await tx
      .selectFrom("app.friend_invitations")
      .select(invitationColumns)
      .where("ended_at", "is", null)
      .where("expires_at", "<=", now)
      .orderBy("expires_at")
      .limit(100)
      .forUpdate()
      .skipLocked()
      .execute();

    for (const invitation of due) {
      await endInvitation(tx, invitation, "expired", events, now);
    }

    const codes = await tx
      .deleteFrom("app.friend_codes")
      .where("expires_at", "<=", now)
      .executeTakeFirst();

    return {
      invitations: due.length,
      codes: Number(codes.numDeletedRows),
    };
  },
});

/**
 * Records, or forgets, the sign-in identity an invitation made at the auth
 * provider for a new participant, so it can be removed again if the
 * invitation ends unused. Only ever set once.
 */
export const recordInvitationIdentity = defineCommand({
  name: "friend_invitation.record_identity",
  input: z.strictObject({
    invitationId: z.uuid(),
    subject: z
      .string()
      .regex(/^[A-Za-z0-9_.:-]{1,255}$/)
      .nullable(),
  }),
  output: z.strictObject({}),
  policy: recordInvitationIdentityPolicy,
  idempotency: "none",
  load: async () => ({ resource: undefined, context: undefined }),
  execute: async ({ tx, input }) => {
    await tx
      .updateTable("app.friend_invitations")
      .set({ identity_subject: input.subject })
      .where("id", "=", input.invitationId)
      .where((eb) =>
        input.subject === null
          ? eb("identity_subject", "is not", null)
          : eb("identity_subject", "is", null),
      )
      .execute();

    return {};
  },
});

/**
 * PS-ADM-006: a deleted account's invitations end as if withdrawn, so a
 * sign-in identity one of them made for a new participant goes too, and
 * its friend code is deleted. Its friend requests have already ended with
 * its other relations.
 */
export const friendInvitationsDeletionStep: AccountDeletionStep = {
  name: "friend_invitations",
  run: async (db, userId, now, events) => {
    const ended = await db
      .updateTable("app.friend_invitations")
      .set({ ended_at: now, end_reason: "withdrawn" })
      .where("inviter_id", "=", userId)
      .where("ended_at", "is", null)
      .returning("id")
      .execute();

    for (const { id } of ended) {
      events.record(friendInvitationWithdrawn, { resourceId: id, payload: {} });
    }

    await db
      .deleteFrom("app.friend_codes")
      .where("user_id", "=", userId)
      .execute();
  },
};
