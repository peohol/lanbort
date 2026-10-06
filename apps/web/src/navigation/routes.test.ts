import { describe, expect, it } from "vitest";
import {
  notificationLinkHref,
  registrationHref,
  returnPath,
  signInHref,
} from "./routes";

describe("returnPath", () => {
  it("keeps paths within Lånbort", () => {
    expect(returnPath("/")).toBe("/");
    expect(returnPath("/?varsel=abc")).toBe("/?varsel=abc");
    expect(returnPath("/lan/123")).toBe("/lan/123");
  });

  it("drops anything that could lead to another site", () => {
    for (const value of [
      undefined,
      ["/"],
      "",
      "lan",
      "https://example.com",
      "//example.com",
      "/\\example.com",
      "/\t/example.com",
      "/\n/example.com",
    ]) {
      expect(returnPath(value)).toBeUndefined();
    }
  });
});

describe("sign-in addresses", () => {
  it("carry a return path only when it is safe", () => {
    const back = notificationLinkHref("abc");
    expect(back).toBe("/?varsel=abc");
    expect(signInHref(back)).toBe("/logg-inn?neste=%2F%3Fvarsel%3Dabc");
    expect(registrationHref(back)).toBe(
      "/registrering?neste=%2F%3Fvarsel%3Dabc",
    );
    expect(signInHref("//example.com")).toBe("/logg-inn");
    expect(signInHref()).toBe("/logg-inn");
  });
});
