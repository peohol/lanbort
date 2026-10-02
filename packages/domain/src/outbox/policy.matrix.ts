import { anonymousActor, systemActor } from "../actor";
import { policyMatrix } from "../authorization/policy-matrix";
import { testUserActor } from "../testing/actors";
import { outboxWorkerProcess, processOutboxPolicy } from "./policy";

export const outboxMatrices = [
  policyMatrix(processOutboxPolicy, [
    {
      name: "the scheduled outbox worker",
      actor: systemActor(outboxWorkerProcess),
      resource: undefined,
      context: undefined,
      expected: "allow",
    },
    {
      name: "another system process",
      actor: systemActor("some.other.job"),
      resource: undefined,
      context: undefined,
      expected: "forbidden",
    },
    {
      name: "a signed-in user",
      actor: testUserActor(),
      resource: undefined,
      context: undefined,
      expected: "forbidden",
    },
    {
      name: "anonymous caller",
      actor: anonymousActor,
      resource: undefined,
      context: undefined,
      expected: "forbidden",
    },
  ]),
];
