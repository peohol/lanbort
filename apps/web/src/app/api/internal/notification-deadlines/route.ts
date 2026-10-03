import {
  executeCommand,
  notificationDeadlineProcess,
  notifyLoanDeadlines,
} from "@lanbort/domain";
import { route } from "@/server/http/route";

export const dynamic = "force-dynamic";

/**
 * Tells the parties of loans whose handover or return day has come or
 * passed. Called by the scheduler with the cron secret; safe to call
 * repeatedly and concurrently.
 */
export const GET = route.scheduler(
  notificationDeadlineProcess,
  async ({ actor, domain, requestId }) =>
    Response.json(
      (
        await executeCommand(domain, notifyLoanDeadlines, {
          actor,
          input: {},
          correlationId: requestId,
        })
      ).output,
    ),
);
