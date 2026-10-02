import { archiveObject, executeCommand } from "@lanbort/domain";
import { commandResponse, idempotencyKeyOf } from "@/server/http/body";
import { route } from "@/server/http/route";

/** Reversible archive (PS-OBJ-016); nothing is deleted. */
export const POST = route.user(
  async ({ request, requestId, params, actor, domain }) =>
    commandResponse(
      await executeCommand(domain, archiveObject, {
        actor,
        input: { objectId: params.objectId },
        idempotencyKey: idempotencyKeyOf(request),
        correlationId: requestId,
      }),
    ),
);
