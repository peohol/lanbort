import { describe, expect, it } from "vitest";
import {
  type AdministratorRecord,
  mayResignAdministration,
} from "./continuity-store";

const admin = (
  userId: string,
  details: Partial<AdministratorRecord> = {},
): AdministratorRecord => ({
  userId,
  grantId: `grant-${userId}`,
  administratorSince: new Date("2026-10-01T00:00:00Z"),
  isOwner: false,
  canAct: true,
  ...details,
});

describe("resigning as administrator (PS-ENV-003)", () => {
  const owner = admin("owner", { isOwner: true });

  it("is for an administrator while another one remains", () => {
    expect(mayResignAdministration([owner, admin("a")], "a")).toBe(true);
    // Another administrator counts even when they cannot act now.
    expect(
      mayResignAdministration([admin("a"), admin("b", { canAct: false })], "a"),
    ).toBe(true);
  });

  it("is never for the owner, the last administrator or a non-administrator", () => {
    expect(mayResignAdministration([owner, admin("a")], "owner")).toBe(false);
    expect(mayResignAdministration([admin("a", { canAct: false })], "a")).toBe(
      false,
    );
    expect(mayResignAdministration([owner, admin("a")], "member")).toBe(false);
  });
});
