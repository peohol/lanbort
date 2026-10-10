import type { CaseSubjectAccount } from "@lanbort/contracts";
import { describe, expect, it } from "vitest";
import {
  interventionBySlug,
  interventionHref,
  interventionSlugs,
} from "@/navigation/stewardship";
import {
  interventionChoice,
  interventionFlowKeys,
  interventionFlows,
  interventionStanding,
  interventionVariant,
  subjectOf,
} from "./interventions";

const userId = "00000000-0000-4000-8000-000000000001";
const environmentId = "00000000-0000-4000-8000-000000000002";
const otherId = "00000000-0000-4000-8000-000000000003";

const subject = (account: Partial<CaseSubjectAccount>) =>
  subjectOf([{ userId, realName: "Tor Rapportert" }], {
    userId,
    status: "active",
    roles: [],
    bindings: [],
    duplicateOf: null,
    objects: [],
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
      "retire-duplicate",
      "link-person",
      "false-identity",
      "end-roles",
    ]);
    expect(Object.keys(choices({ status: "suspended" }))).toEqual([
      "reinstate",
      "start-closure",
      "retire-duplicate",
      "link-person",
      "false-identity",
      "end-roles",
    ]);
    expect(Object.keys(choices({ status: "closing" }))).toEqual([
      "reinstate",
      "complete-closure",
      "retire-duplicate",
      "link-person",
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
    const owner = { id: environmentId, name: "Lia", owner: true };
    const rows = interventionFlows["end-roles"].consequences(
      subject({ roles: [{ environmentId, name: "Lia", owner: true }] }),
      owner,
    );
    expect(rows[0]?.text).toBe(
      "Tor Rapportert er ikke lenger eier og administrator i Lia.",
    );
    expect(rows.some(({ text }) => text.includes("7 dager"))).toBe(true);
  });

  it("keeps a duplicate to its own steps once it is retired (PS-ADM-009)", () => {
    expect(choices({ status: "suspended" })["retire-duplicate"]).toBe(
      "En suspendert konto avvikles ikke som duplikat. En ny konto ved siden av en suspendert er omgåelse.",
    );
    expect(choices({ status: "active" })["retire-duplicate"]).toBeNull();

    const shared = {
      objectId: environmentId,
      title: "Telt",
      coOwners: [{ userId: otherId, realName: "Per Lien" }],
    };
    const retired = {
      duplicateOf: { userId: otherId, realName: "Siri Holm" },
      objects: [shared],
    };
    expect(choices({ status: "closing", ...retired })).toEqual({
      reinstate: null,
      "complete-closure": null,
      "move-object": "Ingen ting å flytte.",
      "false-identity": null,
      "end-roles": "Tor har ingen administrator- eller eierroller.",
    });
    expect(choices({ status: "active", ...retired })["move-object"]).toBe(
      "Bare når kontoen er avviklet som duplikat og er under avslutning.",
    );

    const alone = { objectId: userId, title: "Drill", coOwners: [] };
    const duplicate = subject({
      status: "closing",
      ...retired,
      objects: [alone, shared],
    });
    expect(interventionStanding("move-object", duplicate)).toEqual({
      shown: true,
      blocked: null,
    });
    expect(interventionChoice("move-object", duplicate)?.options).toEqual([
      expect.objectContaining({ id: userId, disabled: false }),
      expect.objectContaining({
        id: environmentId,
        disabled: true,
        detail:
          "Eies også av Per Lien. Andre medeiere bestemmer selv, så den kan ikke flyttes herfra.",
      }),
    ]);
    expect(
      interventionVariant("move-object", duplicate, {
        id: userId,
        name: "Drill",
      }),
    ).toMatchObject({
      fields: { objectId: userId },
      title: "Flytte Drill til Siri Holm?",
      done: "Drill er flyttet til Siri Holm.",
    });
  });

  it("sends the account picked for it, found from its address (OD-0055)", () => {
    const tor = subject({ status: "active" });
    const choice = interventionChoice("retire-duplicate", tor);
    expect(choice).toMatchObject({ options: null });
    expect(choice?.usable("active")).toBe(true);
    expect(choice?.usable("suspended")).toBe(false);
    expect(interventionChoice("link-person", tor)?.usable("suspended")).toBe(
      true,
    );

    expect(
      interventionVariant("retire-duplicate", tor, null).rows[0]?.text,
    ).toBe(
      "Tor Rapportert går til kontrollert avslutning, og den andre kontoen fortsetter som personens konto.",
    );
    expect(
      interventionVariant("retire-duplicate", tor, {
        id: otherId,
        name: "Siri Holm",
      }),
    ).toMatchObject({
      fields: { userId, continuedUserId: otherId },
      whom: "Tor Rapportert, videreføres som Siri Holm",
    });
    expect(
      interventionVariant("link-person", tor, {
        id: otherId,
        name: "Siri Holm",
      }).fields,
    ).toEqual({ userId, linkedUserId: otherId });
    expect(interventionVariant("suspend", tor, null).fields).toEqual({
      userId,
    });
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
