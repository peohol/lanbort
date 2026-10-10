import type { CaseSummary } from "@lanbort/contracts";
import { describe, expect, it } from "vitest";
import { caseTitle, handlerFunction, queueGroups } from "./cases";

const me = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const mats = "00000000-0000-4000-8000-000000000003";

const summary = (overrides: Partial<CaseSummary>): CaseSummary => ({
  id: "00000000-0000-4000-8000-0000000000aa",
  kind: "loan_mediation",
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

describe("cases", () => {
  it("names a case by what it is about", () => {
    expect(caseTitle(summary({ title: "Sykkelhenger" }))).toBe(
      "Mekling om Sykkelhenger",
    );
    expect(
      caseTitle(
        summary({
          kind: "environment_report",
          reportTarget: "user",
          subjectUserId: mats,
          people: [{ userId: mats, realName: "Mats" }],
        }),
      ),
    ).toBe("Rapport om Mats");
    expect(
      caseTitle(
        summary({
          kind: "environment_report",
          reportTarget: "object",
          title: "Gassflaske",
        }),
      ),
    ).toBe("Rapport om «Gassflaske»");
    expect(
      caseTitle(
        summary({
          kind: "platform_inquiry",
          reportTarget: "user",
          subjectUserId: mats,
          people: [{ userId: mats, realName: "Mats" }],
        }),
      ),
    ).toBe("Saksgrunnlag om Mats");
    expect(
      caseTitle(
        summary({
          kind: "platform_inquiry",
          reportTarget: "object",
          title: "Gassflaske",
        }),
      ),
    ).toBe("Saksgrunnlag om «Gassflaske»");
  });

  it("names a contact from the reader's side", () => {
    const contact = summary({ kind: "environment_contact" });

    expect(caseTitle(contact)).toBe("Henvendelse til administratorene");
    expect(caseTitle(contact, { handler: true, opener: "Kari" })).toBe(
      "Henvendelse fra Kari",
    );
  });

  it("names the function that handles the case, never a person", () => {
    expect(handlerFunction("environment_contact", "Bislett")).toBe(
      "Administratorene i Bislett",
    );
    expect(handlerFunction("platform_report", null)).toBe("Lånbort");
  });

  it("groups the queue by who has the case, a clarified loan after every group", () => {
    const clarified = summary({ id: "c1", loanClarified: true });
    const disputed = summary({ id: "c2", loanClarified: false });
    const mine = summary({ id: "c3", assigneeUserId: me });
    const theirs = summary({ id: "c4", assigneeUserId: other });
    const clarifiedMine = summary({
      id: "c5",
      assigneeUserId: me,
      loanClarified: true,
    });
    const clarifiedTheirs = summary({
      id: "c6",
      assigneeUserId: other,
      loanClarified: true,
    });

    expect(
      queueGroups(
        [clarifiedTheirs, clarified, mine, clarifiedMine, disputed, theirs],
        me,
      ).map((group) => [group.heading, group.cases.map((c) => c.id)]),
    ).toEqual([
      ["Ingen har tatt", ["c2"]],
      ["Du har", ["c3"]],
      ["Andre har", ["c4"]],
      ["Avklart av partene", ["c1", "c5", "c6"]],
    ]);
  });

  it("leaves out a group with no cases", () => {
    expect(queueGroups([summary({ assigneeUserId: me })], me)).toHaveLength(1);
  });
});
