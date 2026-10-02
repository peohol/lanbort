import {
  concludeTypeChanges,
  executeCommand,
  typeChangeProcess,
} from "@lanbort/domain";
import { route } from "@/server/http/route";

export const dynamic = "force-dynamic";

/**
 * Decides proposed type changes whose deadline has passed (PS-ENV-008).
 * Called by the scheduler with the cron secret; safe to call repeatedly and
 * concurrently.
 */
export const GET = route.scheduler(
  typeChangeProcess,
  async ({ actor, domain, requestId }) =>
    Response.json(
      (
        await executeCommand(domain, concludeTypeChanges, {
          actor,
          input: {},
          correlationId: requestId,
        })
      ).output,
    ),
);
