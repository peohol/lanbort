import {
  authorizeActor,
  outboxWorkerProcess,
  processOutboxBatch,
  processOutboxPolicy,
} from "@lanbort/domain";
import { route } from "@/server/http/route";

export const dynamic = "force-dynamic";

/**
 * Drains due outbox messages (ADR-0004, ADR-0008). Called by the scheduler
 * with the cron secret; safe to call repeatedly and concurrently.
 */
export const GET = route.scheduler(
  outboxWorkerProcess,
  async ({ actor, domain }) => {
    authorizeActor(processOutboxPolicy, { actor, now: new Date() });

    return Response.json(await processOutboxBatch(domain.db, domain.consumers));
  },
);
