import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Actor } from "../actor";
import { evaluateActor, type Policy } from "../authorization/policy";
import {
  type CommandDefinition,
  type DomainContext,
  executeCommand,
} from "../commands/command";
import { executeQuery, type QueryDefinition } from "../commands/query";
import { isDomainError } from "../errors";
import * as domainExports from "../index";
import { testUserActor } from "./actors";

/**
 * Every command and query the domain exports, for tests that must reach all
 * of them (WP-70). A new operation is picked up here without being listed.
 */
export interface Operation {
  /** The operation's own name, for example `environment.read`. */
  readonly name: string;
  readonly kind: "command" | "query";
  readonly definition:
    | CommandDefinition<unknown, unknown, unknown, unknown>
    | QueryDefinition<unknown, unknown, unknown, unknown>;
  /** Every property name the input accepts, also nested ones. */
  readonly inputKeys: ReadonlySet<string>;
}

function propertyNames(schema: unknown, names = new Set<string>()) {
  if (Array.isArray(schema)) {
    for (const item of schema) propertyNames(item, names);
  } else if (schema !== null && typeof schema === "object") {
    for (const [key, value] of Object.entries(schema)) {
      if (key === "properties" && value !== null && typeof value === "object") {
        for (const name of Object.keys(value)) names.add(name);
      }

      propertyNames(value, names);
    }
  }

  return names;
}

const isOperation = (value: unknown): value is Operation["definition"] =>
  value !== null &&
  typeof value === "object" &&
  "name" in value &&
  "input" in value &&
  "policy" in value &&
  "load" in value;

export const allOperations: readonly Operation[] = Object.values(
  domainExports as Record<string, unknown>,
)
  .filter(isOperation)
  .map((definition) => ({
    name: definition.name,
    kind: "execute" in definition ? ("command" as const) : ("query" as const),
    definition,
    inputKeys: propertyNames(
      z.toJSONSchema(definition.input, {
        unrepresentable: "any",
        io: "input",
      }),
    ),
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

/**
 * Operations a signed-in person can reach at all: their actor rules let a
 * user with every role and the strongest, freshest authentication through.
 * The rest belong to scheduled jobs, workers and operational scripts.
 */
export function reachableByUsers(operation: Operation): boolean {
  const everything = testUserActor({
    platformRoles: ["platform_steward"],
    authentication: {
      sessionId: randomUUID(),
      assurance: "aal2",
      methods: [{ method: "step_up", at: new Date() }],
    },
  });

  return evaluateActor(operation.definition.policy as Policy<never, never>, {
    actor: everything,
    now: new Date(),
  }).allowed;
}

/** What the caller gets back: the output, or the code and fields of a refusal. */
export type Outcome =
  | { readonly output: unknown }
  | { readonly refused: string; readonly fields: readonly string[] };

/**
 * Runs the operation as `actor`, with a fresh idempotency key for commands
 * that need one. Only domain refusals become outcomes; anything else (a
 * server error) fails the test as itself.
 */
export async function attempt(
  domain: DomainContext,
  operation: Operation,
  actor: Actor,
  input: unknown,
): Promise<Outcome> {
  try {
    if (operation.kind === "query") {
      return {
        output: await executeQuery(
          domain,
          operation.definition as QueryDefinition<
            unknown,
            unknown,
            unknown,
            unknown
          >,
          { actor, input },
        ),
      };
    }

    const command = operation.definition as CommandDefinition<
      unknown,
      unknown,
      unknown,
      unknown
    >;
    const { output } = await executeCommand(domain, command, {
      actor,
      input,
      ...(command.idempotency === "none"
        ? {}
        : { idempotencyKey: randomUUID() }),
    });

    return { output };
  } catch (error) {
    if (!isDomainError(error)) {
      throw error;
    }

    return { refused: error.code, fields: [...error.fields] };
  }
}
