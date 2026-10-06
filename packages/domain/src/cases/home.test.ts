import type { CaseSummary } from "@lanbort/contracts";
import { describe, expect, it } from "vitest";
import { caseQueueHomeItem } from "./home";

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
  ...changes,
});

describe("the case queue on Home", () => {
  it("counts the open cases nobody has taken, and the caller's own", () => {
    expect(
      caseQueueHomeItem(
        environment,
        [
          summary(),
          summary({ assigneeUserId: me, handling: "assigned" }),
          summary({ assigneeUserId: other, handling: "assigned" }),
          summary({ status: "closed" }),
        ],
        me,
      ),
    ).toMatchObject({
      kind: "environment.handle_cases",
      target: { type: "environment", id: environment.id },
      title: "Lag",
      count: 2,
    });
  });

  it("asks nothing when every case is another administrator's", () => {
    expect(
      caseQueueHomeItem(
        environment,
        [summary({ assigneeUserId: other, handling: "assigned" })],
        me,
      ),
    ).toBeNull();
    expect(caseQueueHomeItem(environment, [], me)).toBeNull();
  });
});
