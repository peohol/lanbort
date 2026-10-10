import { type Actor, anonymousActor, systemActor } from "../actor";
import type { PolicyCase } from "../authorization/policy-matrix";
import { policyMatrix } from "../authorization/policy-matrix";
import { chatRetentionProcess } from "../chat/policies";
import type { DenialReason } from "../errors";
import { testUserActor } from "../testing/actors";
import { purgeExpiredDataPolicy, retentionProcess } from "./policies";

const expectCase = (
  name: string,
  actor: Actor,
  expected: "allow" | DenialReason,
): PolicyCase<void, void> => ({
  name,
  actor,
  resource: undefined,
  context: undefined,
  expected,
});

export const retentionMatrices = [
  policyMatrix(purgeExpiredDataPolicy, [
    expectCase("the retention process", systemActor(retentionProcess), "allow"),
    expectCase(
      "another process",
      systemActor(chatRetentionProcess),
      "forbidden",
    ),
    expectCase(
      "a platform steward",
      testUserActor({ platformRoles: ["platform_steward"] }),
      "forbidden",
    ),
    expectCase("anonymous caller", anonymousActor, "forbidden"),
  ]),
];
