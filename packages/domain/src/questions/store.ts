import type { ObjectQuestion } from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import { type Kysely, sql } from "kysely";
import { loadUserAccess } from "../environment/store";
import { findPublications } from "../publications/queries";

type Db = Kysely<Database>;

export interface QuestionRecord {
  readonly id: string;
  readonly publicationId: string;
  readonly objectId: string;
  readonly environmentId: string;
  readonly askedByUserId: string;
  readonly createdAt: Date;
}

const questionColumns = [
  "id",
  "publication_id",
  "object_id",
  "environment_id",
  "asked_by_user_id",
  "created_at",
] as const;

function toRecord(row: {
  id: string;
  publication_id: string;
  object_id: string;
  environment_id: string;
  asked_by_user_id: string;
  created_at: Date;
}): QuestionRecord {
  return {
    id: row.id,
    publicationId: row.publication_id,
    objectId: row.object_id,
    environmentId: row.environment_id,
    askedByUserId: row.asked_by_user_id,
    createdAt: row.created_at,
  };
}

export async function loadQuestion(
  db: Db,
  questionId: string,
): Promise<QuestionRecord | null> {
  const row = await db
    .selectFrom("app.object_questions")
    .select(questionColumns)
    .where("id", "=", questionId)
    .executeTakeFirst();

  return row ? toRecord(row) : null;
}

/**
 * The publication through which the user finds the object in the
 * environment now, or null: the one place questions about it are asked and
 * read (PS-OBJ-015).
 */
export async function publicationFoundBy(
  db: Db,
  environmentId: string,
  objectId: string,
  userId: string,
  now: Date,
): Promise<string | null> {
  const access = await loadUserAccess(db, environmentId, userId, now);

  return access
    ? ((await findPublications(db, access, [objectId], userId, now)).get(
        objectId,
      ) ?? null)
    : null;
}

/**
 * Locks the publication a post would go through, for share, before anything
 * is decided: a publication ending at the same time then either waits for
 * the post or has ended before the caller's access is read, so the caller is
 * answered `not_found` rather than running into the database's backstop.
 */
export async function lockPublication(
  tx: Db,
  where:
    { publicationId: string } | { environmentId: string; objectId: string },
): Promise<void> {
  let query = tx.selectFrom("app.environment_publications").select("id");

  query =
    "publicationId" in where
      ? query.where("id", "=", where.publicationId)
      : query
          .where("environment_id", "=", where.environmentId)
          .where("object_id", "=", where.objectId)
          .where("status", "<>", "unpublished");

  await query.forShare().execute();
}

/** Either of the two has blocked the other (PS-USR-006). */
export async function blockedEitherWay(
  db: Db,
  a: string,
  b: string,
): Promise<boolean> {
  if (a === b) {
    return false;
  }

  const { blocked } = await sql<{
    blocked: boolean;
  }>`select app.users_blocked(${a}::uuid, ${b}::uuid) as blocked`
    .execute(db)
    .then((result) => result.rows[0]!);

  return blocked;
}

/**
 * Whether the user sees the question now: they find the object through the
 * very publication it was asked in, so a question never reaches another
 * environment, an ended publication or a later one (PS-OBJ-015); and they
 * and the asker have not blocked each other (PS-USR-006).
 */
export async function seesQuestion(
  db: Db,
  question: QuestionRecord,
  userId: string,
  now: Date,
): Promise<boolean> {
  return (
    (await publicationFoundBy(
      db,
      question.environmentId,
      question.objectId,
      userId,
      now,
    )) === question.publicationId &&
    !(await blockedEitherWay(db, question.askedByUserId, userId))
  );
}

/** Rows written by someone the viewer has blocked or is blocked by are left out. */
const notBlockedWith = (column: string, viewerId: string) =>
  sql<boolean>`not app.users_blocked(${sql.ref(column)}, ${viewerId}::uuid)`;

/**
 * One page of the publication's questions as the viewer sees them, newest
 * first, and whether there are more.
 */
export async function listQuestions(
  db: Db,
  publicationId: string,
  viewerId: string,
  page: { cursor: string | undefined; size: number },
) {
  const rows = await db
    .selectFrom("app.object_questions")
    .select(questionColumns)
    .where("publication_id", "=", publicationId)
    .where(notBlockedWith("asked_by_user_id", viewerId))
    .where(
      page.cursor === undefined
        ? sql<boolean>`true`
        : sql<boolean>`(created_at, id) < (
            select created_at, id from app.object_questions
            where id = ${page.cursor} and publication_id = ${publicationId}
          )`,
    )
    .orderBy("created_at", "desc")
    .orderBy("id", "desc")
    .limit(page.size + 1)
    .execute();

  return {
    questions: rows.slice(0, page.size).map(toRecord),
    more: rows.length > page.size,
  };
}

export interface PostRecord {
  readonly id: string;
  readonly questionId: string;
  readonly authorUserId: string;
  readonly byOwner: boolean;
  readonly body: string;
  readonly createdAt: Date;
}

/** The posts of each question the viewer may read, oldest first. */
export async function loadPosts(
  db: Db,
  questionIds: readonly string[],
  viewerId: string,
): Promise<PostRecord[]> {
  if (questionIds.length === 0) {
    return [];
  }

  const rows = await db
    .selectFrom("app.object_question_posts")
    .select([
      "id",
      "question_id",
      "author_user_id",
      "by_owner",
      "body",
      "created_at",
    ])
    .where("question_id", "in", [...questionIds])
    .where(notBlockedWith("author_user_id", viewerId))
    .orderBy("position")
    .execute();

  return rows.map((row) => ({
    id: row.id,
    questionId: row.question_id,
    authorUserId: row.author_user_id,
    byOwner: row.by_owner,
    body: row.body,
    createdAt: row.created_at,
  }));
}

export function presentQuestion(
  question: QuestionRecord,
  posts: readonly PostRecord[],
): ObjectQuestion {
  return {
    id: question.id,
    publicationId: question.publicationId,
    objectId: question.objectId,
    askedByUserId: question.askedByUserId,
    createdAt: question.createdAt.toISOString(),
    posts: posts
      .filter((post) => post.questionId === question.id)
      .map((post) => ({
        id: post.id,
        authorUserId: post.authorUserId,
        byOwner: post.byOwner,
        body: post.body,
        createdAt: post.createdAt.toISOString(),
      })),
  };
}

/**
 * Adds a post as `authorId`, saying whether they own the object now. The
 * database refuses it once the question's publication is no longer active.
 */
export async function addPost(
  db: Db,
  question: Pick<QuestionRecord, "id" | "objectId">,
  authorId: string,
  body: string,
): Promise<string> {
  const { id } = await db
    .insertInto("app.object_question_posts")
    .values({
      question_id: question.id,
      author_user_id: authorId,
      body,
      by_owner: sql<boolean>`exists (
        select 1 from app.object_owners
        where object_id = ${question.objectId} and user_id = ${authorId}
      )`,
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  return id;
}
