import {
  executeCommand,
  lookAtSubscribedObjects,
  objectAvailabilityProcess,
} from "@lanbort/domain";
import { route } from "@/server/http/route";

export const dynamic = "force-dynamic";

/**
 * Looks at every subscribed object again and tells subscribers about those
 * that have become available, including through time alone (a return day
 * passing). Called by the scheduler with the cron secret; safe to call
 * repeatedly and concurrently.
 */
export const GET = route.scheduler(
  objectAvailabilityProcess,
  async ({ actor, domain, requestId }) =>
    Response.json(
      (
        await executeCommand(domain, lookAtSubscribedObjects, {
          actor,
          input: {},
          correlationId: requestId,
        })
      ).output,
    ),
);
