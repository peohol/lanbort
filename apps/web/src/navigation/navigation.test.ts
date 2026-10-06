import { describe, expect, it } from "vitest";
import { areaOf, areas } from "./areas";
import { hrefFor } from "./targets";

const id = "00000000-0000-4000-8000-000000000001";

describe("the five areas (UX-IA-001)", () => {
  it("are exactly Hjem, Finn, Lån, Mine ting and Samtaler, in order", () => {
    expect(areas.map(({ label }) => label)).toEqual([
      "Hjem",
      "Finn",
      "Lån",
      "Mine ting",
      "Samtaler",
    ]);
  });

  it("knows the area of a page and of what lies below it", () => {
    expect(areaOf("/")).toBe("home");
    expect(areaOf("/lan")).toBe("loans");
    expect(areaOf("/lan/noe")).toBe("loans");
    expect(areaOf("/lanbort")).toBeNull();
    expect(areaOf("/varsler")).toBeNull();
    expect(areaOf("/konto")).toBeNull();
  });
});

describe("where notifications and Home lead (UX-IA-002)", () => {
  it("leads to the entry in its context", () => {
    expect(hrefFor({ type: "loan", id })).toBe(`/lan/${id}`);
    expect(hrefFor({ type: "loan_request", id })).toBe(
      `/lan/foresporsel/${id}`,
    );
    expect(hrefFor({ type: "object_invitation", id })).toBe(
      `/mine-ting#invitasjon-${id}`,
    );
    expect(hrefFor({ type: "user", id })).toBe(`/personer/${id}`);
    expect(hrefFor({ type: "environment", id })).toBe(`/miljoer/${id}`);
  });

  it("leads nowhere while no page shows the target", () => {
    expect(hrefFor({ type: "object_subscription", id })).toBeNull();
  });
});
