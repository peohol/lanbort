import type { MeasureNotice } from "@lanbort/contracts";
import { describe, expect, it } from "vitest";
import {
  measureNoticeEffect,
  measureNoticeHeading,
  measureNoticeLabel,
} from "./measure-notice";

const notice = (overrides: Partial<MeasureNotice>): MeasureNotice => ({
  id: "00000000-0000-4000-8000-0000000000aa",
  kind: "publication_blocked",
  scope: "environment",
  environmentId: "00000000-0000-4000-8000-0000000000e1",
  objectId: "00000000-0000-4000-8000-0000000000b1",
  objectTitle: "Gassflaske 11 kg",
  loanId: null,
  dimension: null,
  reason: "Fylt gassflaske står på listen.",
  decidedAt: "2026-10-09T14:05:00.000Z",
  ...overrides,
});

describe("the notice to whoever a measure hits (PS-TRUST-018)", () => {
  it("says what was done and where it applies", () => {
    const blocked = notice({});

    expect(measureNoticeLabel(blocked, "Borettslaget Lia")).toBe(
      "Sperret i Borettslaget Lia",
    );
    expect(measureNoticeHeading(blocked, "Borettslaget Lia")).toBe(
      "Publiseringen er sperret i Borettslaget Lia",
    );
    expect(measureNoticeEffect(blocked, "Borettslaget Lia")).toContain(
      "Andre steder gjelder det ikke",
    );
  });

  it("names the environment plainly when the reader no longer sees its name", () => {
    expect(measureNoticeHeading(notice({}), null)).toBe(
      "Publiseringen er sperret i miljøet",
    );
  });

  it("names the score a removed one was", () => {
    expect(
      measureNoticeHeading(
        notice({
          kind: "review_score_removed",
          scope: "platform",
          environmentId: null,
          objectId: null,
          objectTitle: null,
          dimension: "communication",
        }),
        null,
      ),
    ).toBe("Vurderingen «Kommunikasjon» er fjernet");
  });
});
