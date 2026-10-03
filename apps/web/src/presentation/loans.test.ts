import { describe, expect, it } from "vitest";
import { formatDesiredPeriod } from "./loans";

describe("the time a request asks for", () => {
  it("says it as the borrower put it", () => {
    expect(
      formatDesiredPeriod({ kind: "asap" }, { kind: "duration", days: 1 }),
    ).toBe("Så snart som mulig i 1 dag");
    expect(
      formatDesiredPeriod(
        { kind: "date", date: "2026-10-03" },
        { kind: "date", date: "2026-10-05" },
      ),
    ).toBe("Fra lørdag 3. oktober til mandag 5. oktober");
  });
});
