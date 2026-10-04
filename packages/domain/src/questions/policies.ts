import {
  allow,
  definePolicy,
  deny,
  type ResourceRule,
} from "../authorization/policy";
import { requireActiveAccount } from "../authorization/rules";

/** A question, or the place to ask one, as the caller relates to it. */
export interface QuestionAccessResource {
  /**
   * The caller finds the object through the publication the question
   * belongs to (or would belong to), and sees the question itself.
   */
  readonly visible: boolean;
}

/**
 * PS-OBJ-015: questions are read and written only by those who find the
 * object in that environment now, through that publication. Anyone else,
 * including members of other environments where the object is published,
 * gets the same `not_found` as for a question that does not exist.
 */
const seesQuestions: ResourceRule<QuestionAccessResource, void> = ({
  resource,
}) => (resource.visible ? allow : deny("not_found"));

const questionPolicy = (action: string) =>
  definePolicy<QuestionAccessResource, void>({
    action,
    actor: [requireActiveAccount],
    resource: [seesQuestions],
  });

export const askObjectQuestionPolicy = questionPolicy("object_question.ask");
export const replyToObjectQuestionPolicy = questionPolicy(
  "object_question.reply",
);
export const listObjectQuestionsPolicy = questionPolicy("object_question.list");
export const readObjectQuestionPolicy = questionPolicy("object_question.read");

export const questionPolicies = [
  askObjectQuestionPolicy,
  replyToObjectQuestionPolicy,
  listObjectQuestionsPolicy,
  readObjectQuestionPolicy,
];
