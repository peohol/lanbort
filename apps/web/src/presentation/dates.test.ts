import { describe, expect, it } from "vitest";
import {
  formatDay,
  formatPeriod,
  formatShortPeriod,
  formatTime,
} from "./dates";

describe("dates as people say them", () => {
  it("keeps a calendar date's day whatever the server's time zone", () => {
    expect(formatDay("2026-10-03")).toBe("lørdag 3. oktober");
  });

  it("shows moments in Norwegian time", () => {
    // 22:30 UTC is already Sunday in Oslo (summer time ends 25 October).
    expect(formatTime("2026-10-03T22:30:00.000Z")).toBe(
      "søndag 4. oktober kl. 00:30",
    );
  });

  it("names a one-day period once", () => {
    expect(formatPeriod({ start: "2026-10-03", end: "2026-10-03" })).toBe(
      "lørdag 3. oktober",
    );
    expect(formatPeriod({ start: "2026-10-03", end: "2026-10-04" })).toBe(
      "lørdag 3. oktober – søndag 4. oktober",
    );
  });
});

describe("a period on a button", () => {
  it("says the month once when it is the same", () => {
    expect(formatShortPeriod({ start: "2026-10-10", end: "2026-10-12" })).toBe(
      "10.–12. oktober",
    );
    expect(formatShortPeriod({ start: "2026-09-30", end: "2026-10-02" })).toBe(
      "30. september–2. oktober",
    );
    expect(formatShortPeriod({ start: "2026-10-10", end: "2026-10-10" })).toBe(
      "10. oktober",
    );
  });
});
