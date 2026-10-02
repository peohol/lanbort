import { randomUUID } from "node:crypto";
import { sql } from "kysely";
import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { systemActor } from "../actor";
import { defineEvent } from "../events/catalog";
import { EventRecorder, writeEvents } from "../events/recorder";
import { connectTestDatabase } from "../testing/database";
import {
  ConsumerRegistry,
  defineConsumer,
  type OutboxDelivery,
  OutboxDeliveryError,
} from "./consumer";
import { processOutboxBatch } from "./worker";

const db = connectTestDatabase();
afterAll(() => db.destroy());

const pinged = defineEvent({
  type: "test.pinged",
  version: 1,
  kind: "domain",
  resourceType: "test_ping",
  payload: z.strictObject({ sequence: z.number().int() }),
});

type Handler = (delivery: OutboxDelivery) => Promise<void>;

/** A consumer with a unique name, so parallel test files never interfere. */
function testConsumer(handler: Handler) {
  const deliveries: OutboxDelivery[] = [];
  const consumer = defineConsumer({
    name: `test.${randomUUID()}`,
    eventTypes: [pinged.type],
    handle: async (delivery) => {
      deliveries.push(delivery);
      await handler(delivery);
    },
  });

  return { consumer, deliveries };
}

/** Commits `count` events in one transaction, fanned out to `registry`. */
async function commitPings(registry: ConsumerRegistry, count = 1) {
  const resourceId = randomUUID();

  await db.transaction().execute(async (tx) => {
    const recorder = new EventRecorder();

    for (let sequence = 0; sequence < count; sequence += 1) {
      recorder.record(pinged, { resourceId, payload: { sequence } });
    }

    await writeEvents(tx, recorder, {
      actor: systemActor("test.outbox"),
      correlationId: null,
      consumers: registry,
    });
  });

  return resourceId;
}

async function messagesOf(consumer: string) {
  return db
    .selectFrom("app.outbox_messages")
    .select([
      "id",
      "status",
      "attempts",
      "last_error",
      "lease_token",
      "finished_at",
    ])
    .where("consumer", "=", consumer)
    .orderBy("created_at")
    .execute();
}

async function makeDue(consumer: string) {
  await db
    .updateTable("app.outbox_messages")
    .set({ available_at: sql<Date>`now() - interval '1 second'` })
    .where("consumer", "=", consumer)
    .where("status", "=", "pending")
    .execute();
}

const ok: Handler = async () => {};

describe("outbox worker (WP-13)", () => {
  it("delivers committed events and marks them as succeeded", async () => {
    const { consumer, deliveries } = testConsumer(ok);
    const registry = new ConsumerRegistry([consumer]);
    const resourceId = await commitPings(registry);

    const result = await processOutboxBatch(db, registry);

    expect(result).toMatchObject({ claimed: 1, succeeded: 1 });
    expect(deliveries).toEqual([
      {
        messageId: expect.any(String),
        attempt: 1,
        event: expect.objectContaining({
          type: "test.pinged",
          version: 1,
          resourceType: "test_ping",
          resourceId,
          payload: { sequence: 0 },
        }),
      },
    ]);
    expect(await messagesOf(consumer.name)).toEqual([
      expect.objectContaining({
        status: "succeeded",
        attempts: 1,
        lease_token: null,
        finished_at: expect.any(Date),
      }),
    ]);
  });

  it("retries a failed side effect later without touching the committed event", async () => {
    let failNext = true;
    const flaky = testConsumer(async () => {
      if (failNext) {
        failNext = false;
        throw new Error("provider timeout with possibly sensitive details");
      }
    });
    const steady = testConsumer(ok);
    const registry = new ConsumerRegistry([flaky.consumer, steady.consumer]);
    const resourceId = await commitPings(registry);

    const first = await processOutboxBatch(db, registry);
    expect(first).toMatchObject({ claimed: 2, succeeded: 1, retried: 1 });

    const [failed] = await messagesOf(flaky.consumer.name);
    expect(failed).toMatchObject({
      status: "pending",
      attempts: 1,
      // Only a machine code is stored, never the error message.
      last_error: "unexpected_error",
    });
    expect((await messagesOf(steady.consumer.name))[0]?.status).toBe(
      "succeeded",
    );

    // Not due yet: a new run leaves it alone.
    expect(await processOutboxBatch(db, registry)).toMatchObject({
      claimed: 0,
    });

    await makeDue(flaky.consumer.name);
    expect(await processOutboxBatch(db, registry)).toMatchObject({
      claimed: 1,
      succeeded: 1,
    });

    // Same message id on every attempt, so the consumer can deduplicate.
    expect(flaky.deliveries.map((delivery) => delivery.attempt)).toEqual([
      1, 2,
    ]);
    expect(new Set(flaky.deliveries.map((d) => d.messageId)).size).toBe(1);
    expect(steady.deliveries).toHaveLength(1);

    const events = await db
      .selectFrom("app.audit_events")
      .select("id")
      .where("resource_type", "=", "test_ping")
      .where("resource_id", "=", resourceId)
      .execute();
    expect(events).toHaveLength(1);
  });

  it("parks a message as dead after the last attempt", async () => {
    const { consumer } = testConsumer(async () => {
      throw new OutboxDeliveryError("provider_unavailable");
    });
    const registry = new ConsumerRegistry([consumer]);
    await commitPings(registry);

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await makeDue(consumer.name);
      await processOutboxBatch(db, registry, { maxAttempts: 3 });
    }

    expect(await messagesOf(consumer.name)).toEqual([
      expect.objectContaining({
        status: "dead",
        attempts: 3,
        last_error: "provider_unavailable",
        finished_at: expect.any(Date),
      }),
    ]);

    await makeDue(consumer.name);
    expect(await processOutboxBatch(db, registry)).toMatchObject({
      claimed: 0,
    });
  });

  it("does not retry permanent failures", async () => {
    const { consumer } = testConsumer(async () => {
      throw new OutboxDeliveryError("recipient_rejected", true);
    });
    const registry = new ConsumerRegistry([consumer]);
    await commitPings(registry);

    expect(await processOutboxBatch(db, registry)).toMatchObject({ dead: 1 });
    expect((await messagesOf(consumer.name))[0]).toMatchObject({
      status: "dead",
      attempts: 1,
    });
  });

  it("reclaims a message whose worker died while holding the lease", async () => {
    const { consumer, deliveries } = testConsumer(ok);
    const registry = new ConsumerRegistry([consumer]);
    await commitPings(registry);

    // Simulate a crashed worker: claimed, then never settled.
    const staleLease = randomUUID();
    await db
      .updateTable("app.outbox_messages")
      .set({
        lease_token: staleLease,
        attempts: 1,
        available_at: sql<Date>`now() + interval '1 hour'`,
      })
      .where("consumer", "=", consumer.name)
      .execute();

    expect(await processOutboxBatch(db, registry)).toMatchObject({
      claimed: 0,
    });

    await makeDue(consumer.name);
    expect(await processOutboxBatch(db, registry)).toMatchObject({
      succeeded: 1,
    });
    expect(deliveries[0]?.attempt).toBe(2);
  });

  it("never hands the same message to two concurrent workers", async () => {
    const { consumer, deliveries } = testConsumer(
      () => new Promise((resolve) => setTimeout(resolve, 20)),
    );
    const registry = new ConsumerRegistry([consumer]);
    await commitPings(registry, 12);

    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        processOutboxBatch(db, registry, { batchSize: 5 }),
      ),
    );
    // Whatever the first round left behind is picked up by a final run.
    results.push(await processOutboxBatch(db, registry));

    expect(results.reduce((sum, result) => sum + result.succeeded, 0)).toBe(12);
    expect(new Set(deliveries.map((delivery) => delivery.messageId)).size).toBe(
      12,
    );
    expect(deliveries).toHaveLength(12);
  });

  it("only claims messages for consumers it can run", async () => {
    const mine = testConsumer(ok);
    const theirs = testConsumer(ok);
    await commitPings(new ConsumerRegistry([mine.consumer, theirs.consumer]));

    await processOutboxBatch(db, new ConsumerRegistry([mine.consumer]));

    expect((await messagesOf(theirs.consumer.name))[0]).toMatchObject({
      status: "pending",
      attempts: 0,
    });
  });
});
