import type { Database } from "@lanbort/database";
import { type Person, socialTargetSchema } from "@lanbort/contracts";
import type { Kysely } from "kysely";
import { rateLimits } from "../abuse/rate-limits";
import { defineQuery } from "../commands/query";
import { inSnapshot } from "../objects/state";
import { relationOf } from "../social/pair";
import { hasProfileAccess } from "../trust/policies";
import { personVisible, readPersonPolicy } from "./policies";
import { loadPeople, profileAccessOf } from "./store";

/**
 * Of `userIds`, the people whose page `viewerId` may open now, for read
 * models that name people: a name links to the page only then
 * (UX-PRIV-007). Read it in the same snapshot as the names.
 */
export async function personPageIds(
  db: Kysely<Database>,
  viewerId: string,
  userIds: readonly string[],
  now: Date,
): Promise<ReadonlySet<string>> {
  const people = await loadPeople(db, viewerId, userIds, now);

  return new Set(
    [...people.values()].filter(personVisible).map((person) => person.userId),
  );
}

/** A person's id when their page is in `pages`, for `profileId` fields. */
export const profileIdIn = (pages: ReadonlySet<string>, userId: string) =>
  pages.has(userId) ? userId : null;

/**
 * A person's page (WP-86): their name, the caller's relation to them, and
 * whether the caller may read their trust profile. Someone the caller may
 * not see is `not_found`, exactly like someone who does not exist.
 */
export const readPerson = defineQuery({
  name: "person.read",
  input: socialTargetSchema,
  policy: readPersonPolicy,
  rateLimit: rateLimits.lookups,
  load: async ({ db, actor, input, now }) => {
    if (actor.kind !== "user") {
      return null;
    }

    const people = await inSnapshot(db, (tx) =>
      loadPeople(tx, actor.userId, [input.userId], now),
    );
    const person = people.get(input.userId);

    return person ? { resource: person, context: undefined } : null;
  },
  present: ({ resource }): Person => {
    if (resource.realName === null) {
      throw new Error("The policy allows only people with a profile");
    }

    return {
      userId: resource.userId,
      realName: resource.realName,
      relation: resource.pair && relationOf(resource.pair),
      trustProfile: hasProfileAccess(
        resource.viewerId,
        profileAccessOf(resource),
      ),
    };
  },
});
