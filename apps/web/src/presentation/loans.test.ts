import { loanEndReasonSchema } from "@lanbort/contracts";
import { describe, expect, it } from "vitest";
import { formatDesiredPeriod, loanEndReasonLabels } from "./loans";

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

describe("how a loan ended", () => {
  it("has its own words for every ending", () => {
    const labels = loanEndReasonSchema.options.map(
      (reason) => loanEndReasonLabels[reason],
    );
    expect(new Set(labels).size).toBe(loanEndReasonSchema.options.length);
  });

  it("never calls an administrative stop a cancellation (UX-EXC-007)", () => {
    expect(loanEndReasonLabels.stopped).not.toMatch(/avlyst|ikke gjennomført/i);
    expect(loanEndReasonLabels.stopped).toContain("plattformbegrensning");
  });
});
