import {
  type EnvironmentSearchResult,
  environmentSearchQuerySchema,
  type GeoArea,
  type MembershipState,
  nearOf,
  type ObjectSearchQuery,
  type ObjectSearchResult,
  objectSearchQuerySchema,
  searchResultLimit,
} from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import { type Kysely, sql } from "kysely";
import { defineQuery } from "../commands/query";
import { effectiveState, toArea } from "../environment/model";
import {
  approximateMembers,
  loadApproximateMembers,
} from "../environment/member-count";
import { loadEnvironmentAccess } from "../environment/store";
import { withinAvailability } from "../loans/model";
import { addDays } from "../objects/availability";
import { inSnapshot } from "../objects/state";
import {
  discoverableThroughFriends,
  selectFoundThroughFriends,
} from "../publications/friends";
import {
  discoverableFor,
  type FoundRow,
  foundAvailability,
  loadFoundDetails,
  presentFound,
  selectFound,
} from "../publications/queries";
import { environmentOwners } from "../publications/owners";
import { searchEnvironmentsPolicy, searchObjectsPolicy } from "./policies";
import { rateLimits } from "../abuse/rate-limits";

type Db = Kysely<Database>;

/**
 * Matches considered per environment, and through friends, before
 * availability is checked. A search that reaches it says there may be more
 * (`more`), so the user narrows it instead of scrolling (UX-P20).
 */
const candidatesPerEnvironment = 200;

/** Most relevant first; equally relevant ones by title. */
const relevance = (a: Ranked, b: Ranked) =>
  b.rank - a.rank ||
  a.title.localeCompare(b.title, "nb") ||
  (a.objectId < b.objectId ? -1 : 1);

interface Ranked {
  readonly objectId: string;
  readonly title: string;
  readonly rank: number;
}

interface Candidate extends Ranked {
  readonly row: FoundRow;
  readonly foundIn: {
    environmentId: string;
    environmentName: string;
    publicationId: string;
  }[];
  readonly throughFriends: boolean;
}

/**
 * WP-62: whether the approximate area in `<table>.area_*` overlaps the one
 * searched. An environment without an area is never near anything.
 */
const overlaps = (table: "entry" | "environment", near: GeoArea) =>
  sql<boolean>`app.geo_areas_overlap(
    ${sql.ref(`${table}.area_latitude`)},
    ${sql.ref(`${table}.area_longitude`)},
    ${sql.ref(`${table}.area_radius_km`)},
    ${near.latitude}, ${near.longitude}, ${near.radiusKm}
  )`;

/**
 * The environments in which the user is an active member, as stored; near
 * an area, only those whose own area overlaps it.
 */
async function activeEnvironmentsOf(
  db: Db,
  userId: string,
  only: string | undefined,
  near: GeoArea | undefined,
): Promise<string[]> {
  const rows = await db
    .selectFrom("app.environment_memberships as membership")
    .select("membership.environment_id")
    .where("membership.user_id", "=", userId)
    .where("membership.state", "=", "active")
    .$if(only !== undefined, (query) =>
      query.where("membership.environment_id", "=", only as string),
    )
    .$if(near !== undefined, (query) =>
      query
        .innerJoin(
          "app.environments as environment",
          "environment.id",
          "membership.environment_id",
        )
        .where(overlaps("environment", near as GeoArea)),
    )
    .orderBy("membership.environment_id")
    .execute();

  return rows.map((row) => row.environment_id);
}

/** Text ranks by the derived index; without text every match ranks equal. */
const rankBy = (q: string | undefined) =>
  q === undefined
    ? sql<number>`0`
    : sql<number>`ts_rank(entry.document, app.search_query(${q}))`;

/**
 * The text and category searched, for a query that names the object
 * `object`, matched against the derived index.
 */
function matchesSearch({ q, categoryId }: ObjectSearchQuery) {
  return sql<boolean>`(
    ${
      q === undefined
        ? sql`true`
        : sql`exists (
            select 1 from app.search_objects as entry
            where entry.object_id = object.id
              and entry.document @@ app.search_query(${q})
          )`
    }
    and ${
      categoryId === undefined
        ? sql`true`
        : sql`object.category_id in (select app.object_category_subtree(${categoryId}))`
    }
  )`;
}

/** How well `object` matches the text, by the derived index. */
const objectRank = (q: string | undefined) =>
  q === undefined
    ? sql<number>`0`
    : sql<number>`(
        select ts_rank(entry.document, app.search_query(${q}))
        from app.search_objects as entry
        where entry.object_id = object.id
      )`;

/**
 * Objects the caller finds (PS-OBJ-006, PS-OBJ-020, ADR-0005). Who finds
 * what is decided per environment by `discoverableFor`, the same rule as the
 * environment's own list, including historical privacy and blocking, and
 * through friends by `discoverableThroughFriends`, the same rule as a
 * friend's profile; the derived index only matches the text. Content and
 * actual availability are read from the domain core. An object found in
 * several places is shown once, with each of them.
 */
export const searchObjects = defineQuery({
  name: "search.objects",
  input: objectSearchQuerySchema,
  policy: searchObjectsPolicy,
  rateLimit: rateLimits.lookups,
  load: ({ db, actor, input, now }) =>
    inSnapshot(db, async (tx) => {
      if (actor.kind !== "user") {
        return null;
      }

      const candidates = new Map<string, Candidate>();
      let more = false;
      const near = nearOf(input);
      const add = (
        rows: readonly (FoundRow & { rank: number | string | null })[],
        place: (row: FoundRow) => Candidate["foundIn"][number] | null,
      ) => {
        more ||= rows.length > candidatesPerEnvironment;

        for (const row of rows.slice(0, candidatesPerEnvironment)) {
          const known = candidates.get(row.object_id);
          const found = place(row);

          candidates.set(row.object_id, {
            objectId: row.object_id,
            title: row.title,
            row,
            rank: Math.max(known?.rank ?? 0, Number(row.rank ?? 0)),
            foundIn: [...(known?.foundIn ?? []), ...(found ? [found] : [])],
            throughFriends: (known?.throughFriends ?? false) || !found,
          });
        }
      };

      // One after another: the snapshot has a single connection.
      for (const environmentId of input.friends
        ? []
        : await activeEnvironmentsOf(
            tx,
            actor.userId,
            input.environmentId,
            near,
          )) {
        const access = await loadEnvironmentAccess(
          tx,
          environmentId,
          actor,
          now,
        );
        const discoverable =
          access && (await discoverableFor(tx, access, actor.userId, now));

        if (!access || !discoverable) {
          continue;
        }

        add(
          await selectFound(discoverable, actor.userId)
            .where(matchesSearch(input))
            .select(objectRank(input.q).as("rank"))
            .orderBy("rank", "desc")
            .orderBy("object.title")
            .orderBy("object.id")
            .limit(candidatesPerEnvironment + 1)
            .execute(),
          (row) => ({
            environmentId,
            environmentName: access.environment.name,
            publicationId: row.id,
          }),
        );
      }

      // Objects have no place of their own, so none is near an area.
      if (input.environmentId === undefined && near === undefined) {
        add(
          await selectFoundThroughFriends(
            discoverableThroughFriends(tx, actor.userId),
            actor.userId,
          )
            .where(matchesSearch(input))
            .select(objectRank(input.q).as("rank"))
            .orderBy("rank", "desc")
            .orderBy("object.title")
            .orderBy("object.id")
            .limit(candidatesPerEnvironment + 1)
            .execute(),
          () => null,
        );
      }

      const details = await loadFoundDetails(tx, [...candidates.keys()]);
      const matching = [...candidates.values()]
        .filter((candidate) =>
          availableThroughout(input, candidate.objectId, details, now),
        )
        .sort(relevance);
      const shown = matching.slice(0, searchResultLimit);
      const owners = await environmentOwners(
        tx,
        actor.userId,
        shown.flatMap((candidate) =>
          candidate.foundIn.map(({ environmentId }) => ({
            objectId: candidate.objectId,
            environmentId,
          })),
        ),
        now,
      );

      return {
        resource: {
          candidates: shown,
          more: more || matching.length > searchResultLimit,
          details,
          owners,
        },
        context: undefined,
      };
    }),
  present: ({ resource, now }): ObjectSearchResult => ({
    objects: resource.candidates.map((candidate) => ({
      ...presentFound(candidate.row, resource.details, now),
      foundIn: [...candidate.foundIn].sort((a, b) =>
        a.environmentName.localeCompare(b.environmentName, "nb"),
      ),
      foundThroughFriends: candidate.throughFriends,
      owners: [...(resource.owners.get(candidate.objectId) ?? [])],
    })),
    more: resource.more,
  }),
});

/**
 * Without a period, every found object; with one, only those actually
 * available every day of it, as a loan for that period would need
 * (PS-LOAN-004).
 */
function availableThroughout(
  input: ObjectSearchQuery,
  objectId: string,
  details: Parameters<typeof foundAvailability>[1],
  now: Date,
): boolean {
  if (input.availableFrom === undefined || input.availableTo === undefined) {
    return true;
  }

  return withinAvailability(
    { from: input.availableFrom, until: addDays(input.availableTo, 1) },
    foundAvailability(objectId, details, now).effective,
  );
}

/**
 * Open and closed environments that take new members (PS-ENV-001,
 * UX-JRN-002), with what anyone signed in may read of them. The derived
 * index never holds a hidden environment, and the environment's current
 * type and state are checked in the same query, so neither a hidden nor a
 * winding-down environment is ever found (PS-NFR-002), however stale the
 * index is. Near an area (WP-62), the indexed approximate areas that
 * overlap it, closest first among equally relevant ones.
 */
export const searchEnvironments = defineQuery({
  name: "search.environments",
  input: environmentSearchQuerySchema,
  policy: searchEnvironmentsPolicy,
  rateLimit: rateLimits.lookups,
  load: async ({ db, actor, input, now }) => {
    if (actor.kind !== "user") {
      return null;
    }

    const near = nearOf(input);
    const rows = await db
      .selectFrom("app.search_environments as entry")
      .innerJoin(
        "app.environments as environment",
        "environment.id",
        "entry.environment_id",
      )
      .leftJoin("app.environment_memberships as membership", (join) =>
        join
          .onRef("membership.environment_id", "=", "environment.id")
          .on("membership.user_id", "=", actor.userId)
          .on("membership.state", "<>", "ended"),
      )
      .select([
        "environment.id",
        "environment.type",
        "environment.name",
        "environment.description",
        "environment.location",
        "environment.area_latitude",
        "environment.area_longitude",
        "environment.area_radius_km",
        "membership.state",
        "membership.transition_deadline as transitionDeadline",
        rankBy(input.q).as("rank"),
        (near === undefined
          ? sql<number>`0`
          : sql<number>`app.geo_distance_km(
              entry.area_latitude, entry.area_longitude,
              ${near.latitude}, ${near.longitude}
            )`
        ).as("distance"),
      ])
      .where(
        "environment.type",
        "in",
        input.type ? [input.type] : ["open", "closed"],
      )
      // `acceptsNewActivity`: only an active environment takes new members.
      .where("environment.state", "=", "active")
      // PS-ENV-004: an environment that bars the caller is not theirs to find.
      .where(({ not, exists, selectFrom }) =>
        not(
          exists(
            selectFrom("app.environment_access_restrictions as restriction")
              .select("restriction.id")
              .whereRef("restriction.environment_id", "=", "environment.id")
              .where("restriction.user_id", "=", actor.userId)
              .where("restriction.lifted_at", "is", null),
          ),
        ),
      )
      .$if(input.q !== undefined, (query) =>
        query.where(
          sql<boolean>`entry.document @@ app.search_query(${input.q})`,
        ),
      )
      .$if(near !== undefined, (query) =>
        query.where(overlaps("entry", near as GeoArea)),
      )
      .orderBy("rank", "desc")
      .orderBy("distance")
      .orderBy("environment.name")
      .orderBy("environment.id")
      .limit(searchResultLimit + 1)
      .execute();
    const shown = rows.slice(0, searchResultLimit);
    const members = await loadApproximateMembers(
      db,
      shown.map((row) => row.id),
      now,
    );

    return {
      resource: { shown, members, more: rows.length > searchResultLimit },
      context: undefined,
    };
  },
  present: ({ resource, now }): EnvironmentSearchResult => ({
    environments: resource.shown.map((row) => ({
      id: row.id,
      type: row.type as "open" | "closed",
      name: row.name,
      description: row.description,
      location: row.location,
      area: toArea(row),
      members: resource.members.get(row.id) ?? approximateMembers(0),
      membershipState:
        row.state === null
          ? null
          : (effectiveState(
              {
                state: row.state as MembershipState,
                transitionDeadline: row.transitionDeadline,
              },
              now,
            ) as Exclude<MembershipState, "ended">),
    })),
    more: resource.more,
  }),
});
