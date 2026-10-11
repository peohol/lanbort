import { DomainError, listOwnPasskeys } from "@lanbort/domain";
import { afterEach, describe, expect, it, vi } from "vitest";

const pageQueryIfAllowed = vi.fn(async () => ({
  passkeys: [],
  minimum: 2,
  strong: false,
  confirmedAt: null,
}));

const pageQueryOrNotFound = vi.fn(async (): Promise<unknown> => {
  throw new DomainError("stronger_authentication_required", "confirm");
});

vi.mock("./session", () => ({ pageQueryIfAllowed, pageQueryOrNotFound }));

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

  it("is not found for a case the steward may not handle, as for anyone else", async () => {
    vi.stubEnv("PLATFORM_STEWARDS_ENABLED", "true");

    for (const code of ["conflict_of_interest", "account_inactive"] as const) {
      pageQueryOrNotFound.mockRejectedValueOnce(new DomainError(code, code));
      await expect(stewardPageQuery(listOwnPasskeys, {})).rejects.toMatchObject(
        { digest: expect.stringContaining("404") },
      );
    }
  });
});
