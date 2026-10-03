import type { ObjectChangeField } from "@lanbort/contracts";
import {
  objectImageAdded,
  objectImageRemoved,
  objectReverted,
  objectUpdated,
} from "../../objects/events";
import {
  objectQuestionAsked,
  objectQuestionReplied,
} from "../../questions/events";
import {
  blockedEitherWay,
  loadQuestion,
  seesQuestion,
} from "../../questions/store";
import { tellSubscribers, withAccess } from "../../subscriptions/store";
import { type Db, notifyOn, type RuleInput, tell } from "../rule";

const questionTarget = (id: string) =>
  ({ type: "object_question", id }) as const;

/** Of `userIds`, those who see the question now, in order. */
async function seeing(
  db: Db,
  question: NonNullable<Awaited<ReturnType<typeof loadQuestion>>>,
  userIds: Iterable<string>,
  now: Date,
) {
  const kept: string[] = [];

  for (const userId of new Set(userIds)) {
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

/** Fields whose change is told to subscribers; availability tells itself. */
const contentChanged = (fields: readonly ObjectChangeField[]) =>
  fields.some((field) => field !== "availability");

/**
 * Vision 06, «Informasjonsvarsler»: subscribers who still find the object
 * learn that its content changed (PS-OBJ-014). Until they have read that,
 * further edits add nothing, so a run of edits is one notification.
 */
async function objectChanged({ db, event, now }: RuleInput<unknown>) {
  const subscriptions = await db
    .selectFrom("app.object_subscriptions")
    .select(["id", "user_id", "object_id"])
    .where("object_id", "=", event.resourceId)
    .where(({ not, exists, selectFrom }) =>
      not(
        exists(
          selectFrom("app.notifications")
            .select("app.notifications.id")
            .whereRef(
              "app.notifications.recipient_id",
              "=",
              "app.object_subscriptions.user_id",
            )
            .whereRef(
              "app.notifications.target_id",
              "=",
              "app.object_subscriptions.id",
            )
            .where("app.notifications.kind", "=", "object.changed")
            .where("app.notifications.read_at", "is", null),
        ),
      ),
    )
    .execute();

  return tellSubscribers(
    await withAccess(db, subscriptions, now),
    "object.changed",
  );
}

export const objectRules = [
  notifyOn(objectQuestionAsked, questionAsked),
  notifyOn(objectQuestionReplied, questionReplied),
  notifyOn(objectUpdated, (input) =>
    contentChanged(input.payload.changedFields) ? objectChanged(input) : [],
  ),
  notifyOn(objectReverted, (input) =>
    contentChanged(input.payload.changedFields) ? objectChanged(input) : [],
  ),
  notifyOn(objectImageAdded, objectChanged),
  notifyOn(objectImageRemoved, objectChanged),
];
