import { randomUUID } from "node:crypto";
import { sql } from "kysely";
import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { systemActor } from "../actor";
import { allow, definePolicy } from "../authorization/policy";
import { requireUser } from "../authorization/rules";
import {
  defineCommand,
  type DomainContext,
  executeCommand,
} from "../commands/command";
import { defineQuery, executeQuery } from "../commands/query";
import { ConsumerRegistry } from "../outbox/consumer";
import { createTestUser } from "../testing/actors";
import { connectTestDatabase } from "../testing/database";
import {
  consumeRateLimit,
  type RateLimit,
  RateLimitedError,
} from "./rate-limits";

/** WP-73: limits are shared, count refused work, and never store a subject. */
const db = connectTestDatabase();
afterAll(() => db.destroy());

const start = new Date("2026-10-04T12:00:00Z");
let now = start;
const domain: DomainContext = {
  db,
  consumers: new ConsumerRegistry([]),
  clock: () => now,
};

/** A rule of its own per test, so tests never share a budget. */
const testRule = (limit: number, windowSeconds = 60): RateLimit => ({
  rule: `test_${randomUUID().replaceAll("-", "")}`,
  limit,
  windowSeconds,
});

async function outcome(work: Promise<unknown>) {
  try {
    await work;
    return "allowed";
  } catch (error) {
    if (error instanceof RateLimitedError) {
      return `wait ${error.retryAfterSeconds}`;
    }

    throw error;
  }
}

describe("consumeRateLimit", () => {
  it("allows a burst up to the limit, then one use per share of the window", async () => {
    const rule = testRule(3, 60);
    const use = () => outcome(consumeRateLimit(domain, rule, "user:a"));
    now = start;

    expect([await use(), await use(), await use(), await use()]).toEqual([
      "allowed",
      "allowed",
      "allowed",
      "wait 20",
    ]);

    // A refused use is not counted: the wait does not grow.
    now = new Date(start.getTime() + 10_000);
    expect(await use()).toBe("wait 10");

    now = new Date(start.getTime() + 20_000);
    expect([await use(), await use()]).toEqual(["allowed", "wait 20"]);

    // The whole budget is back one window after the last use.
    now = new Date(start.getTime() + 80_000);
    expect([await use(), await use(), await use(), await use()]).toEqual([
      "allowed",
      "allowed",
      "allowed",
      "wait 20",
    ]);
  });

  it("keeps rules and subjects apart", async () => {
    const rule = testRule(1);
    const other = testRule(1);
    now = start;

    expect(
      await outcome(consumeRateLimit(domain, rule, "email:a@x.test")),
    ).toBe("allowed");
    expect(
      await outcome(consumeRateLimit(domain, rule, "email:a@x.test")),
    ).toBe("wait 60");
    expect(
      await outcome(consumeRateLimit(domain, rule, "email:b@x.test")),
    ).toBe("allowed");
    expect(
      await outcome(consumeRateLimit(domain, other, "email:a@x.test")),
    ).toBe("allowed");
  });

  it("stores neither the subject nor anything that outlives the limit", async () => {
    const rule = testRule(2, 60);
    const subject = `email:${randomUUID()}@example.test`;
    now = start;
    await consumeRateLimit(domain, rule, subject);

    const rows = await sql<{ row: string }>`
      select row_to_json(limits)::text as row
      from app.rate_limits as limits
      where rule = ${rule.rule}
    `.execute(db);
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]?.row).not.toContain(subject.slice(6, 20));

    // Once the subject's whole budget is back, the next use removes the row.
    now = new Date(start.getTime() + 31_000);
    await consumeRateLimit(domain, testRule(1), "user:someone-else");
    const left = await db
      .selectFrom("app.rate_limits")
      .select("rule")
      .where("rule", "=", rule.rule)
      .execute();
    expect(left).toEqual([]);
  });

  it("counts every one of many simultaneous uses exactly once", async () => {
    const rule = testRule(5, 3600);
    now = start;

    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        outcome(consumeRateLimit(domain, rule, "client:203.0.113.9")),
      ),
    );

    expect(results.filter((result) => result === "allowed")).toHaveLength(5);
  });
});

describe("limited commands and queries", () => {
  const commandRule = testRule(2, 3600);
  let executions = 0;

  // Always not found: probing for things one may not see costs budget too.
  const probe = defineCommand({
    name: "test.probe_something",
    input: z.strictObject({ id: z.uuid() }),
    output: z.strictObject({}),
    policy: definePolicy<void, void>({
      action: "test.probe_something",
      actor: [requireUser],
      resource: [() => allow],
    }),
    idempotency: "none",
    rateLimit: commandRule,
    load: async () => null,
    execute: async () => {
      executions += 1;
      return {};
    },
  });

  it("counts refused and invalid attempts, and refuses before reading anything", async () => {
    const actor = await createTestUser(db);
    now = start;
    const attempt = (input: unknown) =>
      outcome(executeCommand(domain, probe, { actor, input }));

    await expect(
      executeCommand(domain, probe, { actor, input: { id: randomUUID() } }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      executeCommand(domain, probe, { actor, input: { id: "nonsense" } }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    expect(await attempt({ id: randomUUID() })).toBe("wait 1800");
    expect(executions).toBe(0);

    // Another user has a budget of their own.
    const other = await createTestUser(db);
    await expect(
      executeCommand(domain, probe, {
        actor: other,
        input: { id: randomUUID() },
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("replays a completed request however much budget is left", async () => {
    const note = defineCommand({
      name: "test.note_something",
      input: z.strictObject({}),
      output: z.strictObject({ noted: z.number() }),
      policy: definePolicy<void, void>({
        action: "test.note_something",
        actor: [requireUser],
        resource: [() => allow],
      }),
      idempotency: "required",
      rateLimit: testRule(1, 3600),
      load: async () => ({ resource: undefined, context: undefined }),
      execute: async () => {
        executions += 1;
        return { noted: executions };
      },
    });
    const actor = await createTestUser(db);
    const idempotencyKey = randomUUID();
    now = start;
    executions = 0;

    const first = await executeCommand(domain, note, {
      actor,
      input: {},
      idempotencyKey,
    });
    const retry = await executeCommand(domain, note, {
      actor,
      input: {},
      idempotencyKey,
    });

    expect(retry).toEqual({ output: first.output, replayed: true });
    expect(
      await outcome(
        executeCommand(domain, note, {
          actor,
          input: {},
          idempotencyKey: randomUUID(),
        }),
      ),
    ).toBe("wait 3600");
    expect(executions).toBe(1);
  });

  it("leaves scheduled jobs unlimited", async () => {
    now = start;
    const job = systemActor("test.rate_limits");

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(
        executeCommand(domain, probe, { actor: job, input: { id: "x" } }),
      ).rejects.not.toBeInstanceOf(RateLimitedError);
    }
  });

  it("limits queries the same way", async () => {
    const lookup = defineQuery({
      name: "test.look_up",
      input: z.strictObject({}),
      policy: definePolicy<void, void>({
        action: "test.look_up",
        actor: [requireUser],
        resource: [() => allow],
      }),
      rateLimit: testRule(1, 60),
      load: async () => ({ resource: undefined, context: undefined }),
      present: () => ({ found: true }),
    });
    const actor = await createTestUser(db);
    now = start;

    expect(await executeQuery(domain, lookup, { actor, input: {} })).toEqual({
      found: true,
    });
    expect(
      await outcome(executeQuery(domain, lookup, { actor, input: {} })),
    ).toBe("wait 60");
  });
});
