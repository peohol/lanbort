import { z } from "zod";
import { multilineText, objectIdSchema } from "./objects";
import { publicationIdSchema } from "./publications";

/**
 * Questions about an object in one environment (PS-OBJ-015). A question
 * belongs to the publication it was asked through: it is only shown there,
 * to those who find the object in that environment, and only while that
 * publication is active. The first post is the question; answers and
 * discussion follow in the same thread.
 */
export const objectQuestionIdSchema = z.uuid();

export const objectQuestionBodySchema = z
  .string()
  .trim()
  .min(1)
  .max(2000)
  .regex(multilineText);

/** Asks about an object the caller finds in the environment. */
export const askObjectQuestionSchema = z.strictObject({
  environmentId: z.uuid(),
  objectId: objectIdSchema,
  body: objectQuestionBodySchema,
});

/** Answers or adds to a question the caller can see. */
export const replyToObjectQuestionSchema = z.strictObject({
  questionId: objectQuestionIdSchema,
  body: objectQuestionBodySchema,
});

export const objectQuestionPostedSchema = z.strictObject({
  questionId: objectQuestionIdSchema,
  postId: z.uuid(),
});

export const objectQuestionPostSchema = z.strictObject({
  id: z.uuid(),
  authorUserId: z.uuid(),
  /** The author owned the object when posting: an answer from the owner. */
  byOwner: z.boolean(),
  body: z.string(),
  createdAt: z.iso.datetime(),
});

export const objectQuestionSchema = z.strictObject({
  id: objectQuestionIdSchema,
  publicationId: publicationIdSchema,
  objectId: objectIdSchema,
  askedByUserId: z.uuid(),
  createdAt: z.iso.datetime(),
  /** Oldest first; the first one is the question. */
  posts: z.array(objectQuestionPostSchema),
});

/** Lists come newest question first, a page at a time. */
export const objectQuestionPageSize = 20;

export const objectQuestionsQuerySchema = z.strictObject({
  environmentId: z.uuid(),
  objectId: objectIdSchema,
  cursor: objectQuestionIdSchema.optional(),
});

export const objectQuestionListSchema = z.strictObject({
  questions: z.array(objectQuestionSchema),
  /** Pass as `cursor` for the next page; null on the last one. */
  nextCursor: objectQuestionIdSchema.nullable(),
});

export const objectQuestionQuerySchema = z.strictObject({
  questionId: objectQuestionIdSchema,
});

export type ObjectQuestion = z.infer<typeof objectQuestionSchema>;
export type ObjectQuestionList = z.infer<typeof objectQuestionListSchema>;
export type ObjectQuestionPosted = z.infer<typeof objectQuestionPostedSchema>;
