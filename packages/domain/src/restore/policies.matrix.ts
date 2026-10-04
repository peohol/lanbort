import { type Actor, anonymousActor, systemActor } from "../actor";
import type { PolicyCase } from "../authorization/policy-matrix";
import { policyMatrix } from "../authorization/policy-matrix";
import type { DenialReason } from "../errors";
import { platformRoleOpsProcess } from "../platform/policies";
import { testUserActor } from "../testing/actors";
import type { RestoreJournalEntry } from "./journal";
import { replayJournalEntryPolicy, restoreProcess } from "./policies";

const entry: RestoreJournalEntry = {
  id: "00000000-0000-4000-8000-000000000001",
  position: "1",
  occurredAt: "2026-10-04T00:00:00.000Z",
  type: "user_block.created",
  resourceType: "user_block",
  resourceId: "00000000-0000-4000-8000-000000000002",
  actorUserId: null,
  payload: {},
  captured: null,
};

const expectCase = (
  name: string,
  actor: Actor,
  expected: "allow" | DenialReason,
): PolicyCase<RestoreJournalEntry, void> => ({
  name,
  actor,
  resource: entry,
  context: undefined,
  expected,
});

export const restoreMatrices = [
  policyMatrix(replayJournalEntryPolicy, [
    expectCase("the restore process", systemActor(restoreProcess), "allow"),
    expectCase(
      "another operational process",
      systemActor(platformRoleOpsProcess),
      "forbidden",
    ),
    expectCase("the outbox worker", systemActor("outbox.worker"), "forbidden"),
    expectCase(
      "a platform steward",
      testUserActor({ platformRoles: ["platform_steward"] }),
      "forbidden",
    ),
    expectCase("anonymous caller", anonymousActor, "forbidden"),
  ]),
];
