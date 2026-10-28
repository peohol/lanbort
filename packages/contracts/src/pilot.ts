import { z } from "zod";
import { emailAddressSchema } from "./auth";
import {
  pilotAreas,
  pilotPhases,
  pilotPriorities,
  pilotRequirements,
  pilotTestIdPattern,
} from "./pilot-catalogue";

/**
 * The closed pilot's own surface (docs/implementation/pilot-ui.md): a
 * private test journal kept apart from Lånbort's ordinary data. Only the
 * pilot lead sees the journal; a participant sees only their own tasks.
 * Nothing here names a person other than by pseudonym, except the lead's
 * own list of participants.
 */

/** What a test run found. A test without a run is not started. */
export const pilotRunStatuses = [
  "passed",
  "failed",
  "blocked",
  "retest",
  "not_relevant",
] as const;
export const pilotRunStatusSchema = z.enum(pilotRunStatuses);
export type PilotRunStatus = z.infer<typeof pilotRunStatusSchema>;

/** A test's standing: its latest run's status, or not started. */
export const pilotTestStatusSchema = z.enum([
  "not_started",
  ...pilotRunStatuses,
]);
export type PilotTestStatus = z.infer<typeof pilotTestStatusSchema>;

/** Statuses a run must explain in its note. */
export const pilotStatusesNeedingNote: ReadonlySet<PilotRunStatus> = new Set([
  "failed",
  "blocked",
  "not_relevant",
]);

/** P0 stops the pilot; P1 stops the part it hits (pilot-testplan.md §4). */
export const pilotSeveritySchema = z.enum(["P0", "P1", "P2", "P3"]);
export type PilotSeverity = z.infer<typeof pilotSeveritySchema>;

export const pilotDefectStatusSchema = z.enum([
  "open",
  "fixed",
  "closed",
  "deferred",
]);
export type PilotDefectStatus = z.infer<typeof pilotDefectStatusSchema>;

/** A participant's own account of a task; never an official result. */
export const pilotOutcomeSchema = z.enum(["managed", "stuck", "needs_help"]);
export type PilotOutcome = z.infer<typeof pilotOutcomeSchema>;

export const pilotDeviceSchema = z.enum(["mobile", "tablet", "desktop"]);
export type PilotDevice = z.infer<typeof pilotDeviceSchema>;

export const pilotEnvironmentSchema = z.enum(["production", "isolated"]);
export type PilotEnvironment = z.infer<typeof pilotEnvironmentSchema>;

export const pilotTestIdSchema = z
  .string()
  .regex(pilotTestIdPattern)
  .transform((id) => id.toUpperCase());

/**
 * The deployed app's version a run is stamped with, such as a short commit
 * id. The server sets it from its own configuration, never the browser.
 */
export const pilotAppVersionSchema = z.string().regex(/^[A-Za-z0-9._-]{1,40}$/);

export const pilotPhaseSchema = z
  .number()
  .int()
  .min(0)
  .max(pilotPhases.length - 1);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((text) => text || undefined)
    .optional();

/** A link to a private report elsewhere, never a public one by default. */
const privateLinkSchema = z
  .url({ protocol: /^https$/ })
  .max(500)
  .optional()
  .or(z.literal("").transform(() => undefined));

export const pilotCampaignInputSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
});

export const pilotCampaignRefSchema = z.strictObject({
  campaignId: z.uuid(),
});

export const pilotPhaseChangeSchema = z.strictObject({
  campaignId: z.uuid(),
  phase: pilotPhaseSchema,
});

export const pilotNewDefectSchema = z.strictObject({
  title: z.string().trim().min(1).max(120),
  severity: pilotSeveritySchema,
  description: optionalText(2000),
  link: privateLinkSchema,
});

/**
 * One test run, from the lead (pilot-ui.md «Ett testkort»). The time and
 * the app's version are the server's. A failure is a defect, new or one
 * already reported; a failure, a block and «not relevant» say why.
 */
export const pilotRunInputSchema = z
  .strictObject({
    campaignId: z.uuid(),
    testId: pilotTestIdSchema,
    status: pilotRunStatusSchema,
    appVersion: pilotAppVersionSchema,
    environment: pilotEnvironmentSchema,
    device: pilotDeviceSchema,
    /** Operating system and browser, such as «iOS 18 · Safari». */
    platform: optionalText(60),
    /** Whether the tester needed help; unknown when not observed. */
    helped: z.boolean().nullable(),
    /** The participant who tried it, or null for the lead. */
    testerId: z.uuid().nullable(),
    note: optionalText(1000),
    defectId: z.uuid().optional(),
    newDefect: pilotNewDefectSchema.optional(),
  })
  .superRefine((run, context) => {
    if (pilotStatusesNeedingNote.has(run.status) && !run.note) {
      context.addIssue({ code: "custom", path: ["note"], message: "required" });
    }

    const defects = [run.defectId, run.newDefect].filter(Boolean).length;

    if (run.status === "failed" ? defects !== 1 : defects !== 0) {
      context.addIssue({
        code: "custom",
        path: ["newDefect"],
        message: "a failure has exactly one defect, nothing else has any",
      });
    }
  });
export type PilotRunInput = z.input<typeof pilotRunInputSchema>;

/** «Må testes igjen» for several tests at once, such as after a fix. */
export const pilotRetestInputSchema = z.strictObject({
  campaignId: z.uuid(),
  appVersion: pilotAppVersionSchema,
  testIds: z
    .array(pilotTestIdSchema)
    .min(1)
    .max(100)
    .refine((ids) => new Set(ids).size === ids.length),
  note: optionalText(1000),
});

export const pilotDefectInputSchema = z.strictObject({
  campaignId: z.uuid(),
  ...pilotNewDefectSchema.shape,
});

export const pilotDefectChangeSchema = z
  .strictObject({
    defectId: z.uuid(),
    severity: pilotSeveritySchema.optional(),
    status: pilotDefectStatusSchema.optional(),
  })
  .refine((change) => change.severity || change.status, {
    path: ["status"],
  });

export const pilotParticipantInputSchema = z.strictObject({
  email: emailAddressSchema,
});

export const pilotParticipantRefSchema = z.strictObject({
  participantId: z.uuid(),
});

export const pilotAssignmentInputSchema = z.strictObject({
  campaignId: z.uuid(),
  testId: pilotTestIdSchema,
  participantId: z.uuid(),
  /** A short goal for the participant, never a click-by-click recipe. */
  goal: z.string().trim().min(1).max(200),
});

export const pilotAssignmentRefSchema = z.strictObject({
  assignmentId: z.uuid(),
});

export const pilotTaskReportSchema = z.strictObject({
  assignmentId: z.uuid(),
  outcome: pilotOutcomeSchema,
  comment: optionalText(500),
});

export const pilotTestRefSchema = z.strictObject({
  testId: pilotTestIdSchema,
});

export const pilotRequirementIdSchema = z.enum(
  pilotRequirements.map((requirement) => requirement.id) as [
    string,
    ...string[],
  ],
);

/** What one automatic check found. A check that could not run says why. */
export const pilotCheckStatusSchema = z.enum(["passed", "failed", "unchecked"]);
export type PilotCheckStatus = z.infer<typeof pilotCheckStatusSchema>;

export const pilotCheckLinkSchema = z.strictObject({
  label: z.string().min(1).max(80),
  href: z.url({ protocol: /^https$/ }).max(500),
});
export type PilotCheckLink = z.infer<typeof pilotCheckLinkSchema>;

/**
 * One requirement's automatic check: the outcome in plain words, and the
 * technical details and sources behind it, shown on request.
 */
export const pilotCheckResultSchema = z.strictObject({
  requirementId: pilotRequirementIdSchema,
  status: pilotCheckStatusSchema,
  summary: z.string().min(1).max(300),
  details: z.array(z.string().min(1).max(250)).max(12),
  links: z.array(pilotCheckLinkSchema).max(6),
});
export type PilotCheckResult = z.infer<typeof pilotCheckResultSchema>;

/**
 * The automatic checks the server ran, for the campaign's current phase.
 * Only the server fills it in (the route runs the checks); the browser
 * sends nothing but the campaign.
 */
export const pilotReadinessCheckSchema = z.strictObject({
  campaignId: z.uuid(),
  results: z.array(pilotCheckResultSchema).max(pilotRequirements.length),
});

/** The lead confirms a manual requirement, saying how it was checked. */
export const pilotConfirmationInputSchema = z.strictObject({
  campaignId: z.uuid(),
  requirementId: pilotRequirementIdSchema,
  note: z.string().trim().min(1).max(1000),
});

export const pilotConfirmationRefSchema = z.strictObject({
  campaignId: z.uuid(),
  requirementId: pilotRequirementIdSchema,
});

export const pilotExportKindSchema = z.enum(["results", "summary"]);
export type PilotExportKind = z.infer<typeof pilotExportKindSchema>;

export const pilotExportInputSchema = z.strictObject({
  kind: pilotExportKindSchema,
  /** An earlier campaign; the current one when left out. */
  campaignId: z.uuid().optional(),
});

/** How an export is downloaded: a spreadsheet holds the runs only. */
export const pilotExportFormatSchema = z.enum(["json", "csv"]);
export type PilotExportFormat = z.infer<typeof pilotExportFormatSchema>;

// Read models

const areaCodeSchema = z.enum(
  pilotAreas.map((area) => area.code) as [string, ...string[]],
);

export const pilotRoleSchema = z.strictObject({
  role: z.enum(["lead", "participant"]),
});
export type PilotRole = z.infer<typeof pilotRoleSchema>;

export const pilotCampaignSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  phase: pilotPhaseSchema,
  startedAt: z.iso.datetime(),
  closedAt: z.iso.datetime().nullable(),
});
export type PilotCampaign = z.infer<typeof pilotCampaignSchema>;

/** How many tests stand at each status. */
export const pilotCountsSchema = z.strictObject(
  Object.fromEntries(
    pilotTestStatusSchema.options.map((status) => [
      status,
      z.number().int().nonnegative(),
    ]),
  ) as Record<PilotTestStatus, z.ZodNumber>,
);
export type PilotCounts = z.infer<typeof pilotCountsSchema>;

const progressGroupSchema = z.strictObject({
  key: z.string(),
  total: z.number().int().nonnegative(),
  counts: pilotCountsSchema,
});

/** What stands between a phase and the next (pilot-testplan.md §3, §5). */
export const pilotGateSchema = z.strictObject({
  phase: pilotPhaseSchema,
  /** Basis tests of this phase or earlier that have not passed. */
  basisNotPassed: z.array(z.string()),
  /** Other tests of this phase or earlier without a result that counts. */
  untried: z.array(z.string()),
  /** Open P0 and P1 defects, which stop the pilot or the part they hit. */
  blockingDefects: z.number().int().nonnegative(),
  open: z.boolean(),
});
export type PilotGate = z.infer<typeof pilotGateSchema>;

export const pilotProgressSchema = z.strictObject({
  total: z.number().int().nonnegative(),
  counts: pilotCountsSchema,
  byArea: z.array(progressGroupSchema),
  byPhase: z.array(progressGroupSchema),
  byPriority: z.array(progressGroupSchema),
  gates: z.array(pilotGateSchema),
});
export type PilotProgress = z.infer<typeof pilotProgressSchema>;

export const pilotTestSummarySchema = z.strictObject({
  id: z.string(),
  area: areaCodeSchema,
  priority: z.enum(pilotPriorities),
  phase: pilotPhaseSchema,
  action: z.string(),
  expected: z.string(),
  status: pilotTestStatusSchema,
  lastRunAt: z.iso.datetime().nullable(),
  runs: z.number().int().nonnegative(),
  openDefects: z.number().int().nonnegative(),
  /** Pseudonyms of the participants it is assigned to now. */
  assignees: z.array(z.string()),
});
export type PilotTestSummary = z.infer<typeof pilotTestSummarySchema>;

export const pilotDefectSchema = z.strictObject({
  id: z.uuid(),
  /** «F-3»: short and stable within the campaign. */
  number: z.number().int().positive(),
  title: z.string(),
  description: z.string().nullable(),
  link: z.string().nullable(),
  severity: pilotSeveritySchema,
  status: pilotDefectStatusSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  /** The tests whose runs failed with it. */
  testIds: z.array(z.string()),
});
export type PilotDefect = z.infer<typeof pilotDefectSchema>;

/**
 * Where a requirement stands: passed only on a documented ground (a check
 * that passed within `pilotCheckFreshMs`, the journal, or the lead's
 * confirmation); a manual one without a confirmation needs one.
 */
export const pilotRequirementStatusSchema = z.enum([
  "passed",
  "failed",
  "unchecked",
  "needs_confirmation",
]);
export type PilotRequirementStatus = z.infer<
  typeof pilotRequirementStatusSchema
>;

export const pilotRequirementStandingSchema = z.strictObject({
  id: pilotRequirementIdSchema,
  status: pilotRequirementStatusSchema,
  /** What was found, in plain words; null before anything was. */
  summary: z.string().nullable(),
  details: z.array(z.string()),
  links: z.array(pilotCheckLinkSchema),
  /** When it was checked or confirmed; null for the journal's own. */
  at: z.iso.datetime().nullable(),
  /** Who checked or confirmed it: the lead's name, when the link is kept. */
  by: z.string().nullable(),
  /** How the lead checked a manual requirement. */
  note: z.string().nullable(),
  /** An automatic check that passed, but too long ago to count now. */
  stale: z.boolean(),
});
export type PilotRequirementStanding = z.infer<
  typeof pilotRequirementStandingSchema
>;

/** A phase's readiness checklist, and whether every requirement holds. */
export const pilotReadinessSchema = z.strictObject({
  phase: pilotPhaseSchema,
  requirements: z.array(pilotRequirementStandingSchema),
  /** When the automatic checks last ran; null if never. */
  checkedAt: z.iso.datetime().nullable(),
  ready: z.boolean(),
});
export type PilotReadiness = z.infer<typeof pilotReadinessSchema>;

export const pilotParticipantSchema = z.strictObject({
  id: z.uuid(),
  pseudonym: z.string(),
  /**
   * The person's name, for the lead's own list only (the link between
   * pseudonym and person); null once the link is gone.
   */
  name: z.string().nullable(),
  openTasks: z.number().int().nonnegative(),
  reports: z.number().int().nonnegative(),
});
export type PilotParticipant = z.infer<typeof pilotParticipantSchema>;

export const pilotWorkspaceSchema = z.strictObject({
  campaign: pilotCampaignSchema.nullable(),
  /** The closed campaigns before it, newest first, kept for export. */
  earlierCampaigns: z.array(pilotCampaignSchema),
  tests: z.array(pilotTestSummarySchema),
  progress: pilotProgressSchema,
  defects: z.array(pilotDefectSchema),
  participants: z.array(pilotParticipantSchema),
  /** The checklists of the phases that have one, for the campaign. */
  readiness: z.array(pilotReadinessSchema),
});
export type PilotWorkspace = z.infer<typeof pilotWorkspaceSchema>;

export const pilotDefectRefSummarySchema = z.strictObject({
  id: z.uuid(),
  number: z.number().int().positive(),
  title: z.string(),
  severity: pilotSeveritySchema,
  status: pilotDefectStatusSchema,
});
export type PilotDefectRefSummary = z.infer<typeof pilotDefectRefSummarySchema>;

/** A test's wording as a run was tried against it (`PilotWording`). */
export const pilotWordingSchema = z.strictObject({
  action: z.string(),
  expected: z.string(),
  prepare: z.array(z.string()),
  steps: z.array(z.string()),
  passWhen: z.array(z.string()),
});

export const pilotRunSchema = z.strictObject({
  id: z.uuid(),
  campaignId: z.uuid(),
  recordedAt: z.iso.datetime(),
  status: pilotRunStatusSchema,
  /** The test's wording when it was run, when it differs from today's. */
  earlierWording: pilotWordingSchema.nullable(),
  appVersion: z.string(),
  /** Null for a test only sent back to be tried again. */
  environment: pilotEnvironmentSchema.nullable(),
  device: pilotDeviceSchema.nullable(),
  platform: z.string().nullable(),
  helped: z.boolean().nullable(),
  /** The participant's pseudonym, or null when the lead tried it. */
  tester: z.string().nullable(),
  note: z.string().nullable(),
  defect: pilotDefectRefSummarySchema.nullable(),
});
export type PilotRun = z.infer<typeof pilotRunSchema>;

export const pilotFeedbackSchema = z.strictObject({
  outcome: pilotOutcomeSchema,
  comment: z.string().nullable(),
  reportedAt: z.iso.datetime(),
});

export const pilotAssignmentSchema = z.strictObject({
  id: z.uuid(),
  participantId: z.uuid(),
  pseudonym: z.string(),
  goal: z.string(),
  assignedAt: z.iso.datetime(),
  withdrawnAt: z.iso.datetime().nullable(),
  /** Newest first. */
  feedback: z.array(pilotFeedbackSchema),
});
export type PilotAssignment = z.infer<typeof pilotAssignmentSchema>;

export const pilotTestDetailSchema = z.strictObject({
  test: pilotTestSummarySchema,
  /** What the tester is told today, in full. */
  wording: pilotWordingSchema,
  campaign: pilotCampaignSchema.nullable(),
  /** Newest first, from every campaign. */
  runs: z.array(pilotRunSchema),
  assignments: z.array(pilotAssignmentSchema),
  participants: z.array(
    z.strictObject({ id: z.uuid(), pseudonym: z.string() }),
  ),
  /** Open defects a new failure can be linked to. */
  openDefects: z.array(pilotDefectRefSummarySchema),
});
export type PilotTestDetail = z.infer<typeof pilotTestDetailSchema>;

/** A participant's own tasks, and nothing about anyone else. */
export const pilotTasksSchema = z.strictObject({
  pseudonym: z.string(),
  tasks: z.array(
    z.strictObject({
      assignmentId: z.uuid(),
      goal: z.string(),
      assignedAt: z.iso.datetime(),
      latest: pilotFeedbackSchema.nullable(),
    }),
  ),
});
export type PilotTasks = z.infer<typeof pilotTasksSchema>;

export const pilotIdOutputSchema = z.strictObject({ id: z.uuid() });

export const pilotParticipantOutputSchema = z.strictObject({
  id: z.uuid(),
  pseudonym: z.string(),
});

export const pilotRunOutputSchema = z.strictObject({
  id: z.uuid(),
  defectId: z.uuid().nullable(),
});

export const pilotRetestOutputSchema = z.strictObject({
  runIds: z.array(z.uuid()),
});

/** Every recorded fact of the journal, with pseudonyms only. */
export const pilotResultsExportSchema = z.strictObject({
  kind: z.literal("results"),
  generatedAt: z.iso.datetime(),
  catalogueVersion: z.string(),
  campaign: pilotCampaignSchema.nullable(),
  runs: z.array(
    pilotRunSchema.omit({ defect: true, earlierWording: true }).extend({
      testId: z.string(),
      revision: z.string(),
      action: z.string(),
      expected: z.string(),
      defectNumber: z.number().int().positive().nullable(),
    }),
  ),
  defects: z.array(pilotDefectSchema),
  tasks: z.array(
    z.strictObject({
      testId: z.string(),
      pseudonym: z.string(),
      goal: z.string(),
      assignedAt: z.iso.datetime(),
      withdrawnAt: z.iso.datetime().nullable(),
      feedback: z.array(pilotFeedbackSchema),
    }),
  ),
});
export type PilotResultsExport = z.infer<typeof pilotResultsExportSchema>;

/** Counts only: no pseudonym, note or comment (pilot-ui.md «Eksport»). */
export const pilotSummaryExportSchema = z.strictObject({
  kind: z.literal("summary"),
  generatedAt: z.iso.datetime(),
  catalogueVersion: z.string(),
  campaign: pilotCampaignSchema.pick({ name: true, phase: true }).nullable(),
  progress: pilotProgressSchema,
  defects: z.array(
    z.strictObject({
      severity: pilotSeveritySchema,
      status: pilotDefectStatusSchema,
      count: z.number().int().nonnegative(),
    }),
  ),
  feedback: z.array(
    z.strictObject({
      outcome: pilotOutcomeSchema,
      count: z.number().int().nonnegative(),
    }),
  ),
});
export type PilotSummaryExport = z.infer<typeof pilotSummaryExportSchema>;

export const pilotExportSchema = z.discriminatedUnion("kind", [
  pilotResultsExportSchema,
  pilotSummaryExportSchema,
]);
export type PilotExport = z.infer<typeof pilotExportSchema>;
