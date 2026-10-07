import type { ProfilePictureVisibility } from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import { type Kysely, sql } from "kysely";
import type { OpenFriendship, SocialPair } from "../social/pair";
import type { ProfileAccessResource } from "../trust/policies";

type Db = Kysely<Database>;

/**
 * Everything that decides what a viewer may see of another person (WP-86):
 * the name, the social pair as the viewer sees it, and whether both are
 * active members of an environment now, and their profile picture with
 * who they let see it. `pair` is null for the viewer themselves.
 */
export interface PersonRelation {
  readonly viewerId: string;
  readonly userId: string;
  /** Null once the account is deleted (PS-ADM-006). */
  readonly realName: string | null;
  readonly pair: SocialPair | null;
  readonly shareEnvironment: boolean;
  /** The current profile picture, if any (PS-USR-002). */
  readonly picture: {
    readonly id: string;
    readonly visibility: ProfilePictureVisibility;
  } | null;
}

/** An active membership now, outside a lapsed transition (PS-ENV-006). */
const activeMember = (alias: string, now: Date) => sql<boolean>`(
  ${sql.ref(`${alias}.state`)} = 'active'
  and (${sql.ref(`${alias}.transition_deadline`)} is null
    or ${sql.ref(`${alias}.transition_deadline`)} > ${now})
)`;

/**
 * The people `userIds` as `viewerId` relates to them now, in one read. Ids
 * of accounts that do not exist are left out, which the caller turns into
 * the same `not_found` as for a person it may not see.
 */
export async function loadPeople(
  db: Db,
  viewerId: string,
  userIds: readonly string[],
  now: Date,
): Promise<Map<string, PersonRelation>> {
  const ids = [...new Set(userIds)];

  if (ids.length === 0) {
    return new Map();
  }

  const rows = await db
    .selectFrom("app.users as person")
    .leftJoin("app.profiles as profile", "profile.user_id", "person.id")
    .leftJoin("app.profile_pictures as picture", "picture.user_id", "person.id")
    .leftJoin("app.friendships as friendship", (join) =>
      join.on((eb) =>
        eb.and([
          eb("friendship.status", "<>", "ended"),
          eb(
            "friendship.user_low_id",
            "=",
            sql<string>`least(person.id, ${viewerId}::uuid)`,
          ),
          eb(
            "friendship.user_high_id",
            "=",
            sql<string>`greatest(person.id, ${viewerId}::uuid)`,
          ),
        ]),
      ),
    )
    .select([
      "person.id as userId",
      "person.status",
      "profile.real_name as realName",
      "profile.picture_visibility as pictureVisibility",
      "picture.id as pictureId",
      "friendship.id as friendshipId",
      "friendship.status as friendshipStatus",
      "friendship.requester_id as requesterId",
      sql<boolean>`exists (
        select 1 from app.user_blocks as block
        where block.lifted_at is null
          and block.blocker_id = ${viewerId}
          and block.blocked_id = person.id
      )`.as("blockedByViewer"),
      sql<boolean>`exists (
        select 1 from app.user_blocks as block
        where block.lifted_at is null
          and block.blocker_id = person.id
          and block.blocked_id = ${viewerId}
      )`.as("blockedByPerson"),
      sql<boolean>`exists (
        select 1
        from app.environment_memberships as own
        join app.environment_memberships as theirs
          on theirs.environment_id = own.environment_id
        where own.user_id = ${viewerId}
          and theirs.user_id = person.id
          and ${activeMember("own", now)}
          and ${activeMember("theirs", now)}
      )`.as("shareEnvironment"),
    ])
    .where("person.id", "in", ids)
    .execute();

  return new Map(
    rows.map((row) => [
      row.userId,
      {
        viewerId,
        userId: row.userId,
        realName: row.realName,
        pair:
          row.userId === viewerId
            ? null
            : {
                actorId: viewerId,
                otherUserId: row.userId,
                otherActive: row.status === "active",
                openFriendship:
                  row.friendshipId && row.requesterId
                    ? {
                        id: row.friendshipId,
                        status:
                          row.friendshipStatus as OpenFriendship["status"],
                        requesterId: row.requesterId,
                      }
                    : null,
                blockedByActor: row.blockedByViewer,
                blockedByOther: row.blockedByPerson,
              },
        shareEnvironment: row.shareEnvironment,
        picture:
          row.pictureId && row.pictureVisibility
            ? {
                id: row.pictureId,
                visibility: row.pictureVisibility as ProfilePictureVisibility,
              }
            : null,
      },
    ]),
  );
}

/** What decides the viewer's access to the person's profile. */
export function profileAccessOf(person: PersonRelation): ProfileAccessResource {
  const { pair } = person;

  return pair
    ? {
        subjectUserId: person.userId,
        subjectActive: pair.otherActive,
        friends: pair.openFriendship?.status === "active",
        shareEnvironment: person.shareEnvironment,
        blockedEitherWay: pair.blockedByActor || pair.blockedByOther,
      }
    : {
        subjectUserId: person.userId,
        subjectActive: true,
        friends: false,
        shareEnvironment: false,
        blockedEitherWay: false,
      };
}
