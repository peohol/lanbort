import {
  chatRetentionProcess,
  executeCommand,
  purgeExpiredChat,
} from "@lanbort/domain";
import { route } from "@/server/http/route";

export const dynamic = "force-dynamic";

/**
 * Deletes chat ciphertext, key packages and link requests the delivery
 * service may no longer keep (ADR-0010 §8). Called by the scheduler with
 * the cron secret; safe to call repeatedly and concurrently.
 */
export const GET = route.scheduler(
  chatRetentionProcess,
  async ({ actor, domain, requestId }) =>
    Response.json(
      (
        await executeCommand(domain, purgeExpiredChat, {
          actor,
          input: {},
          correlationId: requestId,
        })
      ).output,
    ),
);
