import { randomUUID } from "node:crypto";
import { anonymousActor, systemActor } from "../actor";
import type { Policy } from "../authorization/policy";
import { policyMatrix } from "../authorization/policy-matrix";
import { testUserActor } from "../testing/actors";
import {
  type PilotScope,
  type PilotTaskScope,
  type PilotViewer,
  pilotPolicies,
  readPilotRolePolicy,
  readPilotTasksPolicy,
  reportPilotTaskPolicy,
} from "./policies";

const me = testUserActor();
const inactive = testUserActor({ accountStatus: "deactivated" });
const ownId = randomUUID();

const viewer = (overrides: Partial<PilotViewer> = {}): PilotScope => ({
  viewer: { leadId: null, participantId: null, ...overrides },
});

const lead = viewer({ leadId: randomUUID() });
const participant = viewer({ participantId: ownId });
const outsider = viewer();

/**
 * The lead's policies: only an active lead; a participant, anyone else and
 * the platform's own roles get what they would for nothing at all.
 */
const leadMatrix = (policy: Policy<PilotScope, void>) =>
  policyMatrix(policy, [
    {
      name: "the pilot lead",
      actor: me,
      resource: lead,
      context: undefined,
      expected: "allow",
    },
    {
      name: "a participant",
      actor: me,
      resource: participant,
      context: undefined,
      expected: "not_found",
    },
    {
      name: "anyone else",
      actor: me,
      resource: outsider,
      context: undefined,
      expected: "not_found",
    },
    {
      name: "a platform steward outside the pilot",
      actor: testUserActor({ platformRoles: ["platform_steward"] }),
      resource: outsider,
      context: undefined,
      expected: "not_found",
    },
    {
      name: "a lead whose account is not active",
      actor: inactive,
      resource: lead,
      context: undefined,
      expected: "account_inactive",
    },
    {
      name: "nobody signed in",
      actor: anonymousActor,
      resource: lead,
      context: undefined,
      expected: "unauthenticated",
    },
    {
      name: "a scheduled job",
      actor: systemActor("pilot.test"),
      resource: lead,
      context: undefined,
      expected: "unauthenticated",
    },
  ]);

const task = (scope: PilotScope, participantId = ownId): PilotTaskScope => ({
  ...scope,
  participantId,
});

const memberSpecific = new Set<Policy<never, never>>([
  readPilotRolePolicy,
  readPilotTasksPolicy,
  reportPilotTaskPolicy,
] as never);

export const pilotMatrices = [
  ...pilotPolicies
    .filter((policy) => !memberSpecific.has(policy as never))
    .map((policy) => leadMatrix(policy as Policy<PilotScope, void>)),
  policyMatrix(readPilotRolePolicy, [
    {
      name: "the lead",
      actor: me,
      resource: lead,
      context: undefined,
      expected: "allow",
    },
    {
      name: "a participant",
      actor: me,
      resource: participant,
      context: undefined,
      expected: "allow",
    },
    {
      name: "anyone else",
      actor: me,
      resource: outsider,
      context: undefined,
      expected: "not_found",
    },
  ]),
  policyMatrix(readPilotTasksPolicy, [
    {
      name: "a participant",
      actor: me,
      resource: participant,
      context: undefined,
      expected: "allow",
    },
    {
      name: "the lead, who has no tasks of their own",
      actor: me,
      resource: lead,
      context: undefined,
      expected: "not_found",
    },
    {
      name: "anyone else",
      actor: me,
      resource: outsider,
      context: undefined,
      expected: "not_found",
    },
    {
      name: "a participant whose account is not active",
      actor: inactive,
      resource: participant,
      context: undefined,
      expected: "account_inactive",
    },
  ]),
  policyMatrix(reportPilotTaskPolicy, [
    {
      name: "the participant's own task",
      actor: me,
      resource: task(participant),
      context: undefined,
      expected: "allow",
    },
    {
      name: "another participant's task",
      actor: me,
      resource: task(participant, randomUUID()),
      context: undefined,
      expected: "not_found",
    },
    {
      name: "the lead, on a participant's task",
      actor: me,
      resource: task(lead),
      context: undefined,
      expected: "not_found",
    },
    {
      name: "anyone else",
      actor: me,
      resource: task(outsider),
      context: undefined,
      expected: "not_found",
    },
  ]),
];
