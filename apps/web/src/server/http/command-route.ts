import {
  type CommandDefinition,
  executeCommand,
  executeQuery,
  type QueryDefinition,
} from "@lanbort/domain";
import { commandResponse, idempotencyKeyOf, readJsonWithParams } from "./body";
import { route } from "./route";

/**
 * A signed-in user's command with the JSON body and the path's dynamic
 * segments as input; the path wins. The command's own policy decides; the
 * route only passes the request through.
 */
export function userCommandRoute<I, R, C, O>(
  command: CommandDefinition<I, R, C, O>,
) {
  return route.user(async ({ request, requestId, params, actor, domain }) =>
    commandResponse(
      await executeCommand(domain, command, {
        actor,
        input: await readJsonWithParams(request, params),
        idempotencyKey: idempotencyKeyOf(request),
        correlationId: requestId,
      }),
    ),
  );
}

/**
 * A signed-in user's query with the URL's search parameters and the path's
 * dynamic segments as input; the path wins.
 */
export function userQueryRoute<I, R, C, O>(query: QueryDefinition<I, R, C, O>) {
  return route.user(async ({ request, params, actor, domain }) =>
    Response.json(
      await executeQuery(domain, query, {
        actor,
        input: {
          ...Object.fromEntries(request.nextUrl.searchParams),
          ...params,
        },
      }),
    ),
  );
}
