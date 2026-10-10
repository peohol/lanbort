import { describe, expect, it } from "vitest";
import {
  objectQuestionsHref,
  notificationLinkHref,
  personHref,
  personRoleHref,
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

describe("person addresses", () => {
  it("carry the role the person has where they are named (UX-PRIV-012)", () => {
    expect(personHref("abc")).toBe("/personer/abc");
    expect(personHref("abc", "borrower")).toBe("/personer/abc?rolle=laantaker");
    expect(personHref("abc", "lender")).toBe("/personer/abc?rolle=utlaaner");
    expect(personRoleHref("abc", "borrower")).toBe(
      "/personer/abc/som-laantaker",
    );
  });
});

describe("question addresses", () => {
  it("lead to the thing in the environment it was asked in, at its questions", () => {
    expect(objectQuestionsHref("o1", "e1", "q1")).toBe(
      "/ting/o1?miljo=e1#sporsmal-q1",
    );
    // An older question is on a later page of the list.
    expect(objectQuestionsHref("o1", "e1", "q1", 3)).toBe(
      "/ting/o1?miljo=e1&sporsmal=3#sporsmal-q1",
    );
  });
});
