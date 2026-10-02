import { restoreObject, executeCommand } from "@lanbort/domain";
import { commandResponse, idempotencyKeyOf } from "@/server/http/body";
import { route } from "@/server/http/route";

/** Brings an archived object back as it was. */
export const POST = route.user(
  async ({ request, requestId, params, actor, domain }) =>
    commandResponse(
      await executeCommand(domain, restoreObject, {
        actor,
        input: { objectId: params.objectId },
        idempotencyKey: idempotencyKeyOf(request),
        correlationId: requestId,
      }),
    ),
);
