import { anonymousActor, systemActor } from "../actor";
import { policyMatrix } from "../authorization/policy-matrix";
import { testUserActor } from "../testing/actors";
import {
  grantPlatformRolePolicy,
  platformRoleOpsProcess,
  type PlatformRoleTarget,
  revokePlatformRolePolicy,
} from "./policies";

const ops = systemActor(platformRoleOpsProcess);
const target = (overrides: Partial<PlatformRoleTarget> = {}) => ({
  userId: "00000000-0000-4000-8000-000000000001",
  status: "active" as const,
  activeGrantId: null,
  ...overrides,
});
// Holding the role, even with MFA, does not let anyone appoint stewards.
const steward = testUserActor({
  platformRoles: ["platform_steward"],
  authentication: {
    sessionId: "s",
    assurance: "aal2",
    methods: [{ method: "totp", at: new Date() }],
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
];
