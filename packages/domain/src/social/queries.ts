import {
  type SocialContact,
  type SocialOverview,
  socialTargetSchema,
} from "@lanbort/contracts";
import { z } from "zod";
import { defineQuery } from "../commands/query";
import { loadPair, readSnapshot, relationOf } from "./pair";
import { readSocialOverviewPolicy, readSocialRelationPolicy } from "./policies";

/**
 * The caller's relation to one other user, for example to show the right
 * action on a profile. A user who blocks the caller is `not_found`, exactly
 * like one that does not exist.
 */
export const getSocialRelation = defineQuery({
  name: "social.relation.read",
  input: socialTargetSchema,
  policy: readSocialRelationPolicy,
  load: async ({ db, actor, input }) => {
    if (actor.kind !== "user") {
      return null;
    }

    const pair = await readSnapshot(db, (snapshot) =>
      loadPair(snapshot, actor.userId, input.userId),
    );

    return pair ? { resource: pair, context: undefined } : null;
  },
  present: ({ resource }) => relationOf(resource),
});

interface ContactRow {
  readonly userId: string;
  readonly realName: string | null;
  readonly since: Date;
}

const contacts = (rows: readonly ContactRow[]): SocialContact[] =>
  rows.map((row) => ({
    userId: row.userId,
    realName: row.realName,
    since: row.since.toISOString(),
  }));

/**
 * The caller's own friends, pending requests in both directions and the users
 * they block. Only the counterpart's id and real name are shown, which the
 * relation needs to be understood and acted on.
 */
export const getSocialOverview = defineQuery({
  name: "social.overview.read",
  input: z.strictObject({}),
  policy: readSocialOverviewPolicy,
  load: async ({ db, actor }) => {
    if (actor.kind !== "user") {
      return null;
    }

    const me = actor.userId;
    const [relations, blocks] = await readSnapshot(
      db,
      async (snapshot) =>
        [
          await snapshot
            .selectFrom("app.friendships as friendship")
            .innerJoin("app.profiles as profile", (join) =>
              join.on((eb) =>
                eb(
                  "profile.user_id",
                  "=",
                  eb
                    .case()
                    .when("friendship.requester_id", "=", me)
                    .then(eb.ref("friendship.addressee_id"))
                    .else(eb.ref("friendship.requester_id"))
                    .end(),
                ),
              ),
            )
            .select([
              "friendship.status",
              "friendship.requester_id as requesterId",
              "profile.user_id as userId",
              "profile.real_name as realName",
              (eb) =>
                eb.fn
                  .coalesce("friendship.accepted_at", "friendship.requested_at")
                  .as("since"),
            ])
            .where((eb) =>
              eb.or([
                eb("friendship.requester_id", "=", me),
                eb("friendship.addressee_id", "=", me),
              ]),
            )
            .where("friendship.status", "<>", "ended")
            .orderBy("since", "desc")
            .execute(),
          await snapshot
            .selectFrom("app.user_blocks as block")
            .leftJoin(
              "app.profiles as profile",
              "profile.user_id",
              "block.blocked_id",
            )
            .select([
              "block.blocked_id as userId",
              "profile.real_name as realName",
              "block.created_at as since",
            ])
            .where("block.blocker_id", "=", me)
            .where("block.lifted_at", "is", null)
            .orderBy("block.created_at", "desc")
            .execute(),
        ] as const,
    );

    const overview: SocialOverview = {
      friends: contacts(relations.filter((r) => r.status === "active")),
      incomingRequests: contacts(
        relations.filter((r) => r.status === "pending" && r.requesterId !== me),
      ),
      outgoingRequests: contacts(
        relations.filter((r) => r.status === "pending" && r.requesterId === me),
      ),
      blocked: contacts(blocks),
    };

    return { resource: overview, context: undefined };
  },
  present: ({ resource }) => resource,
});
