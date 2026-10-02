import { anonymousActor, systemActor } from "../actor";
import { policyMatrix } from "../authorization/policy-matrix";
import { testUserActor } from "../testing/actors";
import { completeRegistrationPolicy, readOwnAccount } from "./policies";

const pending = testUserActor({ accountStatus: "pending_registration" });
const active = testUserActor();
const other = testUserActor();

const own = (actor: typeof pending, status = actor.accountStatus) => ({
  userId: actor.userId,
  status,
});

export const accountMatrices = [
  policyMatrix(readOwnAccount, [
    {
      name: "pending user reads own account to continue registration",
      actor: pending,
      resource: own(pending),
      context: undefined,
      expected: "allow",
    },
    {
      name: "active user reads own account",
      actor: active,
      resource: own(active),
      context: undefined,
      expected: "allow",
    },
    {
      name: "another user's account is indistinguishable from a missing one",
      actor: other,
      resource: own(active),
      context: undefined,
      expected: "not_found",
    },
    {
      name: "anonymous caller",
      actor: anonymousActor,
      resource: own(active),
      context: undefined,
      expected: "unauthenticated",
    },
    {
      name: "system processes have no own account",
      actor: systemActor("outbox.worker"),
      resource: own(active),
      context: undefined,
      expected: "unauthenticated",
    },
  ]),
  policyMatrix(completeRegistrationPolicy, [
    {
      name: "pending user completes own registration",
      actor: pending,
      resource: own(pending),
      context: undefined,
      expected: "allow",
    },
    {
      name: "registration cannot be completed twice",
      actor: active,
      resource: own(active),
      context: undefined,
      expected: "forbidden",
    },
    {
      name: "cannot complete someone else's registration",
      actor: other,
      resource: own(pending),
      context: undefined,
      expected: "not_found",
    },
    {
      name: "anonymous caller",
      actor: anonymousActor,
      resource: own(pending),
      context: undefined,
      expected: "unauthenticated",
    },
  ]),
];
