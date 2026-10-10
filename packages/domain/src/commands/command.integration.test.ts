import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { anonymousActor, type UserActor } from "../actor";
import { allow, definePolicy, deny } from "../authorization/policy";
import { requireActiveAccount, requireUser } from "../authorization/rules";
import { DomainError } from "../errors";
import { defineEvent } from "../events/catalog";
import { ConsumerRegistry, defineConsumer } from "../outbox/consumer";
import { createTestUser } from "../testing/actors";
import { connectTestDatabase } from "../testing/database";
import { defineCommand, type DomainContext, executeCommand } from "./command";

/**
 * WP-14: a representative idempotent command. It records one event per
 * execution, so a duplicate execution would show up as a duplicate event.
 */
const db = connectTestDatabase();
afterAll(() => db.destroy());

const markerRecorded = defineEvent({
  type: "test.marker_recorded",
  version: 1,
  kind: "domain",
  resourceType: "test_marker",
  payload: z.strictObject({ label: z.string().max(20) }),
});

const consumerName = "test.marker-observer";
const domain: DomainContext = {
  db,
  consumers: new ConsumerRegistry([
    defineConsumer({
      name: consumerName,
      eventTypes: [markerRecorded.type],
      handle: async () => {},
    }),
  ]),
};

let executions = 0;
let blocked = false;
let failAfterRecording = false;
let executionDelayMs = 0;

beforeEach(() => {
  executions = 0;
  blocked = false;
  failAfterRecording = false;
  executionDelayMs = 0;
});

const recordMarker = defineCommand({
  name: "test.record_marker",
  input: z.strictObject({ markerId: z.uuid(), label: z.string().max(20) }),
  output: z.strictObject({ markerId: z.uuid(), execution: z.number() }),
  policy: definePolicy<{ blocked: boolean }, void>({
    action: "test.record_marker",
    actor: [requireUser],
    resource: [
      ({ resource }) => (resource.blocked ? deny("forbidden") : allow),
    ],
  }),
  idempotency: "required",
  load: async ({ input }) =>
    input.label === "missing"
      ? null
      : { resource: { blocked }, context: undefined },
  execute: async ({ input, events }) => {
    executions += 1;
    const execution = executions;

    if (executionDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, executionDelayMs));
    }

    events.record(markerRecorded, {
      resourceId: input.markerId,
      payload: { label: input.label },
    });

    if (failAfterRecording) {
      throw new Error("simulated failure after the event was recorded");
    }

    return { markerId: input.markerId, execution };
  },
});

const user = (): Promise<UserActor> => createTestUser(db);

async function persisted(markerId: string) {
  const events = await db
    .selectFrom("app.audit_events")
    .select(["id", "actor_user_id", "correlation_id"])
    .where("resource_type", "=", "test_marker")
    .where("resource_id", "=", markerId)
    .execute();
  const outbox = await db
    .selectFrom("app.outbox_messages")
    .select(["consumer", "status"])
    .where(
      "event_id",
      "in",
      events.length ? events.map((event) => event.id) : [randomUUID()],
    )
    .execute();

  return { events, outbox };
}

async function storedKeys(key: string) {
  return db
    .selectFrom("app.idempotency_records")
    .select(["scope"])
    .where("idempotency_key", "=", key)
    .execute();
}

describe("command execution", () => {
  it("commits the change, its event and its outbox message together", async () => {
    const actor = await user();
    const markerId = randomUUID();

    const result = await executeCommand(domain, recordMarker, {
      actor,
      input: { markerId, label: "first" },
      idempotencyKey: randomUUID(),
      correlationId: "req-command-1",
    });

    expect(result).toEqual({
      output: { markerId, execution: 1 },
      replayed: false,
    });
    expect(await persisted(markerId)).toEqual({
      events: [
        {
          id: expect.any(String),
          actor_user_id: actor.userId,
          correlation_id: "req-command-1",
        },
      ],
      outbox: [{ consumer: consumerName, status: "pending" }],
    });
  });

  it("rolls back every write when the command fails after recording", async () => {
    failAfterRecording = true;
    const markerId = randomUUID();
    const key = randomUUID();

    await expect(
      executeCommand(domain, recordMarker, {
        actor: await user(),
        input: { markerId, label: "fails" },
        idempotencyKey: key,
      }),
    ).rejects.toThrow("simulated failure");

    expect(await persisted(markerId)).toEqual({ events: [], outbox: [] });
    expect(await storedKeys(key)).toEqual([]);
  });

  it("writes nothing when the policy denies, and a later retry may succeed", async () => {
    const actor = await user();
    const markerId = randomUUID();
    const key = randomUUID();
    const request = {
      actor,
      input: { markerId, label: "denied" },
      idempotencyKey: key,
    };

    blocked = true;
    await expect(
      executeCommand(domain, recordMarker, request),
    ).rejects.toMatchObject({
      code: "forbidden",
    });
    expect(executions).toBe(0);
    expect(await persisted(markerId)).toEqual({ events: [], outbox: [] });
    expect(await storedKeys(key)).toEqual([]);

    blocked = false;
    await expect(
      executeCommand(domain, recordMarker, request),
    ).resolves.toMatchObject({
      replayed: false,
    });
  });

  it("answers a missing resource exactly like a concealed one", async () => {
    await expect(
      executeCommand(domain, recordMarker, {
        actor: await user(),
        input: { markerId: randomUUID(), label: "missing" },
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("rejects invalid input by field name without echoing values", async () => {
    const error = await executeCommand(domain, recordMarker, {
      actor: await user(),
      input: {
        markerId: "not-a-uuid",
        label: "x",
        extra: "secret@example.com",
      },
      idempotencyKey: randomUUID(),
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(DomainError);
    expect(error).toMatchObject({ code: "invalid_input" });
    expect((error as DomainError).fields).toEqual(["markerId", "$"]);
    expect(JSON.stringify(error)).not.toContain("secret@example.com");
  });

  it("denies anonymous callers before anything is read", async () => {
    await expect(
      executeCommand(domain, recordMarker, {
        actor: anonymousActor,
        input: { markerId: randomUUID(), label: "anon" },
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });
});

describe("idempotent commands (WP-14)", () => {
  it("requires an idempotency key", async () => {
    await expect(
      executeCommand(domain, recordMarker, {
        actor: await user(),
        input: { markerId: randomUUID(), label: "no key" },
      }),
    ).rejects.toMatchObject({ code: "idempotency_key_required" });
  });

  it("does not execute a retried command twice and replays the first result", async () => {
    const actor = await user();
    const markerId = randomUUID();
    const request = {
      actor,
      input: { markerId, label: "retry" },
      idempotencyKey: randomUUID(),
    };

    const first = await executeCommand(domain, recordMarker, request);
    const retry = await executeCommand(domain, recordMarker, request);

    expect(retry).toEqual({ output: first.output, replayed: true });
    expect(executions).toBe(1);
    const { events, outbox } = await persisted(markerId);
    expect(events).toHaveLength(1);
    expect(outbox).toHaveLength(1);
  });

  it("replays a completed request that changed what its actor may do", async () => {
    const deactivateSelf = defineCommand({
      name: "test.deactivate_self",
      input: z.strictObject({}),
      output: z.strictObject({ done: z.boolean() }),
      policy: definePolicy<void, void>({
        action: "test.deactivate_self",
        actor: [requireActiveAccount],
      }),
      idempotency: "required",
      load: async () => ({ resource: undefined, context: undefined }),
      // Stands in for «Deaktiver kontoen»: the caller's session now carries
      // the inactive account.
      execute: async () => ({ done: true }),
    });
    const actor = await user();
    const request = { actor, input: {}, idempotencyKey: randomUUID() };
    await executeCommand(domain, deactivateSelf, request);

    // The response was lost; the retry comes from the now inactive account.
    const inactive: UserActor = { ...actor, accountStatus: "deactivated" };
    await expect(
      executeCommand(domain, deactivateSelf, { ...request, actor: inactive }),
    ).resolves.toEqual({ output: { done: true }, replayed: true });
    await expect(
      executeCommand(domain, deactivateSelf, {
        ...request,
        actor: inactive,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "account_inactive" });

    // Another account gets nothing from it.
    const other: UserActor = {
      ...(await user()),
      accountStatus: "deactivated",
    };
    await expect(
      executeCommand(domain, deactivateSelf, { ...request, actor: other }),
    ).rejects.toMatchObject({ code: "account_inactive" });
  });

  it("rejects the same key with different input instead of replaying", async () => {
    const actor = await user();
    const key = randomUUID();
    const markerId = randomUUID();

    await executeCommand(domain, recordMarker, {
      actor,
      input: { markerId, label: "original" },
      idempotencyKey: key,
    });

    await expect(
      executeCommand(domain, recordMarker, {
        actor,
        input: { markerId, label: "changed" },
        idempotencyKey: key,
      }),
    ).rejects.toMatchObject({ code: "idempotency_key_reused" });
    expect(executions).toBe(1);
  });

  it("executes concurrent duplicates exactly once", async () => {
    executionDelayMs = 150;
    const actor = await user();
    const markerId = randomUUID();
    const request = {
      actor,
      input: { markerId, label: "parallel" },
      idempotencyKey: randomUUID(),
    };

    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        executeCommand(domain, recordMarker, request),
      ),
    );

    expect(executions).toBe(1);
    expect(results.filter((result) => !result.replayed)).toHaveLength(1);
    expect(
      new Set(results.map((result) => JSON.stringify(result.output))).size,
    ).toBe(1);
    expect((await persisted(markerId)).events).toHaveLength(1);
  });

  it("never returns one actor's stored result to another actor", async () => {
    const key = randomUUID();
    const alice = await user();
    const mallory = await user();
    const aliceMarker = randomUUID();
    const malloryMarker = randomUUID();

    const aliceResult = await executeCommand(domain, recordMarker, {
      actor: alice,
      input: { markerId: aliceMarker, label: "alice" },
      idempotencyKey: key,
    });

    // Same key and even the same input: Mallory gets her own execution.
    const malloryResult = await executeCommand(domain, recordMarker, {
      actor: mallory,
      input: { markerId: aliceMarker, label: "alice" },
      idempotencyKey: key,
    });
    expect(malloryResult.replayed).toBe(false);
    expect(malloryResult.output.execution).not.toBe(
      aliceResult.output.execution,
    );

    const malloryOther = await executeCommand(domain, recordMarker, {
      actor: mallory,
      input: { markerId: malloryMarker, label: "mallory" },
      idempotencyKey: randomUUID(),
    });
    expect(malloryOther.output.markerId).toBe(malloryMarker);

    expect((await storedKeys(key)).map((row) => row.scope).sort()).toEqual(
      [`user:${alice.userId}`, `user:${mallory.userId}`].sort(),
    );
  });

  it("refuses keys on commands that do not support idempotency", async () => {
    const plain = defineCommand({ ...recordMarker, idempotency: "none" });

    await expect(
      executeCommand(domain, plain, {
        actor: await user(),
        input: { markerId: randomUUID(), label: "plain" },
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({
      code: "invalid_input",
      fields: ["idempotencyKey"],
    });
  });
});
