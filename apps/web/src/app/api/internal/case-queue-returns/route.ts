import {
  executeCommand,
  notificationCaseQueueProcess,
  notifyCaseQueueReturns,
} from "@lanbort/domain";
import { route } from "@/server/http/route";

export const dynamic = "force-dynamic";

/**
 * Tells handlers about cases the database returned to the queue by itself.
 * Called by the scheduler with the cron secret; safe to call repeatedly and
 * concurrently.
 */
export const GET = route.scheduler(
  notificationCaseQueueProcess,
  async ({ actor, domain, requestId }) =>
    Response.json(
      (
        await executeCommand(domain, notifyCaseQueueReturns, {
          actor,
          input: {},
          correlationId: requestId,
        })
      ).output,
    ),
);
