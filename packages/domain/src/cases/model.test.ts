import { describe, expect, it } from "vitest";
import {
  type ActionRecord,
  type EntryRecord,
  handlingOf,
  sharedUpTo,
  sharedWithParties,
  visibleToParticipant,
} from "./model";

const borrower = "00000000-0000-4000-8000-0000000000b1";
const lender = "00000000-0000-4000-8000-0000000000b2";
const handler = "00000000-0000-4000-8000-0000000000a1";

const entry = (
  position: number,
  overrides: Partial<EntryRecord> = {},
): EntryRecord => ({
  id: `00000000-0000-4000-8000-${String(position).padStart(12, "0")}`,
  authorUserId: borrower,
  capacity: "party",
  audience: "parties",
  audienceUserId: null,
  body: "Forklaring",
  privateMessages: [],
  correctsEntryId: null,
  createdAt: new Date("2026-10-20T12:00:00Z"),
  position: BigInt(position),
  ...overrides,
});

const shared = (position: number): ActionRecord => ({
  kind: "statements_shared",
  actorUserId: handler,
  targetUserId: null,
  reason: null,
  at: new Date("2026-10-20T12:00:00Z"),
  position: BigInt(position),
});

describe("what a participant sees in a case (PS-COM-012)", () => {
  it("keeps a mediation's statements apart until they are shared, and only those before", () => {
    const first = entry(1);
    const answer = entry(2, { authorUserId: lender });
    const later = entry(4, { authorUserId: lender });
    const sharing = sharedUpTo([shared(3)]);

    expect(sharedUpTo([])).toBeNull();
    expect(visibleToParticipant(answer, borrower, "loan_mediation", null)).toBe(
      false,
    );
    expect(visibleToParticipant(first, borrower, "loan_mediation", null)).toBe(
      true,
    );
    expect(
      visibleToParticipant(answer, borrower, "loan_mediation", sharing),
    ).toBe(true);
    expect(
      visibleToParticipant(later, borrower, "loan_mediation", sharing),
    ).toBe(false);
    expect(sharedWithParties(answer, "loan_mediation", sharing)).toBe(true);
    expect(sharedWithParties(later, "loan_mediation", sharing)).toBe(false);
    expect(sharedWithParties(first, "environment_contact", null)).toBe(true);
  });

  it("shows a handler's entry to whom it was written, and an internal note to nobody", () => {
    const toAll = entry(1, { authorUserId: handler, capacity: "handler" });
    const toLender = entry(2, {
      authorUserId: handler,
      capacity: "handler",
      audience: "party",
      audienceUserId: lender,
    });
    const note = entry(3, {
      authorUserId: handler,
      capacity: "handler",
      audience: "handlers",
    });

    expect(visibleToParticipant(toAll, borrower, "loan_mediation", null)).toBe(
      true,
    );
    expect(visibleToParticipant(toLender, lender, "loan_mediation", null)).toBe(
      true,
    );
    expect(
      visibleToParticipant(toLender, borrower, "loan_mediation", null),
    ).toBe(false);
    expect(visibleToParticipant(note, borrower, "loan_mediation", null)).toBe(
      false,
    );
  });

  it("says when nobody can handle the case (UX-EXC-009)", () => {
    expect(handlingOf(handler, true)).toBe("assigned");
    expect(handlingOf(null, true)).toBe("queued");
    expect(handlingOf(null, false)).toBe("unavailable");
  });
});
