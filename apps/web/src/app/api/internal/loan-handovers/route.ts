import {
  concludeHandovers,
  executeCommand,
  handoverProcess,
} from "@lanbort/domain";
import { route } from "@/server/http/route";

export const dynamic = "force-dynamic";

/**
 * Ends loans as not completed when a «not handed over» statement went
 * unanswered past its deadline (PS-LOAN-012). Called by the scheduler with
 * the cron secret; safe to call repeatedly and concurrently.
 */
export const GET = route.scheduler(
  handoverProcess,
  async ({ actor, domain, requestId }) =>
    Response.json(
      (
        await executeCommand(domain, concludeHandovers, {
          actor,
          input: {},
          correlationId: requestId,
        })
      ).output,
    ),
);
