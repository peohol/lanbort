import {
  type LoanHistoryEntry,
  loanHistoryEventSchema,
  type LoanHistoryPerson,
} from "@lanbort/contracts";
import { describe, expect, it } from "vitest";
import { describeHistoryEntry } from "./loan-history";

const id = "00000000-0000-4000-8000-000000000001";
const at = "2026-10-03T12:00:00.000Z";

const kari: LoanHistoryPerson = {
  you: false,
  role: "lender",
  realName: "Kari",
};
const you: LoanHistoryPerson = { you: true, role: "borrower", realName: "Ola" };
const coOwner: LoanHistoryPerson = {
  you: false,
  role: "co_owner",
  realName: null,
};

const text = (entry: Partial<LoanHistoryEntry>) =>
  describeHistoryEntry(
    { id, at, event: "reserved", actor: kari, ...entry },
    "Tilhenger",
  );

describe("the timeline in words (UX-INT-008)", () => {
  it("has words for every event, none of them internal", () => {
    for (const event of loanHistoryEventSchema.options) {
      expect(text({ event })).not.toMatch(/_|undefined|null/);
    }
  });

  it("says who did it: you, the other party by name, or Lånbort", () => {
    expect(text({ event: "requested", actor: you })).toBe(
      "Du sendte forespørselen",
    );
    expect(text({ event: "reserved" })).toBe("Kari godkjente lånet");
    expect(
      text({ event: "not_completed", actor: null, basis: "unanswered" }),
    ).toBe(
      "Lånet ble ikke gjennomført. Fristen for å svare om overleveringen gikk ut",
    );
  });

  it("names neither another co-owner nor a former user (UX-PRIV-010)", () => {
    expect(
      text({
        event: "return_reported",
        actor: coOwner,
        side: "lender",
        outcome: "received",
        byCoOwner: true,
      }),
    ).toBe("En medeier bekreftet å ha fått tilbake Tilhenger");
    expect(
      text({ event: "cancelled", actor: { ...kari, realName: null } }),
    ).toBe("Tidligere bruker avlyste lånet");
    expect(
      text({
        event: "responsibility_proposed",
        transfer: { kind: "voluntary", from: null, to: coOwner },
      }),
    ).toBe("Kari foreslo at en medeier blir ansvarlig utlåner");
  });

  it("tells a confirmation that took effect by itself by its side", () => {
    expect(
      text({
        event: "return_reported",
        actor: null,
        side: "borrower",
        outcome: "returned",
      }),
    ).toBe("Låntakeren sa at Tilhenger er levert tilbake");
  });

  it("shows the period an agreed change gave the loan", () => {
    expect(
      text({
        event: "amendment_accepted",
        period: { start: "2026-10-05", end: "2026-10-09" },
      }),
    ).toBe("Kari godtok ny periode: mandag 5. oktober – fredag 9. oktober");
  });

  it("tells a reopened return as a new event (PS-LOAN-017)", () => {
    expect(text({ event: "return_disputed", reopened: true })).toBe(
      "En bekreftet retur ble motsagt senere, så lånet er åpnet igjen",
    );
    expect(
      text({
        event: "responsibility_transferred",
        transfer: { kind: "voluntary", from: kari, to: { ...you } },
      }),
    ).toBe("Du ble ansvarlig utlåner");
  });
});
