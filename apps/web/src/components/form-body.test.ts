import { describe, expect, it } from "vitest";
import { fillHref, formBody } from "./form-body";

describe("formBody", () => {
  it("nests dotted names, collects lists and leaves out empty text", () => {
    expect(
      formBody([
        { name: "start.kind", value: "date" },
        { name: "start.date", value: "2026-10-10" },
        { name: "end.days", value: 3 },
        { name: "message", value: "" },
        { name: "environmentIds[]", value: "a" },
        { name: "environmentIds[]", value: "b" },
        { name: "accepted", value: false },
      ]),
    ).toEqual({
      start: { kind: "date", date: "2026-10-10" },
      end: { days: 3 },
      environmentIds: ["a", "b"],
      accepted: false,
    });
  });

  it("keeps what the page decided over what the form holds", () => {
    expect(
      formBody([{ name: "objectId", value: "typed" }], { objectId: "page" }),
    ).toEqual({ objectId: "page" });
  });
});

describe("fillHref", () => {
  it("fills the template from the answer, encoded", () => {
    expect(fillHref("/lan/foresporsel/{requestId}", { requestId: "a b" })).toBe(
      "/lan/foresporsel/a%20b",
    );
    expect(fillHref("/mine-ting", null)).toBe("/mine-ting");
  });
});
