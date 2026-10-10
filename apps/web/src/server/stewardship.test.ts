import { DomainError, listOwnPasskeys } from "@lanbort/domain";
import { afterEach, describe, expect, it, vi } from "vitest";

const pageQueryIfAllowed = vi.fn(async () => ({
  passkeys: [],
  minimum: 2,
  strong: false,
  confirmedAt: null,
}));

vi.mock("./session", () => ({
  pageQueryIfAllowed,
  pageQueryOrNotFound: vi.fn(async () => {
    throw new DomainError("stronger_authentication_required", "confirm");
  }),
}));

const { getStewardship, stewardPageQuery } = await import("./stewardship");

describe("a steward's standing on pages", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    pageQueryIfAllowed.mockClear();
  });

  it("is nobody's while stewards are off, so a steward sees the app as anyone else", async () => {
    vi.stubEnv("PLATFORM_STEWARDS_ENABLED", "false");

    expect(await getStewardship()).toBeNull();
    expect(pageQueryIfAllowed).not.toHaveBeenCalled();
  });

  it("is the steward's own once turned on", async () => {
    vi.stubEnv("PLATFORM_STEWARDS_ENABLED", "true");

    expect(await getStewardship()).toMatchObject({ minimum: 2, maximum: 10 });
  });

  it("asks for a passkey only while stewards are on, otherwise the page is not found", async () => {
    const page = () => stewardPageQuery(listOwnPasskeys, {});

    vi.stubEnv("PLATFORM_STEWARDS_ENABLED", "true");
    expect(await page()).toBe("confirm");

    vi.stubEnv("PLATFORM_STEWARDS_ENABLED", "false");
    await expect(page()).rejects.toMatchObject({
      digest: expect.stringContaining("404"),
    });
  });
});
