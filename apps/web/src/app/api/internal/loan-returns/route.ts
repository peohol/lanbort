import {
  concludeReturns,
  executeCommand,
  returnProcess,
} from "@lanbort/domain";
import { route } from "@/server/http/route";

export const dynamic = "force-dynamic";

/**
 * Makes return confirmations whose 30-second undo buffer is over
 * (PS-LOAN-016). Called by the scheduler with the cron secret; safe to call
 * repeatedly and concurrently.
 */
export const GET = route.scheduler(
  returnProcess,
  async ({ actor, domain, requestId }) =>
    Response.json(
      (
        await executeCommand(domain, concludeReturns, {
          actor,
          input: {},
          correlationId: requestId,
        })
      ).output,
    ),
);
