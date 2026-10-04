import { type Actor, anonymousActor, systemActor } from "../actor";
import type { Policy } from "../authorization/policy";
import { type PolicyCase, policyMatrix } from "../authorization/policy-matrix";
import type { DenialReason } from "../errors";
import { testUserActor } from "../testing/actors";
import {
  reconcileSearchIndexPolicy,
  searchEnvironmentsPolicy,
  searchIndexProcess,
  searchObjectsPolicy,
} from "./policies";

/** No resource: what a user finds is decided in the query itself. */
const expectCase = <R>(
  name: string,
  actor: Actor,
  expected: "allow" | DenialReason,
): PolicyCase<R, void> => ({
  name,
  actor,
  resource: undefined as R,
  context: undefined,
  expected,
});

const finnMatrix = (policy: Policy<unknown, void>) =>
  policyMatrix(policy, [
    expectCase("a registered user", testUserActor(), "allow"),
    expectCase(
      "an unfinished registration",
      testUserActor({ accountStatus: "pending_registration" }),
      "registration_required",
    ),
    // Finding leads to new activity, which an account at rest does not
    // start (PS-ADM-002).
    expectCase(
      "a deactivated account",
      testUserActor({ accountStatus: "deactivated" }),
      "account_inactive",
    ),
    expectCase("anonymous caller", anonymousActor, "unauthenticated"),
    expectCase(
      "a system process",
      systemActor(searchIndexProcess),
      "unauthenticated",
    ),
  ]);

export const searchMatrices = [
  finnMatrix(searchObjectsPolicy),
  finnMatrix(searchEnvironmentsPolicy),
  policyMatrix(reconcileSearchIndexPolicy, [
    expectCase("the reconcile job", systemActor(searchIndexProcess), "allow"),
    expectCase(
      "another system process",
      systemActor("outbox.worker"),
      "forbidden",
    ),
    expectCase("a signed-in user", testUserActor(), "forbidden"),
    expectCase("anonymous caller", anonymousActor, "forbidden"),
  ]),
];
