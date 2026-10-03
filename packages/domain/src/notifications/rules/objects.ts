import {
  objectQuestionAsked,
  objectQuestionReplied,
} from "../../questions/events";
import {
  blockedEitherWay,
  loadQuestion,
  seesQuestion,
} from "../../questions/store";
import { holdFinding } from "../../publications/store";
import { type Db, notifyOn, type RuleInput, tell } from "../rule";

const questionTarget = (id: string) =>
  ({ type: "object_question", id }) as const;

/**
 * Of `userIds`, those who see the question now, in order. What that rests on
 * is held first, together with the blocks between them and `others` (the
 * asker, the poster), so access lost at the same time is either seen here or
 * lost only after the notifications exist (the generator's transaction).
 */
async function seeing(
  db: Db,
  question: NonNullable<Awaited<ReturnType<typeof loadQuestion>>>,
  userIds: Iterable<string>,
  others: readonly string[],
  now: Date,
) {
  const candidates = [...new Set(userIds)];
  const kept: string[] = [];

  await holdFinding(
    db,
    candidates.map((userId) => ({ userId, objectId: question.objectId })),
    candidates.flatMap((userId) =>
      others.map((other) => [userId, other] as const),
    ),
  );

  for (const userId of candidates) {
    if (await seesQuestion(db, question, userId, now)) {
      kept.push(userId);
    }
  }

  return kept;
}

/**
 * PS-OBJ-015: a new question tells the owners who find the object in that
 * environment, so an owner without access there learns nothing about it.
 */
async function questionAsked({ db, event, now }: RuleInput<unknown>) {
  const question = await loadQuestion(db, event.resourceId);

  if (!question) {
    return [];
  }

  const owners = await db
    .selectFrom("app.object_owners")
    .select("user_id")
    .where("object_id", "=", question.objectId)
    .execute();

  return tell(
    await seeing(
      db,
      question,
      owners.map((owner) => owner.user_id),
      [question.askedByUserId],
      now,
    ),
    "object.question_asked",
    questionTarget(question.id),
  );
}

/**
 * A post tells the others in the thread (who asked, and who posted before)
 * while they still see it, and never someone the poster has blocked or is
 * blocked by, since they do not see the post either.
 */
async function questionReplied({
  db,
  event,
  payload,
  now,
}: RuleInput<{ postId: string }>) {
  const question = await loadQuestion(db, event.resourceId);
  const post = await db
    .selectFrom("app.object_question_posts")
    .select(["author_user_id", "position"])
    .where("id", "=", payload.postId)
    .executeTakeFirst();

  if (!question || !post) {
    return [];
  }

  const earlier = await db
    .selectFrom("app.object_question_posts")
    .select("author_user_id")
    .where("question_id", "=", question.id)
    .where("position", "<", post.position)
    .execute();
  const recipients: string[] = [];

  for (const userId of await seeing(
    db,
    question,
    [question.askedByUserId, ...earlier.map((row) => row.author_user_id)],
    [question.askedByUserId, post.author_user_id],
    now,
  )) {
    if (!(await blockedEitherWay(db, userId, post.author_user_id))) {
      recipients.push(userId);
    }
  }

  return tell(
    recipients,
    "object.question_replied",
    questionTarget(question.id),
  );
}

export const objectRules = [
  notifyOn(objectQuestionAsked, questionAsked),
  notifyOn(objectQuestionReplied, questionReplied),
];
