import {
  type CaseKind,
  caseOpenedResultSchema,
  escalateReportSchema,
  type ModerationMeasureKind,
  type ModerationMeasureResult,
  moderationMeasureResultSchema,
  type ModerationScope,
  type ReportTargetKind,
  reportInEnvironmentSchema,
  type ReportToPlatform,
  reportToPlatformSchema,
  type TakeModerationMeasure,
  takeModerationMeasureSchema,
} from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import { type Kysely, sql, type Transaction } from "kysely";
import { defineCommand } from "../commands/command";
import {
  type CaseOpening,
  handlerCommand,
  openOrContinue,
  requireActing,
} from "../cases/commands";
import type { CaseRecord } from "../cases/model";
import { loadEnvironmentAccess } from "../environment/store";
import { DomainError } from "../errors";
import type { EventRecorder } from "../events/recorder";
import { loadLoan } from "../loans/resources";
import { actingUserId, loadObjectState } from "../objects/state";
import {
  publicationBlocked,
  publicationRejected,
} from "../publications/events";
import {
  findCurrentPublication,
  setPublicationStatus,
} from "../publications/store";
import { settleReviewWindow } from "../reviews/commands";
import { moderationMeasureTaken, moderationReportEscalated } from "./events";
import {
  escalateReportPolicy,
  reportInEnvironmentPolicy,
  reportToPlatformPolicy,
  takeModerationMeasurePolicy,
} from "./policies";
import {
  findReportedReview,
  findScore,
  hasCurrentMembership,
  insertMeasure,
  lockReporter,
  objectMetBy,
  platformBlockedObjects,
  reportContext,
  type ReportedReview,
  reviewEffects,
} from "./store";
import { rateLimits } from "../abuse/rate-limits";

/**
 * Moderation (WP-52, PS-TRUST-013–016): reports and the measures taken on
 * them. A report is a case with its reporter as the only participant, who
 * writes one entry and then waits for the handler (vision 06). Reporting
 * says nothing about guilt and changes nothing by itself; a measure is the
 * handler's decision, with its reason, and its effect is made in the same
 * transaction.
 *
 * Lock order: a reporter's reports run one after another (an advisory lock),
 * then a reported review's loan is locked like every loan command locks it,
 * then the case. A measure locks the case, then only what it changes: the
 * publication, the object, or the review.
 */
type Db = Kysely<Database>;
type Tx = Transaction<Database>;

function conflict(message: string, fields: readonly string[] = []): never {
  throw new DomainError("conflict", message, fields);
}

function notFound(message: string): never {
  throw new DomainError("not_found", message);
}

async function ownsObject(db: Db, objectId: string, userId: string) {
  const row = await db
    .selectFrom("app.object_owners")
    .select("user_id")
    .where("object_id", "=", objectId)
    .where("user_id", "=", userId)
    .executeTakeFirst();

  return row !== undefined;
}

/** What a report is about, as stored on the case. */
interface ReportSubject {
  readonly target: ReportTargetKind;
  readonly subjectUserId: string | null;
  readonly objectId: string | null;
  readonly reviewId: string | null;
}

/** Opens the report with the reporter's first entry, or continues theirs. */
function openReport(
  tx: Tx,
  events: EventRecorder,
  userId: string,
  report: {
    readonly kind: Extract<CaseKind, "environment_report" | "platform_report">;
    readonly environmentId: string | null;
    readonly subject: ReportSubject;
    readonly escalatedFromCaseId: string | null;
  },
  body: string,
  now: Date,
) {
  const { subject } = report;
  const opening: CaseOpening = {
    key: {
      kind: report.kind,
      userId,
      environmentId: report.environmentId,
      ...subject,
    },
    environmentId: report.environmentId,
    loanId: null,
    subjectUserId: subject.subjectUserId,
    report: {
      target: subject.target,
      objectId: subject.objectId,
      reviewId: subject.reviewId,
      escalatedFromCaseId: report.escalatedFromCaseId,
    },
    participants: [{ userId, role: "reporter" }],
  };

  return openOrContinue(tx, events, userId, opening, body, now);
}

/**
 * An active member reports another member of the environment, or an object
 * published there that they do not own, to its administrators (PS-TRUST-013,
 * vision 07 «Rapportering»). Someone or something the member cannot see in
 * the environment does not exist for them. The member's membership is
 * locked, so their reports run one after another.
 */
export const reportInEnvironment = defineCommand({
  name: "case.report_in_environment",
  input: reportInEnvironmentSchema,
  output: caseOpenedResultSchema,
  policy: reportInEnvironmentPolicy,
  rateLimit: rateLimits.reports,
  idempotency: "required",
  load: async ({ tx, actor, input, now }) => {
    const access = await loadEnvironmentAccess(
      tx,
      input.environmentId,
      actor,
      now,
      { lock: true },
    );

    return access && { resource: access, context: undefined };
  },
  execute: async ({ tx, actor, input, events, now }) => {
    const userId = actingUserId(actor);
    const { environmentId, target } = input;
    let subject: ReportSubject;

    if (target.kind === "user") {
      if (
        target.userId === userId ||
        !(await hasCurrentMembership(tx, environmentId, target.userId))
      ) {
        notFound("No such member of the environment");
      }

      subject = {
        target: "user",
        subjectUserId: target.userId,
        objectId: null,
        reviewId: null,
      };
    } else {
      const publication = await findCurrentPublication(
        tx,
        target.objectId,
        environmentId,
      );

      if (
        publication?.status !== "active" ||
        (await ownsObject(tx, target.objectId, userId))
      ) {
        notFound("No such object in the environment");
      }

      subject = {
        target: "object",
        subjectUserId: null,
        objectId: target.objectId,
        reviewId: null,
      };
    }

    await lockReporter(tx, userId);

    return openReport(
      tx,
      events,
      userId,
      {
        kind: "environment_report",
        environmentId,
        subject,
        escalatedFromCaseId: null,
      },
      input.body,
      now,
    );
  },
});

/** Whether the review stands as published as of `now` (or will once settled). */
async function publishedAsOf(db: Db, review: ReportedReview, now: Date) {
  if (review.status === "published") {
    return true;
  }

  const { rows } = await sql<{ over: boolean }>`
    select exists (
      select 1 from app.loan_review_periods
      where loan_id = ${review.loanId} and status = 'open' and due_at <= ${now}
    ) as over
  `.execute(db);

  return review.status === "hidden" && (rows[0]?.over ?? false);
}

/** What the caller reports to the platform, and whether they can reach it. */
async function resolvePlatformTarget(
  db: Db,
  userId: string,
  target: ReportToPlatform["target"],
  now: Date,
): Promise<{ reachable: boolean; subject: ReportSubject; loanId?: string }> {
  switch (target.kind) {
    case "user":
      return {
        reachable:
          target.userId !== userId &&
          (await reportContext(db, userId, target.userId)),
        subject: {
          target: "user",
          subjectUserId: target.userId,
          objectId: null,
          reviewId: null,
        },
      };
    case "object":
      return {
        reachable: await objectMetBy(db, target.objectId, userId),
        subject: {
          target: "object",
          subjectUserId: null,
          objectId: target.objectId,
          reviewId: null,
        },
      };
    default: {
      const review = await findReportedReview(db, target.reviewId);
      const aboutReview = target.kind === "review";
      const reported = aboutReview
        ? review?.authorUserId
        : review?.response?.authorUserId;
      const reachable =
        review !== null &&
        reported !== undefined &&
        (aboutReview
          ? review.subjectUserId === userId
          : review.authorUserId === userId && review.response?.body != null) &&
        (await publishedAsOf(db, review, now));

      return {
        reachable,
        subject: {
          target: target.kind,
          subjectUserId: reported ?? null,
          objectId: null,
          reviewId: target.reviewId,
        },
        ...(review ? { loanId: review.loanId } : {}),
      };
    }
  }
}

/**
 * A user reports a user they have a context with, an object they have met, a
 * published review about them or the response to their own review to the
 * platform stewards (PS-TRUST-013; vision 07: both a review and its response
 * can be reported). It does not depend on a block, and a block takes away
 * none of that context: reporting and blocking go together. A review whose window is over is published first.
 */
export const reportToPlatform = defineCommand({
  name: "case.report_to_platform",
  input: reportToPlatformSchema,
  output: caseOpenedResultSchema,
  policy: reportToPlatformPolicy,
  rateLimit: rateLimits.reports,
  idempotency: "required",
  load: async ({ tx, actor, input, now }) => {
    if (actor.kind !== "user") {
      return null;
    }

    await lockReporter(tx, actor.userId);

    const resolved = await resolvePlatformTarget(
      tx,
      actor.userId,
      input.target,
      now,
    );

    return { resource: resolved, context: undefined };
  },
  execute: async ({ tx, actor, input, resource, events, now }) => {
    const userId = actingUserId(actor);

    if (resource.loanId !== undefined) {
      const loaded = await loadLoan(tx, resource.loanId, { lock: true });

      if (!loaded) {
        throw new Error("A review's loan disappeared");
      }

      await settleReviewWindow(tx, loaded, now, events);
    }

    return openReport(
      tx,
      events,
      userId,
      {
        kind: "platform_report",
        environmentId: null,
        subject: resource.subject,
        escalatedFromCaseId: null,
      },
      input.body,
      now,
    );
  },
});

/** What a report is about, from its case. */
function subjectOf(c: CaseRecord): ReportSubject {
  if (c.reportTarget === null) {
    conflict("The case is not a report");
  }

  return {
    target: c.reportTarget,
    subjectUserId: c.subjectUserId,
    objectId: c.objectId,
    reviewId: c.reviewId,
  };
}

/**
 * PS-TRUST-016, PS-OBJ-017: the acting administrator takes an environment
 * report to the platform, as a separate report about the same target with
 * what they add. The local report goes on as it is. The administrator is
 * the new report's reporter, so they never handle it as a steward.
 */
export const escalateReport = handlerCommand(
  "case.escalate",
  escalateReportSchema,
  escalateReportPolicy,
  async ({ tx, c, userId, input, events, now }) => {
    requireActing(c, userId);

    if (c.kind !== "environment_report" || c.environmentId === null) {
      conflict("Only an environment report goes to the platform");
    }

    await lockReporter(tx, userId);

    const opened = await openReport(
      tx,
      events,
      userId,
      {
        kind: "platform_report",
        environmentId: null,
        subject: subjectOf(c),
        escalatedFromCaseId: c.id,
      },
      input.body,
      now,
    );

    if (opened.created) {
      events.record(moderationReportEscalated, {
        resourceId: c.id,
        payload: {
          environmentId: c.environmentId,
          platformCaseId: opened.caseId,
        },
      });
    }

    return opened;
  },
  caseOpenedResultSchema,
);

/** What a measure records, and the effect it then makes. */
interface PreparedMeasure {
  readonly environmentId: string | null;
  readonly objectId: string | null;
  readonly reviewId: string | null;
  readonly dimension: string | null;
  readonly removedText: string | null;
  readonly removedScore: number | null;
  apply(events: EventRecorder): Promise<void>;
}

interface MeasureContext {
  readonly tx: Tx;
  readonly c: CaseRecord;
  readonly input: TakeModerationMeasure;
  readonly now: Date;
}

/**
 * Each measure: on which report kind and target it is taken, its scope, and
 * how it checks and makes its effect. Local measures concern the reported
 * object's publication in the environment only (PS-OBJ-017); everything with
 * a global effect is the platform's (PS-TRUST-013/016).
 */
interface MeasureSpec {
  readonly caseKind: Extract<
    CaseKind,
    "environment_report" | "platform_report"
  >;
  readonly target: ReportTargetKind;
  readonly scope: ModerationScope;
  prepare(context: MeasureContext): Promise<PreparedMeasure>;
}

const noRemoval = { dimension: null, removedText: null, removedScore: null };

function publicationMeasure(
  status: "rejected" | "blocked",
  event: typeof publicationRejected,
): MeasureSpec {
  return {
    caseKind: "environment_report",
    target: "object",
    scope: "environment",
    prepare: async ({ tx, c, now }) => {
      const objectId = c.objectId as string;
      const environmentId = c.environmentId as string;
      const publication = await findCurrentPublication(
        tx,
        objectId,
        environmentId,
        { lock: true },
      );

      if (
        publication?.status !== "pending" &&
        publication?.status !== "active"
      ) {
        conflict("The object is not published in the environment");
      }

      return {
        environmentId,
        objectId,
        reviewId: null,
        ...noRemoval,
        apply: async (events) => {
          await setPublicationStatus(tx, publication.id, status, now);
          events.record(event, {
            resourceId: publication.id,
            payload: { objectId, environmentId },
          });
        },
      };
    },
  };
}

function objectMeasure(blocks: boolean): MeasureSpec {
  return {
    caseKind: "platform_report",
    target: "object",
    scope: "platform",
    prepare: async ({ tx, c }) => {
      const objectId = c.objectId as string;

      // Loan requests and approvals lock the object first, so they see the
      // block once this commits, or are decided before it.
      if (!(await loadObjectState(tx, objectId, { lock: true }))) {
        conflict("The object no longer exists");
      }

      const blocked =
        (await platformBlockedObjects(tx, [objectId])).length === 1;

      if (blocked === blocks) {
        conflict(
          blocks
            ? "The object is blocked already"
            : "The object is not blocked",
        );
      }

      return {
        environmentId: null,
        objectId,
        reviewId: null,
        ...noRemoval,
        apply: async () => {},
      };
    },
  };
}

/** A published review, locked, that a measure changes. */
async function publishedReview(tx: Tx, c: CaseRecord) {
  const review = await findReportedReview(tx, c.reviewId as string, {
    lock: true,
  });

  if (review?.status !== "published") {
    conflict("The review is no longer published");
  }

  return review;
}

function reviewMeasure(
  target: "review" | "review_response",
  prepare: (
    review: ReportedReview,
    context: MeasureContext,
  ) => Promise<
    Omit<PreparedMeasure, "environmentId" | "objectId" | "reviewId">
  >,
): MeasureSpec {
  return {
    caseKind: "platform_report",
    target,
    scope: "platform",
    prepare: async (context) => {
      const review = await publishedReview(context.tx, context.c);

      return {
        environmentId: null,
        objectId: null,
        reviewId: review.id,
        ...(await prepare(review, context)),
      };
    },
  };
}

const measures: Record<ModerationMeasureKind, MeasureSpec> = {
  publication_rejected: publicationMeasure("rejected", publicationRejected),
  publication_blocked: publicationMeasure("blocked", publicationBlocked),
  object_blocked: objectMeasure(true),
  object_unblocked: objectMeasure(false),
  review_removed: reviewMeasure("review", async (review, { tx }) => ({
    ...noRemoval,
    apply: async () => {
      await reviewEffects.remove(tx, review.id);
    },
  })),
  review_text_removed: reviewMeasure("review", async (review, { tx }) => {
    if (review.body === null) {
      conflict("The review has no text");
    }

    return {
      ...noRemoval,
      removedText: review.body,
      apply: async () => {
        await reviewEffects.removeText(tx, review.id);
      },
    };
  }),
  review_score_removed: reviewMeasure(
    "review",
    async (review, { tx, input }) => {
      const dimension = input.dimension as string;
      const score = await findScore(tx, review.id, dimension);

      if (score === null) {
        conflict("The review has no such score", ["dimension"]);
      }

      return {
        dimension,
        removedText: null,
        removedScore: score,
        apply: async () => {
          await reviewEffects.removeScore(tx, review.id, dimension);
        },
      };
    },
  ),
  review_response_removed: reviewMeasure(
    "review_response",
    async (review, { tx }) => {
      const text = review.response?.body;

      if (text == null) {
        conflict("The response has no text");
      }

      return {
        ...noRemoval,
        removedText: text,
        apply: async () => {
          await reviewEffects.removeResponseText(tx, review.id);
        },
      };
    },
  ),
};

/**
 * PS-TRUST-013–016: the acting handler of an open report takes a measure on
 * what it is about, with its reason. The measure records what it concerns,
 * its scope, the reason, who decided and when; what it removes is kept with
 * it for the handlers, and the review stops counting where it no longer
 * stands (PS-TRUST-014). A local measure stays local: taking it further is a
 * separate platform report (`case.escalate`).
 */
export const takeModerationMeasure = handlerCommand(
  "moderation.take_measure",
  takeModerationMeasureSchema,
  takeModerationMeasurePolicy,
  async ({
    tx,
    c,
    userId,
    input,
    events,
    now,
  }): Promise<ModerationMeasureResult> => {
    requireActing(c, userId);

    const spec = measures[input.measure];

    if (c.kind !== spec.caseKind || c.reportTarget !== spec.target) {
      conflict("This measure does not fit the report", ["measure"]);
    }

    if (
      (input.measure === "review_score_removed") !==
      (input.dimension !== undefined)
    ) {
      throw new DomainError(
        "invalid_input",
        "Only a score's removal names the dimension",
        ["dimension"],
      );
    }

    const prepared = await spec.prepare({ tx, c, input, now });
    const measureId = await insertMeasure(tx, {
      caseId: c.id,
      kind: input.measure,
      scope: spec.scope,
      environmentId: prepared.environmentId,
      objectId: prepared.objectId,
      reviewId: prepared.reviewId,
      dimension: prepared.dimension,
      reason: input.reason,
      decidedByUserId: userId,
      removedText: prepared.removedText,
      removedScore: prepared.removedScore,
      now,
    });

    await prepared.apply(events);
    events.record(moderationMeasureTaken, {
      resourceId: measureId,
      payload: {
        caseId: c.id,
        measure: input.measure,
        scope: spec.scope,
        environmentId: prepared.environmentId,
        objectId: prepared.objectId,
        reviewId: prepared.reviewId,
        dimension: prepared.dimension,
      },
    });

    return { caseId: c.id, measureId, measure: input.measure };
  },
  moderationMeasureResultSchema,
);
