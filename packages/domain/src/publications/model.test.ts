import { publicationStatusSchema } from "@lanbort/contracts";
import { describe, expect, it } from "vitest";
import { isLive, liveStatusIn, publicationGate } from "./model";

const statuses = publicationStatusSchema.options;
const active = { state: "active" } as const;

describe("liveStatusIn", () => {
  it("waits for approval only while the environment requires it (PS-ENV-011)", () => {
    expect(liveStatusIn({ requiresObjectApproval: true })).toBe("pending");
    expect(liveStatusIn({ requiresObjectApproval: false })).toBe("active");
  });
});

describe("isLive", () => {
  it("counts only pending and active publications", () => {
    expect(statuses.filter(isLive)).toEqual(["pending", "active"]);
  });
});

describe("publicationGate", () => {
  it("opens new loan requests only through an active publication", () => {
    expect(
      Object.fromEntries(
        statuses.map((status) => [
          status,
          publicationGate({
            environment: active,
            status,
            ownerHasAccess: true,
          }),
        ]),
      ),
    ).toEqual({
      pending: "on_hold",
      active: "open",
      rejected: "closed",
      blocked: "closed",
      unpublished: "closed",
    });
  });

  it("is closed without a publication", () => {
    expect(
      publicationGate({
        environment: active,
        status: null,
        ownerHasAccess: true,
      }),
    ).toBe("closed");
  });

  it("is closed once no owner has active access, before anything records it", () => {
    for (const status of ["pending", "active"] as const) {
      expect(
        publicationGate({ environment: active, status, ownerHasAccess: false }),
      ).toBe("closed");
    }
  });

  it("is closed while the environment winds down (PS-ENV-012)", () => {
    expect(
      publicationGate({
        environment: { state: "winding_down" },
        status: "active",
        ownerHasAccess: true,
      }),
    ).toBe("closed");
  });
});
