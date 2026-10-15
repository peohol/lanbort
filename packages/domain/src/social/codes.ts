import { createHash, randomBytes } from "node:crypto";
import {
  encodeBase32,
  type FriendCodeOwner,
  friendCodeInputSchema,
  friendCodeLength,
  friendCodeOwnerSchema,
  ownFriendCodeSchema,
} from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import type { Kysely } from "kysely";
import { z } from "zod";
import { rateLimits } from "../abuse/rate-limits";
import { defineCommand } from "../commands/command";
import { defineQuery } from "../commands/query";
import { requestFriendship } from "./commands";
import {
  loadPair,
  lockPair,
  readSnapshot,
  relationOf,
  type SocialPair,
} from "./pair";
import {
  createFriendCodePolicy,
  readFriendCodePolicy,
  requestFriendByCodePolicy,
} from "./policies";

type Db = Kysely<Database>;

/** How long a friend code can be used after it is shown (PS-USR-014). */
export const friendCodeLifetimeMs = 5 * 60 * 1000;

/** Only a hash of a code is kept, as with other one-time codes. */
const hashOf = (code: string) => createHash("sha256").update(code).digest();

/**
 * A new random code: 50 bits in Crockford base32, read and typed by people,
 * guessed by nobody within its five minutes (each guess is a rate-limited
 * lookup). It says nothing about who made it.
 */
function newFriendCode(): string {
  return encodeBase32(randomBytes(7), friendCodeLength);
}

/**
 * PS-USR-014: a new friend code for the caller, to show as a QR code for
 * five minutes. It replaces the caller's earlier code, so only the latest
 * one works.
 */
export const createFriendCode = defineCommand({
  name: "friend_code.create",
  input: z.strictObject({}),
  output: ownFriendCodeSchema,
  policy: createFriendCodePolicy,
  rateLimit: rateLimits.friendCodes,
  idempotency: "none",
  load: async ({ actor }) =>
    actor.kind === "user"
      ? { resource: { inviterId: actor.userId }, context: undefined }
      : null,
  execute: async ({ tx, resource, now }) => {
    const code = newFriendCode();
    const expiresAt = new Date(now.getTime() + friendCodeLifetimeMs);
    const values = {
      code_hash: hashOf(code),
      created_at: now,
      expires_at: expiresAt,
    };

    await tx
      .insertInto("app.friend_codes")
      .values({ user_id: resource.inviterId, ...values })
      .onConflict((conflict) => conflict.column("user_id").doUpdateSet(values))
      .execute();

    return { code, expiresAt: expiresAt.toISOString() };
  },
});

/** The person a code that still works belongs to. */
async function codeOwner(
  db: Db,
  code: string,
  now: Date,
): Promise<{ userId: string; realName: string } | null> {
  const row = await db
    .selectFrom("app.friend_codes as code")
    .innerJoin("app.profiles as profile", "profile.user_id", "code.user_id")
    .select(["code.user_id as userId", "profile.real_name as realName"])
    .where("code.code_hash", "=", hashOf(code))
    .where("code.expires_at", ">", now)
    .executeTakeFirst();

  return row ?? null;
}

/** The scanner's pair with the person behind a code, and their name. */
interface CodePair extends SocialPair {
  readonly realName: string;
}

/** The person by their name and the scanner's relation to them, never by id. */
function presentOwner(pair: SocialPair, realName: string): FriendCodeOwner {
  const { friendship, blockedByMe, canRequest } = relationOf(pair);

  return { realName, friendship, blockedByMe, canRequest };
}

/**
 * PS-USR-014: who a scanned or typed code belongs to, so the scanner sees
 * the name before asking. A code that has expired, never existed, is the
 * scanner's own, or belongs to someone who blocks the scanner is the same
 * `not_found`.
 */
export const readFriendCode = defineQuery<
  { code: string },
  CodePair,
  void,
  FriendCodeOwner
>({
  name: "friend_code.read",
  input: friendCodeInputSchema,
  policy: readFriendCodePolicy,
  rateLimit: rateLimits.lookups,
  load: async ({ db, actor, input, now }) => {
    if (actor.kind !== "user") {
      return null;
    }

    const pair = await readSnapshot(db, async (snapshot) => {
      const owner = await codeOwner(snapshot, input.code, now);
      const pair =
        owner && (await loadPair(snapshot, actor.userId, owner.userId));

      return owner && pair ? { ...pair, realName: owner.realName } : null;
    });

    return pair ? { resource: pair, context: undefined } : null;
  },
  present: ({ resource }) => presentOwner(resource, resource.realName),
});

/**
 * PS-USR-014: a friend request to the person whose code the caller has,
 * while it still works. An ordinary request after that: the person accepts
 * or declines it as any other, and the same blocks and holds apply.
 */
export const requestFriendByCode = defineCommand<
  { code: string },
  CodePair,
  void,
  FriendCodeOwner
>({
  name: "friend_code.request",
  input: friendCodeInputSchema,
  output: friendCodeOwnerSchema,
  policy: requestFriendByCodePolicy,
  rateLimit: rateLimits.contact,
  idempotency: "required",
  load: async ({ tx, actor, input, now }) => {
    if (actor.kind !== "user") {
      return null;
    }

    const owner = await codeOwner(tx, input.code, now);

    if (!owner || owner.userId === actor.userId) {
      return null;
    }

    await lockPair(tx, actor.userId, owner.userId);
    const pair = await loadPair(tx, actor.userId, owner.userId);

    return pair
      ? { resource: { ...pair, realName: owner.realName }, context: undefined }
      : null;
  },
  execute: async ({ tx, resource, events, now }) => {
    await requestFriendship({ tx, pair: resource, events, now });
    const after = await loadPair(tx, resource.actorId, resource.otherUserId);

    return presentOwner(after as SocialPair, resource.realName);
  },
});
