import { z } from "zod";
import { defineEvent } from "../events/catalog";

/**
 * Object question events carry ids only, never what was asked or answered.
 * The resource is the question thread.
 */
const questionEvent = <Shape extends z.ZodRawShape>(
  type: string,
  payload: z.ZodObject<Shape>,
) =>
  defineEvent({
    type,
    version: 1,
    kind: "domain",
    resourceType: "object_question",
    payload,
  });

/** PS-OBJ-015: a question asked through one publication. */
export const objectQuestionAsked = questionEvent(
  "object_question.asked",
  z.strictObject({ publicationId: z.uuid(), postId: z.uuid() }),
);

/** An answer or another post in the thread. */
export const objectQuestionReplied = questionEvent(
  "object_question.replied",
  z.strictObject({ postId: z.uuid() }),
);
