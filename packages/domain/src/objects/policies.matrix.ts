import { anonymousActor, systemActor } from "../actor";
import { policyMatrix } from "../authorization/policy-matrix";
import { testUserActor } from "../testing/actors";
import {
  createObjectPolicy,
  listObjectCategoriesPolicy,
  listOwnObjectsPolicy,
  type ObjectResource,
  ownerPolicies,
} from "./policies";

const owner = testUserActor();
const coOwner = testUserActor();
const stranger = testUserActor();
const pending = testUserActor({ accountStatus: "pending_registration" });
const object: ObjectResource = {
  objectId: "00000000-0000-4000-8000-000000000001",
  ownerIds: [owner.userId, coOwner.userId],
};

/** Policies without a resource: any registered user, nobody else. */
const registeredUserMatrix = (
  policy:
    | typeof createObjectPolicy
    | typeof listOwnObjectsPolicy
    | typeof listObjectCategoriesPolicy,
) =>
  policyMatrix(policy, [
    {
      name: "registered user",
      actor: owner,
      resource: undefined,
      context: undefined,
      expected: "allow",
    },
    {
      name: "registration not completed",
      actor: pending,
      resource: undefined,
      context: undefined,
      expected: "registration_required",
    },
    {
      name: "anonymous caller",
      actor: anonymousActor,
      resource: undefined,
      context: undefined,
      expected: "unauthenticated",
    },
    {
      name: "system processes act on nobody's behalf",
      actor: systemActor("outbox.worker"),
      resource: undefined,
      context: undefined,
      expected: "unauthenticated",
    },
  ]);

export const objectMatrices = [
  registeredUserMatrix(createObjectPolicy),
  registeredUserMatrix(listOwnObjectsPolicy),
  registeredUserMatrix(listObjectCategoriesPolicy),
  ...ownerPolicies.map((policy) =>
    policyMatrix(policy, [
      {
        name: "owner",
        actor: owner,
        resource: object,
        context: undefined,
        expected: "allow",
      },
      {
        name: "every registered owner has the same rights",
        actor: coOwner,
        resource: object,
        context: undefined,
        expected: "allow",
      },
      {
        name: "another user's object is indistinguishable from a missing one",
        actor: stranger,
        resource: object,
        context: undefined,
        expected: "not_found",
      },
      {
        name: "an owner whose registration is not completed",
        actor: { ...pending, userId: owner.userId },
        resource: object,
        context: undefined,
        expected: "registration_required",
      },
      {
        name: "anonymous caller",
        actor: anonymousActor,
        resource: object,
        context: undefined,
        expected: "unauthenticated",
      },
      {
        name: "system process",
        actor: systemActor("outbox.worker"),
        resource: object,
        context: undefined,
        expected: "unauthenticated",
      },
    ]),
  ),
];
