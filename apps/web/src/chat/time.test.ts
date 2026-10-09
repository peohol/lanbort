import { describe, expect, it } from "vitest";
import { dayHeading, listTime, messageTime, sameDay } from "./time";

const now = new Date("2026-10-09T17:30:00Z"); // Friday 19:30 in Norway

describe("chat times", () => {
  it("shows a message's clock time in Norway", () => {
    expect(messageTime("2026-10-09T17:20:00Z")).toBe("19:20");
  });

  it("heads days as people say them", () => {
    expect(dayHeading("2026-10-09T05:00:00Z", now)).toBe("I dag");
    expect(dayHeading("2026-10-08T22:01:00Z", now)).toBe("I dag");
    expect(dayHeading("2026-10-08T12:00:00Z", now)).toBe("I går");
    expect(dayHeading("2026-10-02T12:00:00Z", now)).toBe("Fredag 2. oktober");
  });

  it("tells days apart in Norway, not in UTC", () => {
    expect(sameDay("2026-10-08T22:30:00Z", "2026-10-09T10:00:00Z")).toBe(true);
    expect(sameDay("2026-10-08T21:30:00Z", "2026-10-09T10:00:00Z")).toBe(false);
  });

  it("shortens the time in the list the further back it is", () => {
    expect(listTime("2026-10-09T17:20:00Z", now)).toBe("19:20");
    expect(listTime("2026-10-06T10:00:00Z", now)).toBe("tir.");
    expect(listTime("2026-09-28T10:00:00Z", now)).toBe("28. sep.");
  });
});
