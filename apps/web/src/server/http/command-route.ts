import {
  type CommandDefinition,
  executeCommand,
  executeQuery,
  type QueryDefinition,
} from "@lanbort/domain";
import { commandResponse, idempotencyKeyOf, readJson } from "./body";
import { route } from "./route";

/**
 * A signed-in user's command with the JSON body as input. The command's own
 * policy decides; the route only passes the request through.
 */
export function userCommandRoute<I, R, C, O>(
  command: CommandDefinition<I, R, C, O>,
) {
  return route.user(async ({ request, requestId, actor, domain }) =>
    commandResponse(
      await executeCommand(domain, command, {
        actor,
        input: await readJson(request),
        idempotencyKey: idempotencyKeyOf(request),
        correlationId: requestId,
      }),
    ),
  );
}

/** A signed-in user's query with the URL's search parameters as input. */
export function userQueryRoute<I, R, C, O>(query: QueryDefinition<I, R, C, O>) {
  return route.user(async ({ request, actor, domain }) =>
    Response.json(
      await executeQuery(domain, query, {
        actor,
        input: Object.fromEntries(request.nextUrl.searchParams),
      }),
    ),
  );
}
