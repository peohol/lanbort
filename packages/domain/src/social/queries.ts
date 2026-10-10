import {
  type SocialContact,
  type SocialOverview,
  socialTargetSchema,
} from "@lanbort/contracts";
import { z } from "zod";
import { defineQuery } from "../commands/query";
import { loadPair, readSnapshot, relationOf } from "./pair";
import { readSocialOverviewPolicy, readSocialRelationPolicy } from "./policies";
import { rateLimits } from "../abuse/rate-limits";
import { linkIn, type PersonLinks, personLinks } from "../people/queries";

/**
 * The caller's relation to one other user, for example to show the right
 * action on a profile. A user who blocks the caller is `not_found`, exactly
 * like one that does not exist.
 */
export const getSocialRelation = defineQuery({
  name: "social.relation.read",
  input: socialTargetSchema,
  policy: readSocialRelationPolicy,
  rateLimit: rateLimits.lookups,
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

const contacts = (
  rows: readonly ContactRow[],
  links: PersonLinks,
): SocialContact[] =>
  rows.map((row) => ({
    userId: row.userId,
    realName: row.realName,
    ...linkIn(links, row.userId),
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
  load: async ({ db, actor, now }) => {
    if (actor.kind !== "user") {
      return null;
    }

    const me = actor.userId;
    const [relations, blocks, links] = await readSnapshot(
      db,
      async (snapshot) => {
        const relations = await snapshot
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
          .innerJoin("app.users as other", "other.id", "profile.user_id")
          .select([
            "friendship.status",
            "friendship.requester_id as requesterId",
            "other.status as otherStatus",
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
          .execute();
        const blocks = await snapshot
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
          .execute();
        const links = await personLinks(
          snapshot,
          me,
          [...relations, ...blocks].map((row) => row.userId),
          now,
        );

        return [relations, blocks, links] as const;
      },
    );

    // A request waits only while both can answer it: one with an account
    // that is not active comes back if the account does (PS-ADM-002).
    const pending = relations.filter(
      (r) => r.status === "pending" && r.otherStatus === "active",
    );
    const overview: SocialOverview = {
      friends: contacts(
        relations.filter((r) => r.status === "active"),
        links,
      ),
      incomingRequests: contacts(
        pending.filter((r) => r.requesterId !== me),
        links,
      ),
      outgoingRequests: contacts(
        pending.filter((r) => r.requesterId === me),
        links,
      ),
      blocked: contacts(blocks, links),
    };

    return { resource: overview, context: undefined };
  },
  present: ({ resource }) => resource,
});
