import type { Database } from "@lanbort/database";
import type { Kysely } from "kysely";
import type { ConsumerRegistry } from "../outbox/consumer";
import { processOutboxBatch } from "../outbox/worker";

/**
 * Runs the outbox until nothing for `consumers` is due or being handled.
 * Test files run at once and share consumer names, so another file's worker
 * may hold this file's message; its claim is waited out (up to `ms`) rather
 * than taken for "nothing to do".
 */
export async function deliverAll(
  db: Kysely<Database>,
  consumers: ConsumerRegistry,
  ms = 10_000,
): Promise<void> {
  for (const until = Date.now() + ms; ;) {
    while (
      (await processOutboxBatch(db, consumers, { batchSize: 100 })).claimed
    );

    const held = await db
      .selectFrom("app.outbox_messages")
      .select("id")
      .where("status", "=", "pending")
      .where("lease_token", "is not", null)
      .where("consumer", "in", [...consumers.names])
      .limit(1)
      .executeTakeFirst();

    if (!held || Date.now() >= until) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
