import type { LoanEndReason, LoanRequestRole } from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import { type Kysely, type RawBuilder, sql } from "kysely";
import { type LenderScope, madeWithinScope } from "../loans/store";
import { otherSide } from "../reviews/model";
import { reopenedAfter } from "../reviews/store";
import { loadPair } from "../social/pair";
import type { ScoreTally } from "./model";
import type { ProfileAccessResource } from "./policies";

/**
 * Database access for trust profiles (WP-51). Everything is read in one
 * snapshot and derived from the published reviews; nothing is stored.
 */
type Db = Kysely<Database>;

/**
 * The viewer's relation to the person whose profile they read, or null when
 * the person does not exist. `scope` is where the viewer is an active member
 * now.
 */
export async function loadProfileAccess(
  db: Db,
  viewerId: string,
  subjectUserId: string,
  scope: LenderScope,
  now: Date,
): Promise<ProfileAccessResource | null> {
  if (viewerId === subjectUserId) {
    return {
      subjectUserId,
      subjectActive: true,
      friends: false,
      shareEnvironment: false,
      blockedEitherWay: false,
    };
  }

  const pair = await loadPair(db, viewerId, subjectUserId);

  if (!pair) {
    return null;
  }

  const environmentIds = scope.environments.map(
    ({ environmentId }) => environmentId,
  );
  const shared =
    environmentIds.length > 0 &&
    (await db
      .selectFrom("app.environment_memberships")
      .select("id")
      .where("user_id", "=", subjectUserId)
      .where("environment_id", "in", environmentIds)
      .where("state", "=", "active")
      .where((eb) =>
        eb.or([
          eb("transition_deadline", "is", null),
          eb("transition_deadline", ">", now),
        ]),
      )
      .limit(1)
      .executeTakeFirst()) !== undefined;

  return {
    subjectUserId,
    subjectActive: pair.otherActive,
    friends: pair.openFriendship?.status === "active",
    shareEnvironment: shared,
    blockedEitherWay: pair.blockedByActor || pair.blockedByOther,
  };
}

/** SQL: when the review (aliased `review`, its window `period`) counts as published. */
const publishedAt = sql<Date>`coalesce(review.published_at, period.due_at)`;

/**
 * The reviews that stand as published reviews as of `now`: published, or
 * hidden in a window whose deadline has passed before the job recorded it
 * (PS-TRUST-003, as `loan_review.read` shows them). Hidden, paused and lapsed
 * reviews never count (PS-TRUST-003/008). Every read of a person's trust goes
 * through here, so WP-52 takes moderated reviews out in one place
 * (PS-TRUST-014).
 */
function publishedReviews(db: Db, subjectUserId: string, now: Date) {
  return db
    .selectFrom("app.loan_reviews as review")
    .innerJoin(
      "app.loan_review_periods as period",
      "period.loan_id",
      "review.loan_id",
    )
    .where("review.subject_user_id", "=", subjectUserId)
    .where((eb) =>
      eb.or([
        eb("review.status", "=", "published"),
        eb.and([
          eb("review.status", "=", "hidden"),
          eb("period.status", "=", "open"),
          eb("period.due_at", "<=", now),
        ]),
      ]),
    );
}

/** How many published reviews there are of the person, by reviewer side. */
export async function countReviews(
  db: Db,
  subjectUserId: string,
  now: Date,
): Promise<Record<LoanRequestRole, number>> {
  const rows = await publishedReviews(db, subjectUserId, now)
    .select(["review.author_role", (eb) => eb.fn.countAll<string>().as("n")])
    .groupBy("review.author_role")
    .execute();
  const counts = { borrower: 0, lender: 0 };

  for (const row of rows) {
    counts[row.author_role as LoanRequestRole] = Number(row.n);
  }

  return counts;
}

/**
 * Every published score about the person, counted by side, dimension, score
 * and whether the loan reopened after publication. Scores from every context
 * count, hidden environments included: a tally names no review, author or
 * environment (vision «Anmeldelser fra skjulte miljøer»).
 */
export async function loadScoreTallies(
  db: Db,
  subjectUserId: string,
  now: Date,
): Promise<ScoreTally[]> {
  const reopened = sql<boolean>`${reopenedAfter(
    sql.ref("review.loan_id"),
    publishedAt,
  )} is not null`;
  const rows = await publishedReviews(db, subjectUserId, now)
    .innerJoin(
      "app.loan_review_scores as score",
      "score.review_id",
      "review.id",
    )
    .innerJoin("app.review_dimensions as dimension", (join) =>
      join
        .onRef("dimension.reviewer_role", "=", "score.reviewer_role")
        .onRef("dimension.code", "=", "score.dimension"),
    )
    .select([
      "review.author_role",
      "score.dimension",
      "score.score",
      "dimension.rests_on_return",
      reopened.as("reopened"),
      (eb) => eb.fn.countAll<string>().as("n"),
    ])
    .groupBy([
      "review.author_role",
      "score.dimension",
      "score.score",
      "dimension.rests_on_return",
      reopened,
    ])
    .execute();

  return rows.map((row) => ({
    reviewerRole: row.author_role as LoanRequestRole,
    dimension: row.dimension,
    score: row.score,
    restsOnReturn: row.rests_on_return,
    reopened: row.reopened,
    count: Number(row.n),
  }));
}

/** The dimensions each side scores, in order. */
export async function loadDimensionCodes(
  db: Db,
): Promise<Record<LoanRequestRole, string[]>> {
  const rows = await db
    .selectFrom("app.review_dimensions")
    .select(["reviewer_role", "code"])
    .orderBy("reviewer_role")
    .orderBy("position")
    .execute();
  const codes: Record<LoanRequestRole, string[]> = {
    borrower: [],
    lender: [],
  };

  for (const row of rows) {
    codes[row.reviewer_role as LoanRequestRole].push(row.code);
  }

  return codes;
}

/**
 * SQL: the review's loan was made in a hidden context (its request is
 * aliased `request`), so its text, author and environment stay inside that
 * environment (PS-TRUST-007, scenario 22).
 */
const hiddenContext = sql<boolean>`(
  request.origin = 'environment'
  and app.environment_hidden_since(request.environment_id, request.position)
)`;

export interface ProfileReviewRow {
  readonly id: string;
  readonly reviewerRole: LoanRequestRole;
  readonly basis: LoanEndReason;
  readonly author: {
    readonly userId: string;
    readonly realName: string;
  } | null;
  readonly environment: { readonly id: string; readonly name: string } | null;
  readonly text: string | null;
  readonly publishedAt: Date;
  readonly reopenedAt: Date | null;
  readonly response: { readonly text: string; readonly at: Date } | null;
}

/**
 * One page of the published reviews about the person that the viewer may
 * read, newest first (PS-TRUST-007):
 * - the person reads every review about them;
 * - anyone else (who has profile access) reads a review unless it comes from
 *   a hidden context they are not part of: they must be an active member of
 *   that environment now, and not one who joined after it became less
 *   private (PS-ENV-009). Nothing marks what is left out;
 * - and never one whose author they block or are blocked by (PS-USR-006).
 * The environment is named only to readers who may see it. Access is current
 * access: what someone could read before follows them no further
 * (scenarios 43/44).
 */
export async function loadProfileReviews(
  db: Db,
  input: {
    readonly subjectUserId: string;
    readonly viewer: LenderScope;
    readonly role: LoanRequestRole | undefined;
    readonly cursor: string | undefined;
    readonly limit: number;
    readonly now: Date;
  },
): Promise<ProfileReviewRow[]> {
  const { viewer } = input;
  const self = viewer.userId === input.subjectUserId;
  const withinScope = madeWithinScope(viewer);
  const readable: RawBuilder<boolean> = self
    ? sql<boolean>`true`
    : sql<boolean>`(
        not app.users_blocked(review.author_user_id, ${viewer.userId})
        and (not ${hiddenContext} or ${withinScope})
      )`;
  const afterCursor =
    input.cursor === undefined
      ? sql<boolean>`true`
      : sql<boolean>`(${publishedAt}, review.id) < (
          select coalesce(cursor_review.published_at, cursor_period.due_at), cursor_review.id
          from app.loan_reviews as cursor_review
          join app.loan_review_periods as cursor_period
            on cursor_period.loan_id = cursor_review.loan_id
          where cursor_review.id = ${input.cursor}
        )`;
  const rows = await publishedReviews(db, input.subjectUserId, input.now)
    .innerJoin("app.loans as loan", "loan.id", "review.loan_id")
    .innerJoin("app.loan_requests as request", "request.id", "loan.request_id")
    .leftJoin(
      "app.environments as environment",
      "environment.id",
      "request.environment_id",
    )
    .leftJoin(
      "app.profiles as author",
      "author.user_id",
      "review.author_user_id",
    )
    .leftJoin(
      "app.loan_review_responses as response",
      "response.review_id",
      "review.id",
    )
    .select([
      "review.id",
      "review.author_role",
      "review.body",
      "period.basis",
      "author.user_id as author_user_id",
      "author.real_name as author_name",
      "environment.id as environment_id",
      "environment.name as environment_name",
      sql<boolean>`(not ${hiddenContext} or ${withinScope})`.as(
        "environment_visible",
      ),
      publishedAt.as("published_at"),
      reopenedAfter(sql.ref("review.loan_id"), publishedAt).as("reopened_at"),
      "response.body as response_body",
      "response.responded_at",
    ])
    .where(readable)
    .where(afterCursor)
    // The person's role in the loan: reviews by the other side.
    .where(
      "review.author_role",
      "in",
      input.role ? [otherSide(input.role)] : ["borrower", "lender"],
    )
    .orderBy(publishedAt, "desc")
    .orderBy("review.id", "desc")
    .limit(input.limit)
    .execute();

  return rows.map((row) => ({
    id: row.id,
    reviewerRole: row.author_role as LoanRequestRole,
    basis: row.basis as LoanEndReason,
    author:
      row.author_user_id === null || row.author_name === null
        ? null
        : { userId: row.author_user_id, realName: row.author_name },
    environment:
      row.environment_id === null ||
      row.environment_name === null ||
      !row.environment_visible
        ? null
        : { id: row.environment_id, name: row.environment_name },
    text: row.body,
    publishedAt: row.published_at,
    reopenedAt: row.reopened_at,
    response:
      row.response_body === null || row.responded_at === null
        ? null
        : { text: row.response_body, at: row.responded_at },
  }));
}
