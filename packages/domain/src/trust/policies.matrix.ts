import { type Actor, anonymousActor, systemActor } from "../actor";
import { type PolicyCase, policyMatrix } from "../authorization/policy-matrix";
import type { DenialReason } from "../errors";
import { testUserActor } from "../testing/actors";
import { type ProfileAccessResource, readTrustProfilePolicy } from "./policies";

const subject = testUserActor();
const viewer = testUserActor();
const pendingAccount = testUserActor({ accountStatus: "pending_registration" });

/** `viewer`'s relation to `subject`: none unless given. */
const relation = (
  overrides: Partial<ProfileAccessResource> = {},
): ProfileAccessResource => ({
  subjectUserId: subject.userId,
  subjectActive: true,
  friends: false,
  shareEnvironment: false,
  blockedEitherWay: false,
  ...overrides,
});

function expectCase(
  name: string,
  actor: Actor,
  resource: ProfileAccessResource,
  expected: "allow" | DenialReason,
): PolicyCase<ProfileAccessResource, void> {
  return { name, actor, resource, context: undefined, expected };
}

export const trustMatrices = [
  policyMatrix(readTrustProfilePolicy, [
    expectCase("the person themselves", subject, relation(), "allow"),
    expectCase(
      "the person themselves, whatever they block",
      subject,
      relation({ blockedEitherWay: true }),
      "allow",
    ),
    expectCase("a friend", viewer, relation({ friends: true }), "allow"),
    expectCase(
      "an active member of a shared environment",
      viewer,
      relation({ shareEnvironment: true }),
      "allow",
    ),
    expectCase(
      "someone without a friendship or shared environment",
      viewer,
      relation(),
      "not_found",
    ),
    expectCase(
      "a friend across a block in either direction",
      viewer,
      relation({ friends: true, blockedEitherWay: true }),
      "not_found",
    ),
    expectCase(
      "a fellow member across a block",
      viewer,
      relation({ shareEnvironment: true, blockedEitherWay: true }),
      "not_found",
    ),
    expectCase(
      "a friend of an account that is not active",
      viewer,
      relation({ friends: true, subjectActive: false }),
      "not_found",
    ),
    expectCase(
      "anonymous caller",
      anonymousActor,
      relation({ friends: true }),
      "unauthenticated",
    ),
    expectCase(
      "an account that has not completed registration",
      pendingAccount,
      relation({ friends: true }),
      "registration_required",
    ),
    expectCase(
      "system processes have no profile access",
      systemActor("outbox.worker"),
      relation({ friends: true }),
      "unauthenticated",
    ),
  ]),
];
