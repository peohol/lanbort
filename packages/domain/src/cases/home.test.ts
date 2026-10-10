import type { CaseSummary } from "@lanbort/contracts";
import { describe, expect, it } from "vitest";
import { caseQueueHomeItems } from "./home";

const me = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const environment = { id: "00000000-0000-4000-8000-000000000003", name: "Lag" };

const summary = (changes: Partial<CaseSummary> = {}): CaseSummary => ({
  id: "00000000-0000-4000-8000-000000000004",
  kind: "environment_contact",
  status: "open",
  environmentId: environment.id,
  loanId: null,
  openedAt: "2026-10-06T10:00:00.000Z",
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
  ...changes,
});

describe("the case queue on Home", () => {
  it("counts the open cases nobody has taken, and the caller's own", () => {
    expect(
      caseQueueHomeItems(
        environment,
        [
          summary(),
          summary({ assigneeUserId: me, handling: "assigned" }),
          summary({ assigneeUserId: other, handling: "assigned" }),
          summary({ status: "closed" }),
        ],
        me,
      ),
    ).toEqual([
      expect.objectContaining({
        kind: "environment.handle_cases",
        target: { type: "environment", id: environment.id },
        title: "Lag",
        count: 2,
      }),
    ]);
  });

  it("has one task per kind of case, in the same order every time", () => {
    expect(
      caseQueueHomeItems(
        environment,
        [
          summary({ kind: "environment_report", reportTarget: "object" }),
          summary({ kind: "loan_mediation" }),
          summary({ kind: "environment_report", reportTarget: "user" }),
          summary(),
        ],
        me,
      ).map(({ kind, count }) => [kind, count]),
    ).toEqual([
      ["environment.handle_cases", 1],
      ["environment.mediate_loans", 1],
      ["environment.review_reports", 2],
    ]);
  });

  it("asks nothing when every case is another administrator's", () => {
    expect(
      caseQueueHomeItems(
        environment,
        [summary({ assigneeUserId: other, handling: "assigned" })],
        me,
      ),
    ).toEqual([]);
    expect(caseQueueHomeItems(environment, [], me)).toEqual([]);
  });
});
