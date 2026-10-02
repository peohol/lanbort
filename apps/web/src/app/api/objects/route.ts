import {
  createObject,
  executeCommand,
  executeQuery,
  listOwnObjects,
} from "@lanbort/domain";
import {
  commandResponse,
  idempotencyKeyOf,
  readJson,
} from "@/server/http/body";
import { route } from "@/server/http/route";

/** The signed-in user's own objects ("Mine ting"). */
export const GET = route.user(async ({ actor, domain }) =>
  Response.json(
    await executeQuery(domain, listOwnObjects, { actor, input: {} }),
  ),
);

/** Creates a global object owned by the user (UX-JRN-003). */
export const POST = route.user(async ({ request, requestId, actor, domain }) =>
  commandResponse(
    await executeCommand(domain, createObject, {
      actor,
      input: await readJson(request),
      idempotencyKey: idempotencyKeyOf(request),
      correlationId: requestId,
    }),
  ),
);
