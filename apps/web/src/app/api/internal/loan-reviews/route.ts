import {
  executeCommand,
  publishDueLoanReviews,
  reviewPublicationProcess,
} from "@lanbort/domain";
import { route } from "@/server/http/route";

export const dynamic = "force-dynamic";

/**
 * Publishes the reviews of windows whose 14 days are over (PS-TRUST-003).
 * Called by the scheduler with the cron secret; safe to call repeatedly and
 * concurrently.
 */
export const GET = route.scheduler(
  reviewPublicationProcess,
  async ({ actor, domain, requestId }) =>
    Response.json(
      (
        await executeCommand(domain, publishDueLoanReviews, {
          actor,
          input: {},
          correlationId: requestId,
        })
      ).output,
    ),
);
