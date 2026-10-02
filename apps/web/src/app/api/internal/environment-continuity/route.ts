import {
  continuityProcess,
  executeCommand,
  settleContinuity,
} from "@lanbort/domain";
import { route } from "@/server/http/route";

export const dynamic = "force-dynamic";

/**
 * Resolves ownership vacancies whose claim period has ended and settles
 * wind-downs that have become final (PS-ENV-012–013). Called by the
 * scheduler with the cron secret; safe to call repeatedly and concurrently.
 */
export const GET = route.scheduler(
  continuityProcess,
  async ({ actor, domain, requestId }) =>
    Response.json(
      (
        await executeCommand(domain, settleContinuity, {
          actor,
          input: {},
          correlationId: requestId,
        })
      ).output,
    ),
);
