import {
  type ObjectQuestion,
  type ObjectQuestionList,
  objectQuestionPageSize,
  objectQuestionQuerySchema,
  objectQuestionsQuerySchema,
} from "@lanbort/contracts";
import { defineQuery } from "../commands/query";
import { actingUserId, inSnapshot } from "../objects/state";
import {
  listObjectQuestionsPolicy,
  readObjectQuestionPolicy,
} from "./policies";
import {
  listQuestions,
  loadPosts,
  loadQuestion,
  presentQuestion,
  publicationFoundBy,
  seesQuestion,
} from "./store";

/**
 * PS-OBJ-015: the questions about an object in one environment, newest
 * first, for those who find the object there. Only the questions of the
 * publication they find it through are shown: never those of another
 * environment, and never those of an earlier publication in this one.
 * Questions and posts by someone the caller has blocked, or is blocked by,
 * are left out (PS-USR-006).
 */
export const listObjectQuestions = defineQuery({
  name: "object_question.list",
  input: objectQuestionsQuerySchema,
  policy: listObjectQuestionsPolicy,
  load: ({ db, actor, input, now }) =>
    inSnapshot(db, async (tx) => {
      const viewerId = actingUserId(actor);
      const publicationId = await publicationFoundBy(
        tx,
        input.environmentId,
        input.objectId,
        viewerId,
        now,
      );
      const page =
        publicationId === null
          ? { questions: [], more: false }
          : await listQuestions(tx, publicationId, viewerId, {
              cursor: input.cursor,
              size: objectQuestionPageSize,
            });
      const posts = await loadPosts(
        tx,
        page.questions.map((question) => question.id),
        viewerId,
      );

      return {
        resource: { visible: publicationId !== null, ...page, posts },
        context: undefined,
      };
    }),
  present: ({ resource }): ObjectQuestionList => ({
    questions: resource.questions.map((question) =>
      presentQuestion(question, resource.posts),
    ),
    nextCursor: resource.more ? (resource.questions.at(-1)?.id ?? null) : null,
  }),
});

/** One question, as a notification leads to it. */
export const readObjectQuestion = defineQuery({
  name: "object_question.read",
  input: objectQuestionQuerySchema,
  policy: readObjectQuestionPolicy,
  load: ({ db, actor, input, now }) =>
    inSnapshot(db, async (tx) => {
      const viewerId = actingUserId(actor);
      const question = await loadQuestion(tx, input.questionId);

      if (!question) {
        return null;
      }

      const visible = await seesQuestion(tx, question, viewerId, now);

      return {
        resource: {
          visible,
          question,
          posts: visible ? await loadPosts(tx, [question.id], viewerId) : [],
        },
        context: undefined,
      };
    }),
  present: ({ resource }): ObjectQuestion =>
    presentQuestion(resource.question, resource.posts),
});
