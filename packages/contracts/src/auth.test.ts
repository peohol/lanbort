import { describe, expect, it } from "vitest";
import { completeRegistrationSchema } from "./account";
import { requestEmailCodeSchema, verifyEmailCodeSchema } from "./auth";

describe("auth contracts", () => {
  it("normalizes e-mail addresses", () => {
    expect(
      requestEmailCodeSchema.parse({ email: "  Kari.Nordmann@Example.NO " }),
    ).toEqual({ email: "kari.nordmann@example.no" });
  });

  it("rejects malformed addresses and codes", () => {
    expect(requestEmailCodeSchema.safeParse({ email: "kari" }).success).toBe(
      false,
    );
    expect(
      verifyEmailCodeSchema.safeParse({
        email: "kari@example.no",
        code: "12ab56",
      }).success,
    ).toBe(false);
  });
});

describe("registration contract", () => {
  it("requires an explicit 18+ confirmation", () => {
    expect(
      completeRegistrationSchema.safeParse({
        realName: "Kari Nordmann",
        adultConfirmed: false,
      }).success,
    ).toBe(false);
  });

  it("trims the name and rejects empty or control characters", () => {
    expect(
      completeRegistrationSchema.parse({
        realName: "  Kari Nordmann ",
        adultConfirmed: true,
      }).realName,
    ).toBe("Kari Nordmann");
    for (const realName of ["   ", "Kari\u0000", "x".repeat(101)]) {
      expect(
        completeRegistrationSchema.safeParse({ realName, adultConfirmed: true })
          .success,
      ).toBe(false);
    }
  });
});
