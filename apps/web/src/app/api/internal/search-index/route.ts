import {
  executeCommand,
  reconcileSearchIndex,
  searchIndexProcess,
} from "@lanbort/domain";
import { route } from "@/server/http/route";

export const dynamic = "force-dynamic";

/**
 * Rebuilds the derived search index from the domain core, for changes that
 * record no event. Called by the scheduler with the cron secret; safe to
 * call repeatedly and concurrently.
 */
export const GET = route.scheduler(
  searchIndexProcess,
  async ({ actor, domain, requestId }) =>
    Response.json(
      (
        await executeCommand(domain, reconcileSearchIndex, {
          actor,
          input: {},
          correlationId: requestId,
        })
      ).output,
    ),
);
