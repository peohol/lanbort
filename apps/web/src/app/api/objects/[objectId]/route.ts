import {
  executeCommand,
  executeQuery,
  getObject,
  updateObject,
} from "@lanbort/domain";
import {
  commandResponse,
  idempotencyKeyOf,
  readJsonWithParams,
} from "@/server/http/body";
import { route } from "@/server/http/route";

export const GET = route.user(async ({ params, actor, domain }) =>
  Response.json(
    await executeQuery(domain, getObject, {
      actor,
      input: { objectId: params.objectId },
    }),
  ),
);

/** Edits fields; refused with `conflict` if based on an old version. */
export const PATCH = route.user(
  async ({ request, requestId, params, actor, domain }) =>
    commandResponse(
      await executeCommand(domain, updateObject, {
        actor,
        input: await readJsonWithParams(request, {
          objectId: params.objectId,
        }),
        idempotencyKey: idempotencyKeyOf(request),
        correlationId: requestId,
      }),
    ),
);
