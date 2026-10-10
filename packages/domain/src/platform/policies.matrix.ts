import { anonymousActor, systemActor } from "../actor";
import { policyMatrix } from "../authorization/policy-matrix";
import { testUserActor } from "../testing/actors";
import {
  beginPasskeyConfirmationPolicy,
  beginPasskeyRegistrationPolicy,
  finishPasskeyConfirmationPolicy,
  finishPasskeyRegistrationPolicy,
  issueEnrollmentCodePolicy,
  listOwnPasskeysPolicy,
  removePasskeyPolicy,
  resetStewardPasskeysPolicy,
  type StewardTarget,
  grantPlatformRolePolicy,
  platformRoleOpsProcess,
  type PlatformRoleTarget,
  revokePlatformRolePolicy,
  stewardPasskeyOpsProcess,
} from "./policies";

const ops = systemActor(platformRoleOpsProcess);
const passkeyOps = systemActor(stewardPasskeyOpsProcess);
const target = (overrides: Partial<PlatformRoleTarget> = {}) => ({
  userId: "00000000-0000-4000-8000-000000000001",
  status: "active" as const,
  activeGrantId: null,
  ...overrides,
});
// Holding the role, even with stronger authentication, does not let anyone
// appoint stewards.
const steward = testUserActor({
  platformRoles: ["platform_steward"],
  authentication: {
    sessionId: "s",
    assurance: "aal2",
    methods: [{ method: "step_up", at: new Date() }],
  },
});

const notTheOpsProcess = [
  { name: "a platform steward in the app", actor: steward },
  { name: "an ordinary user", actor: testUserActor() },
  { name: "another system process", actor: systemActor("outbox.worker") },
  { name: "anonymous caller", actor: anonymousActor },
] as const;

export const platformMatrices = [
  policyMatrix(grantPlatformRolePolicy, [
    {
      name: "the operational command grants to an active account",
      actor: ops,
      resource: target(),
      context: undefined,
      expected: "allow",
    },
    {
      name: "an account that has not completed registration",
      actor: ops,
      resource: target({ status: "pending_registration" }),
      context: undefined,
      expected: "forbidden",
    },
    ...notTheOpsProcess.map(({ name, actor }) => ({
      name,
      actor,
      resource: target(),
      context: undefined,
      expected: "forbidden" as const,
    })),
  ]),
  policyMatrix(revokePlatformRolePolicy, [
    {
      name: "the operational command revokes an active grant",
      actor: ops,
      resource: target({
        activeGrantId: "00000000-0000-4000-8000-000000000002",
      }),
      context: undefined,
      expected: "allow",
    },
    {
      name: "there is no active grant to revoke",
      actor: ops,
      resource: target(),
      context: undefined,
      expected: "not_found",
    },
    ...notTheOpsProcess.map(({ name, actor }) => ({
      name,
      actor,
      resource: target({
        activeGrantId: "00000000-0000-4000-8000-000000000002",
      }),
      context: undefined,
      expected: "forbidden" as const,
    })),
  ]),
  ...passkeyMatrices(),
];

/** OD-0023: a steward's own passkeys, and the operational commands. */
function passkeyMatrices() {
  const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000);
  const holder = (confirmedMinutesAgo: number | null = null) =>
    testUserActor({
      platformRoles: ["platform_steward"],
      authentication: {
        sessionId: "s",
        assurance: "aal1",
        methods: [
          ...(confirmedMinutesAgo === null
            ? []
            : [{ method: "steward_passkey", at: at(confirmedMinutesAgo) }]),
          { method: "otp", at: at(0) },
        ],
      },
    });
  const challenge = {
    id: "00000000-0000-4000-8000-000000000003",
    challenge: new Uint8Array(32),
    enrollment_code_id: null,
  };
  const noRole = [
    { name: "an ordinary user", actor: testUserActor() },
    { name: "the operational command", actor: ops },
    { name: "anonymous caller", actor: anonymousActor },
  ];
  const enrolment = (
    policy:
      | typeof beginPasskeyRegistrationPolicy
      | typeof finishPasskeyRegistrationPolicy,
    context: never,
  ) =>
    policyMatrix(policy as typeof finishPasskeyRegistrationPolicy, [
      {
        name: "an open enrollment code vouches for it",
        actor: holder(),
        resource: { vouchedBy: "enrollment_code" },
        context,
        expected: "allow",
      },
      {
        name: "a confirmation with another passkey within 10 minutes",
        actor: holder(9),
        resource: { vouchedBy: "session" },
        context,
        expected: "allow",
      },
      {
        name: "an e-mail session alone",
        actor: holder(),
        resource: { vouchedBy: "session" },
        context,
        expected: "stronger_authentication_required",
      },
      {
        name: "a confirmation that is no longer fresh",
        actor: holder(11),
        resource: { vouchedBy: "session" },
        context,
        expected: "stronger_authentication_required",
      },
      {
        name: "the code was used or voided during the ceremony",
        actor: holder(),
        resource: { vouchedBy: "lapsed_code" },
        context,
        expected: "forbidden",
      },
      ...noRole.map(({ name, actor }) => ({
        name,
        actor,
        resource: { vouchedBy: "enrollment_code" as const },
        context,
        expected:
          actor.kind === "user"
            ? ("forbidden" as const)
            : ("unauthenticated" as const),
      })),
    ]);
  const target = (overrides: Partial<StewardTarget> = {}): StewardTarget => ({
    userId: "00000000-0000-4000-8000-000000000001",
    status: "active",
    holdsRole: true,
    ...overrides,
  });
  const opsMatrix = (policy: typeof issueEnrollmentCodePolicy) =>
    policyMatrix(policy, [
      {
        name: "the operational command, for an active steward",
        actor: passkeyOps,
        resource: target(),
        context: undefined,
        expected: "allow",
      },
      {
        name: "an account without the role",
        actor: passkeyOps,
        resource: target({ holdsRole: false }),
        context: undefined,
        expected: "forbidden",
      },
      {
        name: "a suspended steward",
        actor: passkeyOps,
        resource: target({ status: "suspended" }),
        context: undefined,
        expected: "forbidden",
      },
      {
        name: "the steward themselves, even confirmed",
        actor: steward,
        resource: target(),
        context: undefined,
        expected: "forbidden",
      },
      {
        name: "the role command",
        actor: ops,
        resource: target(),
        context: undefined,
        expected: "forbidden",
      },
    ]);

  return [
    enrolment(beginPasskeyRegistrationPolicy, null as never),
    enrolment(finishPasskeyRegistrationPolicy, challenge as never),
    policyMatrix(beginPasskeyConfirmationPolicy, [
      {
        name: "a steward with a passkey",
        actor: holder(),
        resource: { activeCount: 1 },
        context: [],
        expected: "allow",
      },
      {
        name: "a steward without passkeys",
        actor: holder(),
        resource: { activeCount: 0 },
        context: [],
        expected: "forbidden",
      },
      ...noRole.map(({ name, actor }) => ({
        name,
        actor,
        resource: { activeCount: 1 },
        context: [],
        expected:
          actor.kind === "user"
            ? ("forbidden" as const)
            : ("unauthenticated" as const),
      })),
    ]),
    policyMatrix(finishPasskeyConfirmationPolicy, [
      {
        name: "a steward answering their own session's challenge",
        actor: holder(),
        resource: undefined,
        context: challenge,
        expected: "allow",
      },
      {
        name: "a suspended steward",
        actor: { ...holder(), accountStatus: "suspended" as const },
        resource: undefined,
        context: challenge,
        expected: "account_inactive",
      },
      ...noRole.map(({ name, actor }) => ({
        name,
        actor,
        resource: undefined,
        context: challenge,
        expected:
          actor.kind === "user"
            ? ("forbidden" as const)
            : ("unauthenticated" as const),
      })),
    ]),
    policyMatrix(removePasskeyPolicy, [
      {
        name: "a freshly confirmed steward keeps at least one",
        actor: holder(1),
        resource: { activeCount: 2 },
        context: undefined,
        expected: "allow",
      },
      {
        name: "the last passkey",
        actor: holder(1),
        resource: { activeCount: 1 },
        context: undefined,
        expected: "forbidden",
      },
      {
        name: "without a fresh confirmation",
        actor: holder(11),
        resource: { activeCount: 3 },
        context: undefined,
        expected: "stronger_authentication_required",
      },
      {
        name: "an ordinary user",
        actor: testUserActor(),
        resource: { activeCount: 3 },
        context: undefined,
        expected: "forbidden",
      },
    ]),
    policyMatrix(listOwnPasskeysPolicy, [
      {
        name: "a steward",
        actor: holder(),
        resource: {
          passkeys: [],
          minimum: 2,
          confirmedAt: null,
          strong: false,
        },
        context: undefined,
        expected: "allow",
      },
      ...noRole.map(({ name, actor }) => ({
        name,
        actor,
        resource: {
          passkeys: [],
          minimum: 2,
          confirmedAt: null,
          strong: false,
        },
        context: undefined,
        expected:
          actor.kind === "user"
            ? ("forbidden" as const)
            : ("unauthenticated" as const),
      })),
    ]),
    opsMatrix(issueEnrollmentCodePolicy),
    opsMatrix(resetStewardPasskeysPolicy),
  ];
}
