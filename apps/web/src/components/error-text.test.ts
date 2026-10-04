import { describe, expect, it } from "vitest";
import { fieldErrorProps } from "./error-text";

describe("fieldErrorProps", () => {
  it("marks the field when the error is about what was typed", () => {
    expect(fieldErrorProps("invalid_code", "feil")).toEqual({
      "aria-invalid": true,
      "aria-describedby": "feil",
    });
    expect(fieldErrorProps("invalid_input", "feil", "hjelp")).toEqual({
      "aria-invalid": true,
      "aria-describedby": "hjelp feil",
    });
  });

  it("leaves the field alone when the error is not about it", () => {
    for (const code of [null, "network", "rate_limited"] as const) {
      expect(fieldErrorProps(code, "feil")).toEqual({
        "aria-invalid": undefined,
        "aria-describedby": undefined,
      });
    }
    expect(fieldErrorProps("network", "feil", "hjelp")).toEqual({
      "aria-invalid": undefined,
      "aria-describedby": "hjelp",
    });
  });
});
