import {
  type PilotDefect,
  type PilotDefectStatus,
  type PilotDevice,
  type PilotEnvironment,
  type PilotOutcome,
  type PilotResultsExport,
  type PilotRunStatus,
  type PilotSeverity,
  type PilotTestStatus,
  type PilotTestSummary,
  pilotAreas,
  pilotPhases,
  pilotPriorities,
  pilotPriorityNames,
  pilotTestStatusSchema,
} from "@lanbort/contracts";
import type { Tone } from "@/components/tag";
import type { SearchParams } from "@/navigation/list-pages";

/** The statuses in the testplan's own words (pilot-testplan.md §4). */
export const pilotStatusLabels: Record<PilotTestStatus, string> = {
  not_started: "Ikke startet",
  passed: "Bestått",
  failed: "Feilet",
  blocked: "Blokkert",
  retest: "Må testes på nytt",
  not_relevant: "Ikke relevant",
};

export const pilotStatusTones: Record<PilotTestStatus, Tone> = {
  not_started: "neutral",
  passed: "positive",
  failed: "danger",
  blocked: "warning",
  retest: "attention",
  not_relevant: "neutral",
};

/** The results a run can record, in the order the buttons show them. */
export const pilotRunStatuses: readonly PilotRunStatus[] = [
  "passed",
  "failed",
  "blocked",
  "retest",
  "not_relevant",
];

/** Short, with what each means for the pilot (pilot-testplan.md §5). */
export const pilotSeverityLabels: Record<PilotSeverity, string> = {
  P0: "P0 – stans",
  P1: "P1 – sentral flyt virker ikke",
  P2: "P2 – feil eller friksjon",
  P3: "P3 – kosmetisk",
};

export const pilotSeverityTones: Record<PilotSeverity, Tone> = {
  P0: "danger",
  P1: "danger",
  P2: "warning",
  P3: "neutral",
};

export const pilotDefectStatusLabels: Record<PilotDefectStatus, string> = {
  open: "Åpen",
  fixed: "Rettet, må testes",
  closed: "Lukket",
  deferred: "Utsatt",
};

export const pilotOutcomeLabels: Record<PilotOutcome, string> = {
  managed: "Fikk det til",
  stuck: "Stoppet opp",
  needs_help: "Trenger hjelp",
};

export const pilotOutcomeTones: Record<PilotOutcome, Tone> = {
  managed: "positive",
  stuck: "warning",
  needs_help: "attention",
};

export const pilotDeviceLabels: Record<PilotDevice, string> = {
  mobile: "Mobil",
  tablet: "Nettbrett",
  desktop: "PC",
};

export const pilotEnvironmentLabels: Record<PilotEnvironment, string> = {
  production: "Produksjon",
  isolated: "Eget testmiljø",
};

export const pilotAreaName = (code: string) =>
  pilotAreas.find((area) => area.code === code)?.name ?? code;

export const pilotPhaseName = (phase: number) =>
  `${phase}. ${pilotPhases.find((each) => each.number === phase)?.name ?? ""}`;

/** The device a browser runs on, as well as its user agent tells. */
export function deviceOf(userAgent: string): PilotDevice {
  if (/iPad|Tablet|Android(?!.*Mobile)/i.test(userAgent)) return "tablet";
  if (/Mobi|iPhone|Android/i.test(userAgent)) return "mobile";
  return "desktop";
}

/** The browser and system, short, for the run's record. */
export function platformOf(userAgent: string): string {
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Firefox\//.test(userAgent)
      ? "Firefox"
      : /Chrome\//.test(userAgent)
        ? "Chrome"
        : /Safari\//.test(userAgent)
          ? "Safari"
          : "Annen nettleser";
  const system = /iPhone|iPad/.test(userAgent)
    ? "iOS"
    : /Android/.test(userAgent)
      ? "Android"
      : /Mac OS X/.test(userAgent)
        ? "macOS"
        : /Windows/.test(userAgent)
          ? "Windows"
          : /Linux/.test(userAgent)
            ? "Linux"
            : "annet system";

  return `${browser} på ${system}`;
}

/** The ready-made views of the overview (pilot-ui.md «Pilotoversikt»). */
export const pilotViews = {
  next: { label: "Neste tester" },
  failed: { label: "Feilet" },
  retest: { label: "Må testes på nytt" },
  blocked: { label: "Blokkert" },
  all: { label: "Alt" },
} as const;

export type PilotView = keyof typeof pilotViews;

/** What the overview's address asks for. */
export interface PilotFilter {
  readonly view: PilotView;
  readonly q: string;
  readonly area: string;
  readonly phase: string;
  readonly priority: string;
  readonly status: string;
  readonly tester: string;
}

const one = (params: SearchParams, key: string) => {
  const value = params[key];
  return typeof value === "string" ? value.trim().slice(0, 100) : "";
};

export function pilotFilterOf(params: SearchParams): PilotFilter {
  const view = one(params, "vis");

  return {
    view: view in pilotViews ? (view as PilotView) : "next",
    q: one(params, "q"),
    area: one(params, "omrade"),
    phase: one(params, "fase"),
    priority: one(params, "prioritet"),
    status: one(params, "status"),
    tester: one(params, "tester"),
  };
}

/** The address of a view, keeping the other choices. */
export function pilotViewHref(filter: PilotFilter, view: PilotView): string {
  const search = new URLSearchParams();
  const keep: [string, string][] = [
    ["vis", view],
    ["q", filter.q],
    ["omrade", filter.area],
    ["fase", filter.phase],
    ["prioritet", filter.priority],
    ["status", filter.status],
    ["tester", filter.tester],
  ];

  for (const [key, value] of keep) if (value) search.set(key, value);

  return `/pilot?${search}`;
}

/** Not tried yet, or sent back to be tried again. */
const ahead: ReadonlySet<PilotTestStatus> = new Set(["not_started", "retest"]);

const viewHolds: Record<PilotView, (test: PilotTestSummary) => boolean> = {
  next: (test) => ahead.has(test.status),
  failed: (test) => test.status === "failed",
  retest: (test) => test.status === "retest",
  blocked: (test) => test.status === "blocked",
  all: () => true,
};

const normalized = (text: string) => text.toLocaleLowerCase("nb");

/**
 * The tests the filter shows. «Neste tester» puts the basis tests first,
 * then the ordinary and the extended ones, each by phase.
 */
export function filterPilotTests(
  tests: readonly PilotTestSummary[],
  filter: PilotFilter,
): PilotTestSummary[] {
  const q = normalized(filter.q);
  const shown = tests.filter(
    (test) =>
      viewHolds[filter.view](test) &&
      (!q ||
        normalized(`${test.id} ${test.action} ${test.expected}`).includes(q)) &&
      (!filter.area || test.area === filter.area) &&
      (!filter.phase || String(test.phase) === filter.phase) &&
      (!filter.priority || test.priority === filter.priority) &&
      (!filter.status || test.status === filter.status) &&
      (!filter.tester || test.assignees.includes(filter.tester)),
  );

  return filter.view === "next"
    ? shown.sort(
        (a, b) =>
          pilotPriorities.indexOf(a.priority) -
            pilotPriorities.indexOf(b.priority) ||
          a.phase - b.phase ||
          a.id.localeCompare(b.id),
      )
    : shown;
}

/** The choices of the overview's filters. */
export const pilotFilterChoices = {
  area: pilotAreas.map((area) => ({
    value: area.code,
    label: `${area.code} – ${area.name}`,
  })),
  phase: pilotPhases.map((phase) => ({
    value: String(phase.number),
    label: pilotPhaseName(phase.number),
  })),
  priority: pilotPriorities.map((priority) => ({
    value: priority,
    label: `${priority} – ${pilotPriorityNames[priority]}`,
  })),
  status: pilotTestStatusSchema.options.map((status) => ({
    value: status,
    label: pilotStatusLabels[status],
  })),
};

/** «12 av 98», with how many are done in percent. */
export function pilotShare(done: number, total: number): string {
  return total === 0
    ? "0 av 0"
    : `${done} av ${total} (${Math.round((done / total) * 100)} %)`;
}

/** Defects that stop the pilot or the part they hit, not yet resolved. */
export const blockingDefects = (defects: readonly PilotDefect[]) =>
  defects.filter(
    (defect) =>
      (defect.severity === "P0" || defect.severity === "P1") &&
      (defect.status === "open" || defect.status === "fixed"),
  );

/**
 * A spreadsheet cell: quoted, and a value a spreadsheet would read as a
 * formula is kept as text (CSV injection).
 */
function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;

  return `"${safe.replaceAll('"', '""')}"`;
}

const yesNo = (value: boolean | null) =>
  value === null ? "" : value ? "Ja" : "Nei";

/**
 * The runs of a results export as CSV, one row per run, for a spreadsheet:
 * the test's wording as it was tried, and the testers by pseudonym.
 */
export function pilotRunsCsv(results: PilotResultsExport): string {
  const header = [
    "Test",
    "Område",
    "Tidspunkt",
    "Status",
    "Appversjon",
    "Miljø",
    "Enhet",
    "Nettleser",
    "Hjelp nødvendig",
    "Tester",
    "Merknad",
    "Feil",
    "Testhandling",
    "Forventet resultat",
    "Revisjon",
  ];
  const rows = results.runs.map((run) => [
    run.testId,
    pilotAreaName(run.testId[0]!),
    run.recordedAt,
    pilotStatusLabels[run.status],
    run.appVersion,
    run.environment ? pilotEnvironmentLabels[run.environment] : "",
    run.device ? pilotDeviceLabels[run.device] : "",
    run.platform,
    yesNo(run.helped),
    run.tester,
    run.note,
    run.defectNumber === null ? "" : `F-${run.defectNumber}`,
    run.action,
    run.expected,
    run.revision,
  ]);

  return `﻿${[header, ...rows]
    .map((row) => row.map(csvCell).join(";"))
    .join("\r\n")}\r\n`;
}
