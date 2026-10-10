import type { CaseSubjectAccount } from "@lanbort/contracts";
import { describe, expect, it } from "vitest";
import {
  interventionBySlug,
  interventionHref,
  interventionSlugs,
} from "@/navigation/stewardship";
import {
  interventionFlowKeys,
  interventionFlows,
  interventionStanding,
  subjectOf,
} from "./interventions";

const userId = "00000000-0000-4000-8000-000000000001";
const environmentId = "00000000-0000-4000-8000-000000000002";

const subject = (account: Partial<CaseSubjectAccount>) =>
  subjectOf([{ userId, realName: "Tor Rapportert" }], {
    userId,
    status: "active",
    roles: [],
    bindings: [],
    ...account,
  });

/** The choices a steward sees, and whether each can be taken. */
const choices = (account: Partial<CaseSubjectAccount>) =>
  Object.fromEntries(
    interventionFlowKeys.flatMap((key) => {
      const standing = interventionStanding(key, subject(account));
      return standing.shown ? [[key, standing.blocked]] : [];
    }),
  );

describe("the interventions a steward may choose", () => {
  it("offers only what the account's status allows", () => {
    expect(Object.keys(choices({ status: "active" }))).toEqual([
      "suspend",
      "start-closure",
      "false-identity",
      "end-roles",
    ]);
    expect(Object.keys(choices({ status: "suspended" }))).toEqual([
      "reinstate",
      "start-closure",
      "false-identity",
      "end-roles",
    ]);
    expect(Object.keys(choices({ status: "closing" }))).toEqual([
      "reinstate",
      "complete-closure",
      "false-identity",
      "end-roles",
    ]);
    expect(choices({ status: "deleted" })).toEqual({});
  });

  it("says why it cannot be taken yet, and names the account by first name", () => {
    expect(choices({ status: "active" })["end-roles"]).toBe(
      "Tor har ingen administrator- eller eierroller.",
    );
    expect(
      choices({
        status: "closing",
        bindings: [
          { kind: "loan", resourceId: environmentId },
          { kind: "loan", resourceId: userId },
        ],
      })["complete-closure"],
    ).toBe(
      "Kan ikke fullføres ennå. Dette binder fortsatt kontoen: et lån som ikke er avsluttet.",
    );
    expect(choices({ status: "closing" })["complete-closure"]).toBeNull();
  });

  it("tells an owner's ending roles go through continuity", () => {
    const owner = { environmentId, name: "Lia", owner: true };
    const rows = interventionFlows["end-roles"].consequences(
      subject({ roles: [owner] }),
      owner,
    );
    expect(rows[0]?.text).toBe(
      "Tor Rapportert er ikke lenger eier og administrator i Lia.",
    );
    expect(rows.some(({ text }) => text.includes("7 dager"))).toBe(true);
  });

  it("has an address for each, found again from its word", () => {
    for (const key of interventionFlowKeys) {
      expect(interventionBySlug(interventionSlugs[key])).toBe(key);
    }
    expect(interventionBySlug("ukjent")).toBeNull();
    expect(interventionHref(userId, "suspend")).toBe(
      `/saker/${userId}/inngrep/suspender`,
    );
  });
});
