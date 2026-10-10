import { describe, expect, it } from "vitest";
import {
  fixtureAt as at,
  loanFixture as loan,
  loanRequestFixture as request,
  noLoanActions,
} from "./loan-fixtures";
import { endedLoanEntry, groupLoans, type LoanGroup } from "./loan-list";

const today = "2026-10-01";
const ended = { reason: "unresolved" as const, endedBy: null, endedAt: at };

/** Each group's rows as «title: status». */
const shown = (groups: LoanGroup[]) =>
  Object.fromEntries(
    groups.map(({ heading, entries }) => [
      heading,
      entries.map(({ title, status }) => `${title}: ${status}`),
    ]),
  );

describe("groupLoans (UX-IA-006, KF1 v2)", () => {
  it("groups by whom each waits on, in order, leaving out empty groups", () => {
    const groups = groupLoans({
      requests: [request(), request({ role: "lender" })],
      loans: [loan(), loan({ role: "lender", status: "disputed" })],
      today,
    });

    expect(groups.map(({ heading }) => heading)).toEqual([
      "Venter på deg",
      "Pågår og kommende",
      "Venter på andre",
    ]);
    expect(shown(groups)).toEqual({
      "Venter på deg": [
        "Stige til Ola Hansen: Ola Hansen vil låne. Venter på svaret ditt",
      ],
      "Pågår og kommende": [
        "Tilhenger fra Kari: Tilhenger er reservert for deg",
      ],
      "Venter på andre": [
        "Stige: Venter på svar fra eieren",
        "Tilhenger til Ola: Dere har sagt ulike ting om overleveringen",
      ],
    });
    expect(groupLoans({ requests: [], loans: [], today })).toEqual([]);
  });

  it("keeps an ended loan only while it asks something of the reader", () => {
    const waiting = loan({
      role: "lender",
      status: "ended",
      ending: ended,
      control: { confirmedAt: null },
      actions: { ...noLoanActions, confirmControl: true },
    });

    expect(
      shown(
        groupLoans({
          requests: [],
          loans: [
            waiting,
            { ...waiting, role: "borrower", actions: noLoanActions },
          ],
          today,
        }),
      ),
    ).toEqual({
      "Venter på deg": [
        "Tilhenger til Ola: Bekreft når du har Tilhenger igjen",
      ],
    });
  });

  it("leads each row to its own page", () => {
    const [group] = groupLoans({ requests: [request()], loans: [], today });

    expect(group?.entries[0]?.href).toBe(
      "/lan/foresporsel/00000000-0000-4000-8000-000000000001",
    );
  });
});

describe("endedLoanEntry", () => {
  it("says how the loan ended and when it was", () => {
    expect(
      endedLoanEntry(
        loan({
          status: "ended",
          ending: { reason: "returned", endedBy: "lender", endedAt: at },
        }),
      ),
    ).toMatchObject({
      title: "Tilhenger fra Kari",
      status: "Avsluttet · 5.–7. oktober",
    });
  });
});
