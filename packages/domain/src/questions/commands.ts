import {
  askObjectQuestionSchema,
  objectQuestionPostedSchema,
  replyToObjectQuestionSchema,
} from "@lanbort/contracts";
import { defineCommand } from "../commands/command";
import { actingUserId } from "../objects/state";
import { objectQuestionAsked, objectQuestionReplied } from "./events";
import {
  askObjectQuestionPolicy,
  replyToObjectQuestionPolicy,
} from "./policies";
import {
  addPost,
  loadQuestion,
  lockPublication,
  publicationFoundBy,
  seesQuestion,
} from "./store";

/**
 * PS-OBJ-015: asks about an object the caller finds in the environment. The
 * question belongs to the publication they found it through, and so stays
 * in this environment and with this publication.
 */
export const askObjectQuestion = defineCommand({
  name: "object_question.ask",
  input: askObjectQuestionSchema,
  output: objectQuestionPostedSchema,
  policy: askObjectQuestionPolicy,
  idempotency: "required",
  load: async ({ tx, actor, input, now }) => {
    await lockPublication(tx, input);
    const publicationId = await publicationFoundBy(
      tx,
      input.environmentId,
      input.objectId,
      actingUserId(actor),
      now,
    );

    return {
      resource: { visible: publicationId !== null, publicationId },
      context: undefined,
    };
  },
  execute: async ({ tx, actor, input, resource, events }) => {
    const userId = actingUserId(actor);
    const publicationId = resource.publicationId!;
    const { id: questionId } = await tx
      .insertInto("app.object_questions")
      .values({
        publication_id: publicationId,
        object_id: input.objectId,
        environment_id: input.environmentId,
        asked_by_user_id: userId,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    const postId = await addPost(
      tx,
      { id: questionId, objectId: input.objectId },
      userId,
      input.body,
    );

    events.record(objectQuestionAsked, {
      resourceId: questionId,
      payload: { publicationId, postId },
    });

    return { questionId, postId };
  },
});

/**
 * Answers or adds to a question the caller sees: the owners answer, and
 * other members may join the discussion in the same environment.
 */
export const replyToObjectQuestion = defineCommand({
  name: "object_question.reply",
  input: replyToObjectQuestionSchema,
  output: objectQuestionPostedSchema,
  policy: replyToObjectQuestionPolicy,
  idempotency: "required",
  load: async ({ tx, actor, input, now }) => {
    const question = await loadQuestion(tx, input.questionId);

    if (!question) {
      return null;
    }

    await lockPublication(tx, question);

    return {
      resource: {
        visible: await seesQuestion(tx, question, actingUserId(actor), now),
        question,
      },
      context: undefined,
    };
  },
  execute: async ({ tx, actor, input, resource: { question }, events }) => {
    const postId = await addPost(tx, question, actingUserId(actor), input.body);

    events.record(objectQuestionReplied, {
      resourceId: question.id,
      payload: { postId },
    });

    return { questionId: question.id, postId };
  },
});
