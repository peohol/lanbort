import {
  executeCommand,
  expireTransitions,
  membershipTransitionProcess,
} from "@lanbort/domain";
import { route } from "@/server/http/route";

export const dynamic = "force-dynamic";

/**
 * Makes members passive whose transition deadline for new requirements has
 * passed (PS-ENV-006). Called by the scheduler with the cron secret; safe to
 * call repeatedly and concurrently.
 */
export const GET = route.scheduler(
  membershipTransitionProcess,
  async ({ actor, domain, requestId }) =>
    Response.json(
      (
        await executeCommand(domain, expireTransitions, {
          actor,
          input: {},
          correlationId: requestId,
        })
      ).output,
    ),
);
