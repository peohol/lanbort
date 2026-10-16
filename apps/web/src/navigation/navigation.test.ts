import { describe, expect, it } from "vitest";
import { areaOf, areas, layerOf } from "./areas";
import { chatDevicesHref, isChatPage } from "./chat";
import { needsOwnDocument } from "./headers";
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
    expect(hrefFor({ type: "loan_reviews", id })).toBe(
      `/lan/${id}#anmeldelser`,
    );
  });

  it("leads nowhere while no page shows the target", () => {
    expect(hrefFor({ type: "object_subscription", id })).toBeNull();
  });
});

describe("the chat pages (ADR-0010 §13)", () => {
  it("are Samtaler and Mine enheter in Konto, with what lies below them", () => {
    for (const path of [
      "/samtaler",
      "/samtaler/abc",
      chatDevicesHref,
      `${chatDevicesHref}/koble`,
    ]) {
      expect(isChatPage(path)).toBe(true);
    }
    expect(layerOf(chatDevicesHref)).toBe("account");
    for (const path of ["/konto", "/konto/venner", "/samtalerx", "/"]) {
      expect(isChatPage(path)).toBe(false);
    }
  });
});

describe("pages loaded as a new document (ADR-0010 §13)", () => {
  it("are those across the chat pages' headers, outside the layers", () => {
    expect(needsOwnDocument("/samtaler", "/mine-ting")).toBe(true);
    expect(needsOwnDocument("/samtaler/abc", "/")).toBe(true);
    expect(needsOwnDocument("/", "/samtaler")).toBe(true);
    expect(needsOwnDocument("/ting/abc", "/samtaler/abc")).toBe(true);
  });

  it("are not those with the same headers, or opened in a layer", () => {
    expect(needsOwnDocument("/lan", "/mine-ting")).toBe(false);
    expect(needsOwnDocument("/samtaler/abc", "/samtaler")).toBe(false);
    // A layer keeps the page under it; Mine enheter is reloaded by chat.
    expect(needsOwnDocument("/konto", "/samtaler")).toBe(false);
    expect(needsOwnDocument(chatDevicesHref, "/")).toBe(false);
  });
});
