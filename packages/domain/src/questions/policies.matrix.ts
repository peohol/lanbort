import { type Actor, anonymousActor, systemActor } from "../actor";
import type { Policy } from "../authorization/policy";
import { type PolicyCase, policyMatrix } from "../authorization/policy-matrix";
import type { DenialReason } from "../errors";
import { testUserActor } from "../testing/actors";
import {
  askObjectQuestionPolicy,
  listObjectQuestionsPolicy,
  type QuestionAccessResource,
  readObjectQuestionPolicy,
  replyToObjectQuestionPolicy,
} from "./policies";

const member = testUserActor();
const pendingAccount = testUserActor({ accountStatus: "pending_registration" });

const expectCase = (
  name: string,
  actor: Actor,
  visible: boolean,
  expected: "allow" | DenialReason,
): PolicyCase<QuestionAccessResource, void> => ({
  name,
  actor,
  resource: { visible },
  context: undefined,
  expected,
});

/**
 * PS-OBJ-015: who finds the object through the question's publication is
 * decided when it is loaded (`seesQuestion`), and the integration tests
 * cover each way of not finding it: another environment, an ended or later
 * publication, a passive membership, a block.
 */
const questionMatrix = (policy: Policy<QuestionAccessResource, void>) =>
  policyMatrix(policy, [
    expectCase("a member who finds the object there", member, true, "allow"),
    expectCase("anyone who does not", member, false, "not_found"),
    expectCase(
      "an unfinished registration",
      pendingAccount,
      true,
      "registration_required",
    ),
    expectCase("anonymous caller", anonymousActor, true, "unauthenticated"),
    expectCase(
      "a system process",
      systemActor("notifications.deadlines"),
      true,
      "unauthenticated",
    ),
  ]);

export const questionMatrices = [
  questionMatrix(askObjectQuestionPolicy),
  questionMatrix(replyToObjectQuestionPolicy),
  questionMatrix(listObjectQuestionsPolicy),
  questionMatrix(readObjectQuestionPolicy),
];
