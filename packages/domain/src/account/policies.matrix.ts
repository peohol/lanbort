import { anonymousActor, systemActor } from "../actor";
import { policyMatrix } from "../authorization/policy-matrix";
import { testUserActor } from "../testing/actors";
import {
  completeRegistrationPolicy,
  enrollMfaPolicy,
  readOwnAccount,
  readSecurityPolicy,
  reauthenticatePolicy,
  recordMfaEnabledPolicy,
  stepUpMfaPolicy,
} from "./policies";

const pending = testUserActor({ accountStatus: "pending_registration" });
const active = testUserActor();
const other = testUserActor();

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);
const signedIn = (minutes: number, assurance: "aal1" | "aal2" = "aal1") =>
  testUserActor({
    authentication: {
      sessionId: "session",
      assurance,
      methods: [{ method: "otp", at: minutesAgo(minutes) }],
    },
  });
const stale = signedIn(60);
const steppedUp = signedIn(1, "aal2");

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
  policyMatrix(reauthenticatePolicy, [
    {
      name: "a signed-in user confirms their identity again",
      actor: stale,
      resource: undefined,
      context: undefined,
      expected: "allow",
    },
    {
      name: "anonymous caller has no identity to confirm",
      actor: anonymousActor,
      resource: undefined,
      context: undefined,
      expected: "unauthenticated",
    },
  ]),
  policyMatrix(readSecurityPolicy, [
    {
      name: "active user reads own security settings",
      actor: active,
      resource: undefined,
      context: undefined,
      expected: "allow",
    },
    {
      name: "registration must be completed first",
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
  ]),
  policyMatrix(enrollMfaPolicy, [
    {
      name: "recently signed-in user adds an authenticator app",
      actor: signedIn(2),
      resource: { totp: "none" },
      context: undefined,
      expected: "allow",
    },
    {
      name: "recently signed-in user confirms a pending app",
      actor: signedIn(2),
      resource: { totp: "pending" },
      context: undefined,
      expected: "allow",
    },
    {
      name: "an old session must sign in again first",
      actor: stale,
      resource: { totp: "none" },
      context: undefined,
      expected: "reauthentication_required",
    },
    {
      name: "a session without any recorded sign-in counts as old",
      actor: testUserActor({
        authentication: { sessionId: "s", assurance: "aal1", methods: [] },
      }),
      resource: { totp: "none" },
      context: undefined,
      expected: "reauthentication_required",
    },
    {
      name: "a confirmed app cannot be replaced yet",
      actor: steppedUp,
      resource: { totp: "verified" },
      context: undefined,
      expected: "forbidden",
    },
    {
      name: "pending accounts finish registration first",
      actor: testUserActor({ accountStatus: "pending_registration" }),
      resource: { totp: "none" },
      context: undefined,
      expected: "registration_required",
    },
    {
      name: "anonymous caller",
      actor: anonymousActor,
      resource: { totp: "none" },
      context: undefined,
      expected: "unauthenticated",
    },
  ]),
  policyMatrix(stepUpMfaPolicy, [
    {
      name: "user with a confirmed app raises the session, however old",
      actor: stale,
      resource: { totp: "verified" },
      context: undefined,
      expected: "allow",
    },
    {
      name: "nothing to verify against without a confirmed app",
      actor: active,
      resource: { totp: "pending" },
      context: undefined,
      expected: "not_found",
    },
    {
      name: "anonymous caller",
      actor: anonymousActor,
      resource: { totp: "verified" },
      context: undefined,
      expected: "unauthenticated",
    },
  ]),
  policyMatrix(recordMfaEnabledPolicy, [
    {
      name: "the app was just confirmed in this session",
      actor: steppedUp,
      resource: own(steppedUp),
      context: undefined,
      expected: "allow",
    },
    {
      name: "a session without a verified second factor",
      actor: active,
      resource: own(active),
      context: undefined,
      expected: "mfa_required",
    },
    {
      name: "cannot record for another account",
      actor: steppedUp,
      resource: own(active),
      context: undefined,
      expected: "not_found",
    },
  ]),
];
