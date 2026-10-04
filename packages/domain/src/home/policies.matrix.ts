import { type Actor, anonymousActor, systemActor } from "../actor";
import { type PolicyCase, policyMatrix } from "../authorization/policy-matrix";
import type { DenialReason } from "../errors";
import { testUserActor } from "../testing/actors";
import { readHomePolicy } from "./policies";

const expectCase = (
  name: string,
  actor: Actor,
  expected: "allow" | DenialReason,
): PolicyCase<unknown, void> => ({
  name,
  actor,
  resource: undefined,
  context: undefined,
  expected,
});

export const homeMatrices = [
  policyMatrix(readHomePolicy, [
    expectCase("a signed-in user", testUserActor(), "allow"),
    expectCase("anonymous caller", anonymousActor, "unauthenticated"),
    expectCase(
      "an account that has not completed registration",
      testUserActor({ accountStatus: "pending_registration" }),
      "registration_required",
    ),
    expectCase(
      "system processes act on nobody's behalf",
      systemActor("outbox.worker"),
      "unauthenticated",
    ),
  ]),
];
