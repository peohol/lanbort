import { describe, expect, it } from "vitest";
import { emailAddressForms } from "./email-address";

describe("emailAddressForms", () => {
  it.each(["sikkerhet@lånbort.no", "sikkerhet@xn--lnbort-iua.no"])(
    "shows %s readably and links to its ASCII form",
    (address) => {
      expect(emailAddressForms(address)).toEqual({
        shown: "sikkerhet@lånbort.no",
        href: "mailto:sikkerhet@xn--lnbort-iua.no",
      });
    },
  );

  it("leaves a plain address as it is", () => {
    expect(emailAddressForms("someone@example.com")).toEqual({
      shown: "someone@example.com",
      href: "mailto:someone@example.com",
    });
  });
});
