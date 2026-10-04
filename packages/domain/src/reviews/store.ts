import type { LoanEndReason, LoanRequestRole } from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import { type Expression, type Kysely, type RawBuilder, sql } from "kysely";
import type {
  ReviewDimension,
  ReviewScore,
  ReviewWindowRecord,
  StoredReviewWindowStatus,
} from "./model";

/**
 * Database access for reviews (WP-50). Commands lock the loan's object and
 * the loan first, like every loan command, then the review window, then
 * its reviews; the publication job locks only windows, skipping those held.
 */
type Db = Kysely<Database>;

const windowColumns = [
  "loan_id",
  "borrower_user_id",
  "lender_user_id",
  "basis",
  "opened_at",
  "due_at",
  "status",
  "closed_at",
] as const;

function toWindow(row: {
  loan_id: string;
  borrower_user_id: string;
  lender_user_id: string;
  basis: string;
  opened_at: Date;
  due_at: Date | null;
  status: string;
  closed_at: Date | null;
}): ReviewWindowRecord {
  return {
    loanId: row.loan_id,
    borrowerUserId: row.borrower_user_id,
    lenderUserId: row.lender_user_id,
    basis: row.basis as LoanEndReason,
    openedAt: row.opened_at,
    dueAt: row.due_at,
    status: row.status as StoredReviewWindowStatus,
    closedAt: row.closed_at,
  };
}

/** The loan's review window, or null before the loan has ended. */
export async function findReviewWindow(
  db: Db,
  loanId: string,
  options: { lock?: boolean } = {},
): Promise<ReviewWindowRecord | null> {
  let query = db
    .selectFrom("app.loan_review_periods")
    .select(windowColumns)
    .where("loan_id", "=", loanId);

  if (options.lock) {
    query = query.forUpdate();
  }

  const row = await query.executeTakeFirst();

  return row ? toWindow(row) : null;
}

/** The dimensions `role` scores after a loan that ended as `basis`, in order. */
export async function loadDimensions(
  db: Db,
  role: LoanRequestRole,
  basis: LoanEndReason,
): Promise<ReviewDimension[]> {
  const rows = await db
    .selectFrom("app.review_dimensions")
    .select(["code", "rests_on_return"])
    .where("reviewer_role", "=", role)
    .where(sql<boolean>`${basis} = any(endings)`)
    .orderBy("position")
    .execute();

  return rows.map((row) => ({
    code: row.code,
    restsOnReturn: row.rests_on_return,
  }));
}

export interface ReviewRecord {
  readonly id: string;
  readonly loanId: string;
  readonly authorRole: LoanRequestRole;
  readonly authorUserId: string;
  readonly subjectUserId: string;
  readonly text: string | null;
  readonly version: number;
  readonly submittedAt: Date;
  readonly updatedAt: Date;
  readonly status: "hidden" | "published";
  readonly publishedAt: Date | null;
  /** In the dimensions' order. */
  readonly scores: readonly ReviewScore[];
  readonly response: { readonly text: string; readonly at: Date } | null;
}

/**
 * The loan's reviews that stand (not lapsed), with their scores and
 * response. With `lock`, the review rows are locked after the window.
 */
export async function findReviews(
  db: Db,
  loanId: string,
  options: { lock?: boolean } = {},
): Promise<ReviewRecord[]> {
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
      "review.author_role",
      "review.author_user_id",
      "review.subject_user_id",
      "review.body",
      "review.version",
      "review.submitted_at",
      "review.updated_at",
      "review.status",
      "review.published_at",
      "response.body as response_body",
      "response.responded_at",
    ])
    .where("review.loan_id", "=", loanId)
    .where("review.status", "<>", "lapsed")
    .orderBy("review.author_role");

  if (options.lock) {
    query = query.forUpdate("review");
  }

  const rows = await query.execute();
  const scores = await loadReviewScores(
    db,
    rows.map((row) => row.id),
  );

  return rows.map((row) => ({
    id: row.id,
    loanId: row.loan_id,
    authorRole: row.author_role as LoanRequestRole,
    authorUserId: row.author_user_id,
    subjectUserId: row.subject_user_id,
    text: row.body,
    version: row.version,
    submittedAt: row.submitted_at,
    updatedAt: row.updated_at,
    status: row.status as ReviewRecord["status"],
    publishedAt: row.published_at,
    scores: (scores.get(row.id) ?? []).map(({ dimension, score }) => ({
      dimension,
      score,
    })),
    response:
      row.response_body === null || row.responded_at === null
        ? null
        : { text: row.response_body, at: row.responded_at },
  }));
}

async function insertScores(
  db: Db,
  reviewId: string,
  role: LoanRequestRole,
  scores: readonly ReviewScore[],
): Promise<void> {
  await db
    .insertInto("app.loan_review_scores")
    .values(
      scores.map(({ dimension, score }) => ({
        review_id: reviewId,
        reviewer_role: role,
        dimension,
        score,
      })),
    )
    .execute();
}

/** A new hidden review with its scores; the database checks it at commit. */
export async function insertReview(
  db: Db,
  input: {
    readonly loanId: string;
    readonly role: LoanRequestRole;
    readonly authorUserId: string;
    readonly subjectUserId: string;
    readonly text: string | null;
    readonly scores: readonly ReviewScore[];
    readonly now: Date;
  },
): Promise<string> {
  const review = await db
    .insertInto("app.loan_reviews")
    .values({
      loan_id: input.loanId,
      author_role: input.role,
      author_user_id: input.authorUserId,
      subject_user_id: input.subjectUserId,
      body: input.text,
      submitted_at: input.now,
      updated_at: input.now,
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  await insertScores(db, review.id, input.role, input.scores);

  return review.id;
}

/** The hidden review's next version: new text and scores. */
export async function reviseReview(
  db: Db,
  input: {
    readonly review: ReviewRecord;
    readonly text: string | null;
    readonly scores: readonly ReviewScore[];
    readonly now: Date;
  },
): Promise<number> {
  const { review } = input;
  const version = review.version + 1;

  await db
    .updateTable("app.loan_reviews")
    .set({ body: input.text, version, updated_at: input.now })
    .where("id", "=", review.id)
    .execute();
  await db
    .deleteFrom("app.loan_review_scores")
    .where("review_id", "=", review.id)
    .execute();
  await insertScores(db, review.id, review.authorRole, input.scores);

  return version;
}

/**
 * Closes the open window as of `at`, which publishes its hidden reviews at
 * that moment (database trigger).
 */
export async function closeReviewWindow(
  db: Db,
  input: {
    readonly loanId: string;
    readonly as: "both_submitted" | "deadline";
    readonly at: Date;
  },
): Promise<void> {
  const closed = await db
    .updateTable("app.loan_review_periods")
    .set({ status: "closed", closed_at: input.at, closed_as: input.as })
    .where("loan_id", "=", input.loanId)
    .where("status", "=", "open")
    .executeTakeFirst();

  if (closed.numUpdatedRows !== 1n) {
    throw new Error("Only an open review window closes");
  }
}

export async function insertResponse(
  db: Db,
  input: {
    readonly reviewId: string;
    readonly authorUserId: string;
    readonly text: string;
    readonly now: Date;
  },
): Promise<void> {
  await db
    .insertInto("app.loan_review_responses")
    .values({
      review_id: input.reviewId,
      author_user_id: input.authorUserId,
      body: input.text,
      responded_at: input.now,
    })
    .execute();
}

/**
 * Open windows whose time is over, oldest first, locked; windows another run
 * or a command holds are skipped until the next run.
 */
export async function lockDueReviewWindows(
  db: Db,
  now: Date,
  limit: number,
): Promise<ReviewWindowRecord[]> {
  const rows = await db
    .selectFrom("app.loan_review_periods")
    .select(windowColumns)
    .where("status", "=", "open")
    .where("due_at", "<=", now)
    .orderBy("due_at")
    .limit(limit)
    .forUpdate()
    .skipLocked()
    .execute();

  return rows.map(toWindow);
}

/** A score with whether its dimension rests on the return. */
export interface StoredScore extends ReviewScore {
  readonly restsOnReturn: boolean;
}

/** The scores of the reviews, by review, each in the dimensions' order. */
export async function loadReviewScores(
  db: Db,
  reviewIds: readonly string[],
): Promise<Map<string, StoredScore[]>> {
  const scores = new Map<string, StoredScore[]>();

  if (reviewIds.length === 0) {
    return scores;
  }

  const rows = await db
    .selectFrom("app.loan_review_scores as score")
    .innerJoin("app.review_dimensions as dimension", (join) =>
      join
        .onRef("dimension.reviewer_role", "=", "score.reviewer_role")
        .onRef("dimension.code", "=", "score.dimension"),
    )
    .select([
      "score.review_id",
      "score.dimension",
      "score.score",
      "dimension.rests_on_return",
    ])
    .where("score.review_id", "in", [...reviewIds])
    .orderBy("dimension.position")
    .execute();

  for (const row of rows) {
    const review = scores.get(row.review_id) ?? [];
    review.push({
      dimension: row.dimension,
      score: row.score,
      restsOnReturn: row.rests_on_return,
    });
    scores.set(row.review_id, review);
  }

  return scores;
}

/**
 * SQL, PS-TRUST-008: when a confirmed return of the loan was first
 * contradicted after `since` (a reopening), or null if it was not.
 */
export function reopenedAfter(
  loanId: Expression<string>,
  since: Expression<Date | null>,
): RawBuilder<Date | null> {
  return sql<Date | null>`(
    select min(report.reported_at)
    from app.loan_return_reports as report
    where report.loan_id = ${loanId}
      and report.outcome in ('still_has', 'not_received')
      and report.reported_at > ${since}
  )`;
}

export async function reopenedSince(
  db: Db,
  loanId: string,
  since: Date,
): Promise<Date | null> {
  const row = await db
    .selectNoFrom(reopenedAfter(sql.val(loanId), sql.val(since)).as("at"))
    .executeTakeFirst();

  return row?.at ?? null;
}
