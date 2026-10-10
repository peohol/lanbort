import type { CaseSummary } from "@lanbort/contracts";
import { describe, expect, it } from "vitest";
import {
  lookupOf,
  newPasskeyHref,
  parsePlatformQueue,
  platformQueueHref,
  stewardshipHref,
} from "@/navigation/stewardship";
import {
  passkeyCountText,
  queueCounts,
  queueCountsText,
  stewardHomeTask,
  stewardStanding,
} from "./stewardship";

const me = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";

const summary = (overrides: Partial<CaseSummary>): CaseSummary => ({
  id: "00000000-0000-4000-8000-0000000000aa",
  kind: "platform_report",
  status: "open",
  environmentId: null,
  loanId: null,
  openedAt: "2026-10-09T10:00:00.000Z",
  closedAt: null,
  handling: "queued",
  assigneeUserId: null,
  reportTarget: null,
  subjectUserId: null,
  title: null,
  participantUserIds: [],
  yourTurn: false,
  loanClarified: null,
  people: [],
  ...overrides,
});

const steward = (
  overrides: Partial<Parameters<typeof stewardStanding>[0]> = {},
) => ({
  passkeys: [{}, {}],
  minimum: 2,
  strong: true,
  ...overrides,
});

describe("stewardship", () => {
  it("opens steward actions only with two passkeys and a fresh confirmation", () => {
    expect(stewardStanding(steward({ passkeys: [] }))).toBe("setup");
    expect(stewardStanding(steward({ passkeys: [{}] }))).toBe("closed");
    expect(stewardStanding(steward({ strong: false }))).toBe("unconfirmed");
    expect(stewardStanding(steward())).toBe("confirmed");
  });

  it("counts open cases by who has them", () => {
    const counts = queueCounts(
      [
        summary({}),
        summary({ assigneeUserId: me }),
        summary({ assigneeUserId: other }),
        summary({}),
        summary({ status: "closed" }),
      ],
      me,
    );

    expect(counts).toEqual({ unassigned: 2, yours: 1, others: 1 });
    expect(queueCountsText(counts)).toBe(
      "2 som ingen har tatt · 1 du har · 1 andre har",
    );
    expect(queueCountsText({ unassigned: 0, yours: 0, others: 0 })).toBe(
      "Ingen saker venter",
    );
  });

  it("says how many passkeys there are and the limits", () => {
    expect(passkeyCountText(1, 2, 10)).toBe("1 aktiv · minst 2, høyst 10");
    expect(passkeyCountText(3, 2, 10)).toBe("3 aktive · minst 2, høyst 10");
  });

  it("gives Home the one step that opens the role, or the queue", () => {
    expect(stewardHomeTask("setup", null).href).toBe(newPasskeyHref);
    expect(stewardHomeTask("closed", null).href).toBe(newPasskeyHref);
    expect(stewardHomeTask("unconfirmed", null).href).toBe(stewardshipHref);
    expect(stewardHomeTask("confirmed", 3)).toEqual({
      text: "Behandle 3 plattformsaker",
      detail: "Ingen har tatt dem ennå",
      href: platformQueueHref(),
    });
    expect(stewardHomeTask("confirmed", 0).href).toBe(stewardshipHref);
  });

  it("round-trips the queue's filters through its address", () => {
    const href = platformQueueHref({ status: "closed", filter: "meldinger" });
    const params = Object.fromEntries(
      new URL(href, "https://lanbort.test").searchParams,
    );

    expect(href.startsWith(`${stewardshipHref}/ko?`)).toBe(true);
    expect(parsePlatformQueue(params)).toEqual({
      status: "closed",
      filter: "meldinger",
    });
    expect(parsePlatformQueue({ type: "toString" })).toEqual({
      status: "open",
      filter: undefined,
    });
    expect(platformQueueHref()).toBe(`${stewardshipHref}/ko`);
  });

  it("reads a full address or a page's link as a lookup, and nothing else (OD-0055)", () => {
    const id = "0f6a7c2e-3b1d-4e8f-9a2b-5c6d7e8f9a0b";

    expect(lookupOf("user", " Kari@Example.no ")).toEqual({
      by: "email",
      email: "kari@example.no",
    });
    expect(lookupOf("user", `https://www.lånbort.no/personer/${id}`)).toEqual({
      by: "person",
      userId: id,
    });
    expect(lookupOf("user", `/personer/${id}/utlaner`)).toEqual({
      by: "person",
      userId: id,
    });
    expect(lookupOf("object", `https://lanbort.no/ting/${id}?fra=x`)).toEqual({
      by: "object",
      objectId: id,
    });
    // No search: a name, part of an address or the wrong kind of page.
    for (const [kind, text] of [
      ["user", "Kari Nordmann"],
      ["user", "kari@"],
      ["user", `/ting/${id}`],
      ["object", `/personer/${id}`],
      ["object", "kari@example.no"],
      ["user", "/personer/ikke-en-id"],
    ] as const) {
      expect(lookupOf(kind, text)).toBeNull();
    }
  });
});
