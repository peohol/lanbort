import type {
  ModerationMeasure,
  ModerationMeasureKind,
  ModerationScope,
} from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import { type Kysely, sql } from "kysely";

/**
 * Database access for moderation (WP-52). The database guards who may take
 * which measure on which report, and checks at commit that each measure has
 * its effect; the domain reads the same rules rather than restating them.
 */
type Db = Kysely<Database>;

export async function insertMeasure(
  db: Db,
  values: {
    readonly caseId: string;
    readonly kind: ModerationMeasureKind;
    readonly scope: ModerationScope;
    readonly environmentId: string | null;
    readonly objectId: string | null;
    readonly reviewId: string | null;
    readonly dimension: string | null;
    readonly reason: string;
    readonly decidedByUserId: string;
    readonly removedText: string | null;
    readonly removedScore: number | null;
    readonly now: Date;
  },
): Promise<string> {
  const { id } = await db
    .insertInto("app.moderation_actions")
    .values({
      case_id: values.caseId,
      kind: values.kind,
      scope: values.scope,
      environment_id: values.environmentId,
      object_id: values.objectId,
      review_id: values.reviewId,
      dimension: values.dimension,
      reason: values.reason,
      decided_by_user_id: values.decidedByUserId,
      decided_at: values.now,
      removed_text: values.removedText,
      removed_score: values.removedScore,
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  return id;
}

/** The measures taken on the case, oldest first. */
export async function loadMeasures(
  db: Db,
  caseId: string,
): Promise<ModerationMeasure[]> {
  const rows = await db
    .selectFrom("app.moderation_actions")
    .selectAll()
    .where("case_id", "=", caseId)
    .orderBy("position")
    .execute();

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind as ModerationMeasureKind,
    scope: row.scope as ModerationScope,
    environmentId: row.environment_id,
    objectId: row.object_id,
    reviewId: row.review_id,
    dimension: row.dimension,
    reason: row.reason,
    decidedByUserId: row.decided_by_user_id,
    decidedAt: row.decided_at.toISOString(),
    removedText: row.removed_text,
    removedScore: row.removed_score,
  }));
}

/** The objects a steward's block keeps from new loans now. */
export async function platformBlockedObjects(
  db: Db,
  objectIds: readonly string[],
): Promise<string[]> {
  if (objectIds.length === 0) {
    return [];
  }

  const { rows } = await sql<{ id: string }>`
    select id from unnest(${objectIds}::uuid[]) as id
    where app.object_platform_blocked(id)
  `.execute(db);

  return rows.map((row) => row.id);
}

/** SQL: the object (an id expression) is blocked by a steward now. */
export const platformBlocked = (objectId: unknown) =>
  sql<boolean>`app.object_platform_blocked(${objectId})`;

/**
 * Whether `userId` may report `otherUserId` to the platform: a current
 * relation, a friendship they once had, or a friend request from the other
 * (`app.users_report_context`). A block takes none of it away, and none of it
 * can be made by the reporter alone, so no guessed id is ever confirmed.
 */
export async function reportContext(
  db: Db,
  userId: string,
  otherUserId: string,
): Promise<boolean> {
  const { rows } = await sql<{ context: boolean }>`
    select app.users_report_context(${userId}, ${otherUserId}) as context
  `.execute(db);

  return rows[0]?.context ?? false;
}

/**
 * Whether `userId`, not an owner, has met the object: published where they
 * are an active member, owned by someone who is or was a friend, or asked for
 * (`app.object_met_by`).
 */
export async function objectMetBy(
  db: Db,
  objectId: string,
  userId: string,
): Promise<boolean> {
  const { rows } = await sql<{ met: boolean }>`
    select app.object_met_by(${objectId}, ${userId})
      and not exists (
        select 1 from app.object_owners
        where object_id = ${objectId} and user_id = ${userId}
      ) as met
  `.execute(db);

  return rows[0]?.met ?? false;
}

/** Whether the user has a current (active or passive) membership there. */
export async function hasCurrentMembership(
  db: Db,
  environmentId: string,
  userId: string,
): Promise<boolean> {
  const row = await db
    .selectFrom("app.environment_memberships")
    .select("id")
    .where("environment_id", "=", environmentId)
    .where("user_id", "=", userId)
    .where("state", "in", ["active", "passive"])
    .executeTakeFirst();

  return row !== undefined;
}

/** A review as a report or a measure needs it, with its response. */
export interface ReportedReview {
  readonly id: string;
  readonly loanId: string;
  readonly authorUserId: string;
  readonly subjectUserId: string;
  readonly status: string;
  readonly body: string | null;
  readonly response: {
    readonly authorUserId: string;
    readonly body: string | null;
  } | null;
}

export async function findReportedReview(
  db: Db,
  reviewId: string,
  options: { lock?: boolean } = {},
): Promise<ReportedReview | null> {
  let query = db
    .selectFrom("app.loan_reviews as review")
    .leftJoin(
      "app.loan_review_responses as response",
      "response.review_id",
      "review.id",
    )
    .select([
      "review.id",
      "review.loan_id",
      "review.author_user_id",
      "review.subject_user_id",
      "review.status",
      "review.body",
      "response.author_user_id as response_author_user_id",
      "response.body as response_body",
    ])
    .where("review.id", "=", reviewId);

  if (options.lock) {
    query = query.forUpdate("review");
  }

  const row = await query.executeTakeFirst();

  return row
    ? {
        id: row.id,
        loanId: row.loan_id,
        authorUserId: row.author_user_id,
        subjectUserId: row.subject_user_id,
        status: row.status,
        body: row.body,
        response:
          row.response_author_user_id === null
            ? null
            : {
                authorUserId: row.response_author_user_id,
                body: row.response_body,
              },
      }
    : null;
}

/** The review's score on `dimension`, if it has one. */
export async function findScore(
  db: Db,
  reviewId: string,
  dimension: string,
): Promise<number | null> {
  const row = await db
    .selectFrom("app.loan_review_scores")
    .select("score")
    .where("review_id", "=", reviewId)
    .where("dimension", "=", dimension)
    .executeTakeFirst();

  return row?.score ?? null;
}

/** Moderation's effects on a published review and its response. */
export const reviewEffects = {
  remove: (db: Db, reviewId: string) =>
    db
      .updateTable("app.loan_reviews")
      .set({ status: "removed" })
      .where("id", "=", reviewId)
      .execute(),
  removeText: (db: Db, reviewId: string) =>
    db
      .updateTable("app.loan_reviews")
      .set({ body: null })
      .where("id", "=", reviewId)
      .execute(),
  removeScore: (db: Db, reviewId: string, dimension: string) =>
    db
      .deleteFrom("app.loan_review_scores")
      .where("review_id", "=", reviewId)
      .where("dimension", "=", dimension)
      .execute(),
  removeResponseText: (db: Db, reviewId: string) =>
    db
      .updateTable("app.loan_review_responses")
      .set({ body: null })
      .where("review_id", "=", reviewId)
      .execute(),
};

/** Serializes one reporter's reports, so a second writes into the first. */
export async function lockReporter(db: Db, userId: string): Promise<void> {
  const key = `moderation_report:${userId}`;

  await sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`.execute(
    db,
  );
}
