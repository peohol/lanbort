import {
  type HomeItem,
  type HomeItemKind,
  homeItemKinds,
} from "@lanbort/contracts";
import { describe, expect, it } from "vitest";
import {
  administrationByEnvironment,
  administrationText,
  arrangeAwaiting,
  dayLeaf,
  groupAbout,
  homeCard,
  homeRow,
  isCard,
  unresolvedText,
  upcomingText,
} from "./home-tasks";

const today = "2026-10-12";
let next = 0;

function item(kind: HomeItemKind, details: Partial<HomeItem> = {}): HomeItem {
  next += 1;

  return {
    kind,
    target: {
      type: "loan",
      id: `00000000-0000-4000-8000-${String(next).padStart(12, "0")}`,
    },
    title: "høytrykksspyleren",
    role: "lender",
    person: "Ola",
    via: "Borettslaget Lia",
    period: null,
    day: null,
    dueAt: null,
    count: null,
    ...details,
  };
}

const awaitingKinds = (Object.keys(homeItemKinds) as HomeItemKind[]).filter(
  (kind) => homeItemKinds[kind] === "awaiting_you",
);

describe("a task in the user's words", () => {
  it.each(awaitingKinds)("%s has a verb and what it is about", (kind) => {
    const { action, about } = homeRow(item(kind, { title: "stigen" }));

    expect(action).not.toMatch(/[a-z]+[._][a-z]+|undefined|null/);
    expect(about).not.toMatch(/[a-z]+_[a-z]+|undefined|null/);
    expect(about.length).toBeGreaterThan(5);
  });

  it("names the borrower and the days asked for", () => {
    expect(
      homeRow(
        item("loan_request.answer", {
          person: "Per Lien",
          title: "stigen",
          period: { start: "2026-10-14", end: "2026-10-15" },
        }),
      ),
    ).toMatchObject({
      action: "Svar på forespørselen",
      about: "Per Lien vil låne stigen 14.–15. oktober",
    });
  });

  it("does not name a deleted person", () => {
    expect(
      homeRow(item("loan_request.answer", { person: null })).about,
    ).toMatch(/^Noen vil låne/);
  });
});

describe("full cards (UX-IA-018)", () => {
  it("are the day's tasks, overdue ones, today's deadlines, or the only task", () => {
    expect(
      isCard(item("loan.confirm_return", { day: today }), today, false),
    ).toBe(true);
    expect(
      isCard(item("loan.report_handover", { day: "2026-10-11" }), today, false),
    ).toBe(true);
    expect(
      isCard(
        item("loan.write_review", { dueAt: "2026-10-12T18:00:00.000Z" }),
        today,
        false,
      ),
    ).toBe(true);
    expect(isCard(item("loan.write_review"), today, true)).toBe(true);
    expect(
      isCard(
        item("loan.write_review", { dueAt: "2026-10-20T18:00:00.000Z" }),
        today,
        false,
      ),
    ).toBe(false);
  });

  it("say what happens today, from the reader's side", () => {
    expect(
      homeCard(item("loan.report_handover", { day: today }), today),
    ).toMatchObject({
      tag: { text: "I dag" },
      title: "I dag gir du høytrykksspyleren til Ola",
      open: "Gå til overleveringen",
    });
    expect(
      homeCard(
        item("loan.report_handover", { day: today, role: "borrower" }),
        today,
      ).title,
    ).toBe("I dag henter du høytrykksspyleren hos Ola");
    expect(
      homeCard(item("loan.confirm_return", { day: today }), today),
    ).toMatchObject({
      tag: { text: "Avtalt i dag" },
      hint: "Returen var avtalt i dag. Bekreft når du har den.",
    });
  });

  it("ask a neutral question about a handover whose day has passed", () => {
    expect(
      homeCard(
        item("loan.report_handover", { day: "2026-10-11", title: "stigen" }),
        today,
      ),
    ).toMatchObject({
      tag: { text: "Overlevering avklares" },
      title: "Fikk Ola stigen?",
    });
  });

  it("give a request's days in full", () => {
    expect(
      homeCard(
        item("loan_request.answer", {
          period: { start: "2026-10-10", end: "2026-10-12" },
        }),
        today,
      ),
    ).toMatchObject({
      title: "Ola vil låne høytrykksspyleren",
      hint: "Lørdag 10. oktober til mandag 12. oktober",
    });
  });
});

describe("«Venter på deg» in order", () => {
  it("puts cards first, and groups many of a kind, but never a card", () => {
    const urgent = item("loan_request.answer", {
      dueAt: "2026-10-12T18:00:00.000Z",
    });
    const requests = ["stige", "sykkelstativ", "hekksaks"].map((title) =>
      item("loan_request.answer", { title }),
    );
    const review = item("loan.write_review");
    const entries = arrangeAwaiting([urgent, ...requests, review], today);

    expect(entries.map(({ type }) => type)).toEqual(["card", "group", "row"]);
    expect(entries[1]).toMatchObject({ items: requests });
    expect(groupAbout(requests)).toBe("Stige, sykkelstativ og hekksaks");
  });

  it("keeps two of a kind as rows", () => {
    const entries = arrangeAwaiting(
      [item("loan_request.answer"), item("loan_request.answer")],
      today,
    );

    expect(entries.map(({ type }) => type)).toEqual(["row", "row"]);
  });
});

describe("what is coming and what is unsettled", () => {
  it("says who does what on the day", () => {
    expect(upcomingText(item("loan.handover", { role: "borrower" }))).toBe(
      "Du henter høytrykksspyleren hos Ola",
    );
    expect(upcomingText(item("loan.return"))).toBe(
      "Ola leverer høytrykksspyleren tilbake",
    );
    expect(dayLeaf(today, today).weekday).toBe("I dag");
    expect(dayLeaf("2026-10-14", today)).toMatchObject({
      weekday: "ons",
      day: "14",
    });
  });

  it("says whom it waits for", () => {
    expect(unresolvedText(item("loan.awaiting_return")).tag.text).toBe(
      "Venter på Ola",
    );
    expect(unresolvedText(item("loan.mediation")).tag.text).toBe(
      "Venter på administratorene",
    );
    expect(
      unresolvedText(item("loan.late", { day: "2026-10-11" })),
    ).toMatchObject({
      tag: { text: "Forsinket" },
      title: "høytrykksspyleren er fortsatt hos Ola",
    });
  });
});

describe("tasks as administrator", () => {
  it("are counted together and grouped by environment", () => {
    const environment = (id: string, kind: HomeItemKind, count: number) =>
      item(kind, {
        target: { type: "environment", id },
        title: `Miljø ${id.slice(-1)}`,
        count,
      });
    const a = "00000000-0000-4000-8000-00000000000a";
    const b = "00000000-0000-4000-8000-00000000000b";
    const { total, environments } = administrationByEnvironment([
      environment(a, "environment.review_memberships", 2),
      environment(b, "environment.handle_cases", 1),
      environment(a, "environment.review_publications", 1),
    ]);

    expect(total).toBe(4);
    expect(
      environments.map(({ name, items }) => [
        name,
        items.map(administrationText),
      ]),
    ).toEqual([
      ["Miljø a", ["Behandle 2 innmeldinger", "Vurder 1 ting"]],
      ["Miljø b", ["Svar på 1 henvendelse"]],
    ]);
  });
});
