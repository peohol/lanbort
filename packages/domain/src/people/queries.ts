import type { Database } from "@lanbort/database";
import {
  type Person,
  type PersonLink,
  socialTargetSchema,
} from "@lanbort/contracts";
import type { Kysely } from "kysely";
import { rateLimits } from "../abuse/rate-limits";
import { defineQuery } from "../commands/query";
import { inSnapshot } from "../objects/state";
import { relationOf } from "../social/pair";
import { hasProfileAccess } from "../trust/policies";
import { pictureVisible, personVisible, readPersonPolicy } from "./policies";
import { loadPeople, type PersonRelation, profileAccessOf } from "./store";

/** What `viewerId` is shown of people's pages and pictures, by user id. */
export type PersonLinks = ReadonlyMap<string, PersonLink>;

/** No link to anyone, for read models without a signed-in viewer. */
export const noPersonLinks: PersonLinks = new Map();

const unlinked: PersonLink = { profileId: null, pictureId: null };

/** What a read model may show of a person (UX-PRIV-007, PS-USR-002). */
export function personLinkOf(person: PersonRelation): PersonLink {
  return personVisible(person)
    ? {
        profileId: person.userId,
        pictureId: pictureVisible(person) ? person.picture!.id : null,
      }
    : unlinked;
}

/**
 * Of `userIds`, the pages and pictures `viewerId` may see now, for read
 * models that name people: a name links to the page, and shows the
 * picture, only then (UX-PRIV-007, PS-USR-002). Read it in the same
 * snapshot as the names.
 */
export async function personLinks(
  db: Kysely<Database>,
  viewerId: string,
  userIds: readonly string[],
  now: Date,
): Promise<PersonLinks> {
  const people = await loadPeople(db, viewerId, userIds, now);

  return new Map(
    [...people.values()].map((person) => [person.userId, personLinkOf(person)]),
  );
}

/** A person's link in `links`, for the `profileId` and `pictureId` fields. */
export const linkIn = (links: PersonLinks, userId: string): PersonLink =>
  links.get(userId) ?? unlinked;

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
      pictureId: personLinkOf(resource).pictureId,
      relation: resource.pair && relationOf(resource.pair),
      trustProfile: hasProfileAccess(
        resource.viewerId,
        profileAccessOf(resource),
      ),
    };
  },
});
