import { createHash } from "node:crypto";
import { type PilotCase, pilotAreaOf, pilotCases } from "@lanbort/contracts";
import { DomainError } from "../errors";

/**
 * The revision of a test's wording: a short hash of what the tester is
 * asked to do and to see. A run stores it, so changed wording in the
 * catalogue never rewrites what earlier runs were tried against.
 */
export function pilotCaseRevision(test: PilotCase): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        test.priority,
        test.action,
        test.expected,
        test.prepare,
        test.steps,
        test.passWhen,
      ]),
    )
    .digest("hex")
    .slice(0, 12);
}

const casesById = new Map(pilotCases.map((test) => [test.id, test]));

/** The catalogue's test, or `not_found` for an id it does not have. */
export function pilotCase(testId: string): PilotCase {
  const test = casesById.get(testId);

  if (!test) {
    throw new DomainError("not_found", "No such test in the pilot catalogue");
  }

  return test;
}

export function pilotAreaCode(testId: string): string {
  return pilotAreaOf(testId)!.code;
}
