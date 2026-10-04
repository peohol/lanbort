import { type Actor, anonymousActor, systemActor } from "../actor";
import type { Policy } from "../authorization/policy";
import { type PolicyCase, policyMatrix } from "../authorization/policy-matrix";
import type { DenialReason } from "../errors";
import { testUserActor } from "../testing/actors";
import {
  type FoundObjectResource,
  listObjectSubscriptionsPolicy,
  lookAtSubscribedObjectsPolicy,
  objectAvailabilityProcess,
  subscribeToObjectPolicy,
  unsubscribeFromObjectPolicy,
} from "./policies";

const me = testUserActor();
const pendingAccount = testUserActor({ accountStatus: "pending_registration" });

const expectCase = <R>(
  name: string,
  actor: Actor,
  resource: R,
  expected: "allow" | DenialReason,
): PolicyCase<R, void> => ({
  name,
  actor,
  resource,
  context: undefined,
  expected,
});

const found = (value: boolean): FoundObjectResource => ({ found: value });

const ownMatrix = (policy: Policy<unknown, void>) =>
  policyMatrix(policy, [
    expectCase("a registered user", me, undefined, "allow"),
    expectCase(
      "an unfinished registration",
      pendingAccount,
      undefined,
      "registration_required",
    ),
    expectCase(
      "anonymous caller",
      anonymousActor,
      undefined,
      "unauthenticated",
    ),
    expectCase(
      "a system process",
      systemActor(objectAvailabilityProcess),
      undefined,
      "unauthenticated",
    ),
  ]);

export const subscriptionMatrices = [
  policyMatrix(subscribeToObjectPolicy, [
    expectCase(
      "someone who finds the object in an environment",
      me,
      found(true),
      "allow",
    ),
    // Owning it elsewhere, having seen it once, or a subscription from
    // before does not count: only finding it now (PS-OBJ-014).
    expectCase("someone who does not find it", me, found(false), "not_found"),
    expectCase(
      "an unfinished registration",
      pendingAccount,
      found(true),
      "registration_required",
    ),
    expectCase(
      "anonymous caller",
      anonymousActor,
      found(true),
      "unauthenticated",
    ),
  ]),
  ownMatrix(unsubscribeFromObjectPolicy),
  ownMatrix(listObjectSubscriptionsPolicy),
  policyMatrix(lookAtSubscribedObjectsPolicy, [
    expectCase(
      "the availability job",
      systemActor(objectAvailabilityProcess),
      undefined,
      "allow",
    ),
    expectCase(
      "another system process",
      systemActor("notifications.deadlines"),
      undefined,
      "forbidden",
    ),
    expectCase("a signed-in user", me, undefined, "forbidden"),
    expectCase("anonymous caller", anonymousActor, undefined, "forbidden"),
  ]),
];
