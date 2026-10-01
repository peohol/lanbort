import { describe, expect, it, vi } from "vitest";
import { serializeLog, writeLog } from "./index";

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
