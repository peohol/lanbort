import type { Database } from "@lanbort/database";
import type { Kysely } from "kysely";
import type { z } from "zod";
import type { Actor } from "../actor";
import {
  authorize,
  authorizeActor,
  type Policy,
} from "../authorization/policy";
import { AuthorizationError } from "../errors";
import { type DomainContext, type Loaded, parseInput } from "./command";

/**
 * A protected read. Like commands, queries cannot be defined without a policy
 * and the result is only built after the policy has allowed it.
 */
export interface QueryDefinition<I, R, C, O> {
  readonly name: string;
  readonly input: z.ZodType<I>;
  readonly policy: Policy<R, C>;
  load(args: {
    db: Kysely<Database>;
    actor: Actor;
    input: I;
  }): Promise<Loaded<R, C> | null>;
  /** Shapes the response from the authorized resource. */
  present(args: { actor: Actor; input: I; resource: R; context: C }): O;
}

export function defineQuery<I, R, C, O>(
  definition: QueryDefinition<I, R, C, O>,
): QueryDefinition<I, R, C, O> {
  return Object.freeze({ ...definition });
}

export async function executeQuery<I, R, C, O>(
  domain: Pick<DomainContext, "db" | "clock">,
  query: QueryDefinition<I, R, C, O>,
  request: { actor: Actor; input: unknown },
): Promise<O> {
  const now = domain.clock?.() ?? new Date();

  authorizeActor(query.policy as Policy<never, never>, {
    actor: request.actor,
    now,
  });

  const input = parseInput(query.input, request.input);
  const loaded = await query.load({
    db: domain.db,
    actor: request.actor,
    input,
  });

  if (!loaded) {
    throw new AuthorizationError(query.policy.action, "not_found");
  }

  authorize(query.policy, {
    actor: request.actor,
    now,
    resource: loaded.resource,
    context: loaded.context,
  });

  return query.present({
    actor: request.actor,
    input,
    resource: loaded.resource,
    context: loaded.context,
  });
}
