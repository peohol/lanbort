import {
  type PilotResultsExport,
  type PilotTestSummary,
  pilotCases,
} from "@lanbort/contracts";
import { describe, expect, it } from "vitest";
import {
  deviceOf,
  filterPilotTests,
  groupPilotTests,
  visiblePilotPhaseGroups,
  pilotFilterChoices,
  pilotFilterOf,
  pilotRunsCsv,
  pilotViewHref,
  showPilotPhaseOverview,
  platformOf,
} from "./pilot";

const tests: PilotTestSummary[] = pilotCases.map((test) => ({
  ...test,
  area: test.id[0]!,
  status:
    test.id === "A01" ? "passed" : test.id === "M01" ? "retest" : "not_started",
  lastRunAt: null,
  runs: 0,
  openDefects: 0,
  assignees: test.id === "T01" ? ["P-01"] : [],
}));

describe("the pilot overview's filters", () => {
  it("shows the next tests by default, basis first, without what passed", () => {
    const shown = filterPilotTests(tests, pilotFilterOf({}));

    expect(shown.map((test) => test.id)).not.toContain("A01");
    expect(shown.map((test) => test.id)).toContain("M01");
    expect(shown[0]!.priority).toBe("B");
    expect(shown.at(-1)!.priority).toBe("U");
    // Phase order matters more than priority across different phases.
    expect(shown.findIndex((test) => test.id === "S02")).toBeLessThan(
      shown.findIndex((test) => test.id === "A03"),
    );
  });

  it("groups the entire pilot in phases, themes and readable task kinds", () => {
    const grouped = groupPilotTests(tests);
    const ids = grouped.flatMap((phase) =>
      phase.areas.flatMap((area) =>
        area.kinds.flatMap((kind) => kind.tests.map((test) => test.id)),
      ),
    );

    expect(grouped).toHaveLength(6);
    expect(grouped[0]!.phase.name).toBe("Klargjøring");
    expect(grouped[5]!.total).toBe(0);
    expect(ids).toHaveLength(98);
    expect(new Set(ids).size).toBe(98);
    expect(grouped[0]!.areas[0]!.area.name).toBe(
      "Konto, innlogging og vennskap",
    );
    expect(grouped[0]!.areas[0]!.kinds[0]!.label).toBe("Viktige oppgaver");
    expect(pilotFilterChoices.area[0]!.label).toBe(
      "Konto, innlogging og vennskap",
    );
    expect(pilotFilterChoices.priority[0]!.label).toBe("Viktige oppgaver");
  });

  it("keeps the closing phase visible when every test is already done", () => {
    const completed = tests.map((test) => ({
      ...test,
      status: "passed" as const,
    }));
    const remaining = filterPilotTests(completed, pilotFilterOf({}));

    expect(remaining).toHaveLength(0);
    expect(showPilotPhaseOverview(remaining.length, true, true)).toBe(true);
    expect(showPilotPhaseOverview(remaining.length, false, true)).toBe(false);
    expect(showPilotPhaseOverview(remaining.length, true, false)).toBe(false);
    expect(showPilotPhaseOverview(2, false, false)).toBe(true);
    expect(
      visiblePilotPhaseGroups(remaining, 5, true).map(
        (group) => group.phase.number,
      ),
    ).toEqual([5]);
    expect(
      visiblePilotPhaseGroups(remaining, 4, true).map(
        (group) => group.phase.number,
      ),
    ).toEqual([4, 5]);
    expect(visiblePilotPhaseGroups(remaining, null, false)).toEqual([]);

    const inPhaseTwo = tests.filter((test) => test.phase === 2);
    expect(inPhaseTwo.length).toBeGreaterThan(0);
    expect(
      visiblePilotPhaseGroups(inPhaseTwo, 4, false).map(
        (group) => group.phase.number,
      ),
    ).toEqual([2]);
    expect(visiblePilotPhaseGroups(remaining, 4, false)).toEqual([]);
  });

  it("searches ids and wording, and narrows by each choice", () => {
    const all = (params: Record<string, string>) =>
      filterPilotTests(tests, pilotFilterOf({ vis: "all", ...params })).map(
        (test) => test.id,
      );

    expect(all({ q: "a01" })).toEqual(["A01"]);
    expect(all({ omrade: "R" })).toHaveLength(7);
    expect(all({ status: "retest" })).toEqual(["M01"]);
    expect(all({ tester: "P-01" })).toEqual(["T01"]);
    expect(all({ prioritet: "U", fase: "4" }).length).toBeGreaterThan(0);
    expect(all({ fase: "5" })).toEqual([]);
  });

  it("reads an unknown view as the next tests, and keeps choices in links", () => {
    const filter = pilotFilterOf({ vis: "noe", q: "konto", omrade: "A" });

    expect(filter.view).toBe("next");
    expect(pilotViewHref(filter, "failed")).toBe(
      "/pilot?vis=failed&q=konto&omrade=A",
    );
  });
});

describe("the device a result is recorded on", () => {
  it("is told from the browser", () => {
    const iphone =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
    const pixel =
      "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
    const tablet =
      "Mozilla/5.0 (Linux; Android 15; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
    const windows =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0";

    expect(deviceOf(iphone)).toBe("mobile");
    expect(deviceOf(pixel)).toBe("mobile");
    expect(deviceOf(tablet)).toBe("tablet");
    expect(deviceOf(windows)).toBe("desktop");
    expect(platformOf(iphone)).toBe("Safari på iOS");
    expect(platformOf(windows)).toBe("Edge på Windows");
  });
});

describe("the results as a spreadsheet", () => {
  it("keeps text a spreadsheet would run as a formula as text", () => {
    const results: PilotResultsExport = {
      kind: "results",
      generatedAt: "2026-10-20T10:00:00.000Z",
      catalogueVersion: "1.0",
      campaign: null,
      runs: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          campaignId: "00000000-0000-4000-8000-000000000002",
          testId: "A02",
          revision: "aaaaaaaaaaaa",
          action: "Logg inn",
          expected: 'Du er "inne"',
          recordedAt: "2026-10-20T10:00:00.000Z",
          status: "failed",
          appVersion: "abc1234",
          environment: "production",
          device: "mobile",
          platform: null,
          helped: true,
          tester: "P-01",
          note: '=HYPERLINK("https://example.test")',
          defectNumber: 3,
        },
      ],
      defects: [],
      tasks: [],
    };
    const [header, row] = pilotRunsCsv(results).replace("﻿", "").split("\r\n");

    expect(header).toContain('"Test";"Område"');
    expect(row).toContain('"\'=HYPERLINK(""https://example.test"")"');
    expect(row).toContain('"Du er ""inne"""');
    expect(row).toContain('"Feilet"');
    expect(row).toContain('"F-3"');
    expect(row).toContain('"Ja"');
  });
});
