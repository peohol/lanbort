import type { HomeItem } from "@lanbort/contracts";
import { describe, expect, it } from "vitest";
import { arrangeHome } from "./model";
import { homeItem } from "./source";

const target = (n: number) => ({
  type: "loan" as const,
  id: `00000000-0000-4000-8000-00000000000${n}`,
});

const ids = (items: readonly HomeItem[]) => items.map((item) => item.target.id);

describe("arrangeHome", () => {
  it("puts each kind in its section, in Home's order", () => {
    const sections = arrangeHome([
      homeItem("loan.handover", target(1)),
      homeItem("environment.review_memberships", target(2), { count: 2 }),
      homeItem("loan.disputed", target(3)),
      homeItem("loan_request.answer", target(4)),
    ]);

    expect(sections.map(({ section, items }) => [section, ids(items)])).toEqual(
      [
        ["awaiting_you", [target(4).id]],
        ["unresolved", [target(3).id]],
        ["upcoming", [target(1).id]],
        ["administration", [target(2).id]],
      ],
    );
  });

  it("orders by deadline, then day, then name, with undated last", () => {
    const [awaiting] = arrangeHome([
      homeItem("loan.write_review", target(1), { title: "B" }),
      homeItem("loan.write_review", target(2), {
        dueAt: "2026-10-09T00:00:00Z",
      }),
      homeItem("loan.report_return", target(3), { day: "2026-10-04" }),
      homeItem("loan.write_review", target(4), {
        dueAt: "2026-10-05T00:00:00Z",
      }),
      homeItem("loan.write_review", target(5), { title: "A" }),
    ]);

    expect(ids(awaiting!.items)).toEqual(
      [4, 2, 3, 5, 1].map((n) => target(n).id),
    );
  });

  it("shows the same kind about the same thing once", () => {
    const [awaiting] = arrangeHome([
      homeItem("loan.confirm_return", target(1)),
      homeItem("loan.confirm_return", target(1)),
      homeItem("loan.answer_amendment", target(1)),
    ]);

    expect(awaiting!.items.map((item) => item.kind)).toEqual([
      "loan.confirm_return",
      "loan.answer_amendment",
    ]);
  });
});
