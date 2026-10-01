import { completeRegistration, executeCommand } from "@lanbort/domain";
import {
  commandResponse,
  idempotencyKeyOf,
  readJson,
} from "@/server/http/body";
import { route } from "@/server/http/route";

/** UX-JRN-001 step 3: real name and 18+ confirmation. */
export const POST = route.user(async ({ request, requestId, actor, domain }) =>
  commandResponse(
    await executeCommand(domain, completeRegistration, {
      actor,
      input: await readJson(request),
      idempotencyKey: idempotencyKeyOf(request),
      correlationId: requestId,
    }),
  ),
);
