import {
  executeCommand,
  purgeExpiredData,
  retentionProcess,
} from "@lanbort/domain";
import { route } from "@/server/http/route";

export const dynamic = "force-dynamic";

/**
 * Deletes what the pilot's retention policy no longer keeps (OD-0002):
 * old notifications, finished e-mail deliveries and outbox messages, stored
 * command results and the answers of ended memberships. Called by the
 * scheduler with the cron secret; safe to call repeatedly and concurrently.
 */
export const GET = route.scheduler(
  retentionProcess,
  async ({ actor, domain, requestId }) =>
    Response.json(
      (
        await executeCommand(domain, purgeExpiredData, {
          actor,
          input: {},
          correlationId: requestId,
        })
      ).output,
    ),
);
