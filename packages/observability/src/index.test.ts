import { describe, expect, it, vi } from "vitest";
import { type SafeLogFields, serializeLog, writeLog } from "./index";

describe("structured logging baseline", () => {
  it("emits only the explicitly permitted operational fields", () => {
    const record = JSON.parse(
      serializeLog("info", "http.request.completed", {
        requestId: "req-1",
        route: "/api/health",
        method: "GET",
        statusCode: 200,
        durationMs: 4,
      }),
    ) as Record<string, unknown>;

    expect(record).toMatchObject({
      level: "info",
      event: "http.request.completed",
      requestId: "req-1",
      route: "/api/health",
      method: "GET",
      statusCode: 200,
      durationMs: 4,
    });
    expect(record).not.toHaveProperty("password");
    expect(record).not.toHaveProperty("token");
    expect(record).not.toHaveProperty("body");
  });

  it("drops fields outside the allowlist even when types are bypassed", () => {
    const untrusted = {
      requestId: "req-2",
      password: "hunter2",
      token: "secret-token",
      body: { email: "user@example.com" },
    } as unknown as SafeLogFields;

    const record = JSON.parse(
      serializeLog("info", "auth.attempt", untrusted),
    ) as Record<string, unknown>;

    expect(Object.keys(record).sort()).toEqual(
      ["event", "level", "requestId", "timestamp"].sort(),
    );
  });

  it("never logs query strings or fragments from routes", () => {
    const record = JSON.parse(
      serializeLog("info", "http.request.completed", {
        route: "/auth/callback?code=abc123&email=user@example.com#token",
      }),
    ) as Record<string, unknown>;

    expect(record.route).toBe("/auth/callback");
  });

  it("drops values that do not match the expected shape", () => {
    const malformed = {
      requestId: "contains spaces and user@example.com",
      method: "get; drop",
      statusCode: 99999,
      durationMs: -1,
      job: "x".repeat(500),
      attempt: 1.5,
    } as unknown as SafeLogFields;

    const record = JSON.parse(
      serializeLog("warn", "input.malformed", malformed),
    ) as Record<string, unknown>;

    expect(Object.keys(record).sort()).toEqual(
      ["event", "level", "timestamp"].sort(),
    );
  });

  it("rejects event names that could contain free-form user content", () => {
    expect(() =>
      serializeLog("error", "login failed for user@example.com"),
    ).toThrow("static machine identifiers");
  });

  it("writes one JSON line", () => {
    const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    try {
      writeLog("warn", "worker.retry", { job: "outbox", attempt: 2 });
      expect(write).toHaveBeenCalledTimes(1);
      expect(String(write.mock.calls[0]?.[0])).toMatch(
        /"event":"worker\.retry"/,
      );
    } finally {
      write.mockRestore();
    }
  });
});
