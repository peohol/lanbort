import type { EnvironmentType, TypeChangeProcess } from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import { type Expression, type Kysely, type RawBuilder, sql } from "kysely";
import type { z } from "zod";
import type { EventRecorder } from "../events/recorder";
import {
  environmentTypeChangeClosed,
  environmentTypeChanged,
  membershipConfirmationRequested,
  membershipEnded,
  membershipReviewClosed,
  membershipReviewRequested,
  type typeChangeOutcomeSchema,
} from "./events";
import {
  type CreationSpan,
  concealedSpans,
  processOf,
  type TypePeriod,
} from "./privacy";

/**
 * Database access for type changes (WP-23). Callers hold the lock on the
 * environment row, which serializes type changes with every membership
 * change; the database checks the type history at commit.
 */
type Db = Kysely<Database>;

type TypeChangeOutcome = z.infer<typeof typeChangeOutcomeSchema>;

export interface TypeProposalRecord {
  readonly id: string;
  readonly environmentId: string;
  readonly fromType: EnvironmentType;
  readonly toType: EnvironmentType;
  readonly process: TypeChangeProcess;
  readonly deadline: Date;
}

/** The environment's undecided proposal, if any. */
export async function findOpenProposal(
  db: Db,
  environmentId: string,
): Promise<TypeProposalRecord | null> {
  const row = await db
    .selectFrom("app.environment_type_proposals")
    .select(["id", "environment_id", "from_type", "to_type", "deadline"])
    .where("environment_id", "=", environmentId)
    .where("closed_at", "is", null)
    .executeTakeFirst();

  if (!row) {
    return null;
  }

  const fromType = row.from_type as EnvironmentType;
  const toType = row.to_type as EnvironmentType;

  return {
    id: row.id,
    environmentId: row.environment_id,
    fromType,
    toType,
    process: processOf(fromType, toType),
    deadline: row.deadline,
  };
}

/** Current answers to a proposal by membership id: true is support. */
export async function currentResponses(
  db: Db,
  proposalId: string,
): Promise<Map<string, boolean>> {
  const rows = await db
    .selectFrom("app.environment_type_responses")
    .select(["membership_id", "support"])
    .where("proposal_id", "=", proposalId)
    .where("superseded_at", "is", null)
    .execute();

  return new Map(rows.map((row) => [row.membership_id, row.support]));
}

/** The environment's type history, oldest first (PS-ENV-009). */
export async function typePeriods(
  db: Db,
  environmentId: string,
): Promise<TypePeriod[]> {
  return (await typeHistories(db, [environmentId])).get(environmentId) ?? [];
}

/** The type histories of several environments, by environment id. */
export async function typeHistories(
  db: Db,
  environmentIds: readonly string[],
): Promise<Map<string, TypePeriod[]>> {
  const histories = new Map<string, TypePeriod[]>();

  if (environmentIds.length === 0) {
    return histories;
  }

  const rows = await db
    .selectFrom("app.environment_type_periods")
    .select(["environment_id", "type", "started_at"])
    .where("environment_id", "in", [...environmentIds])
    .orderBy("started_at")
    .execute();

  for (const row of rows) {
    const periods = histories.get(row.environment_id) ?? [];
    periods.push({
      type: row.type as EnvironmentType,
      startedAt: row.started_at,
    });
    histories.set(row.environment_id, periods);
  }

  return histories;
}

/**
 * What a viewer may not see of the environment's history (PS-ENV-009), for
 * lists that filter with `createdOutside`. `viewerActiveSince` is the start
 * of the viewer's current active period, null if they have none.
 */
export async function concealedHistory(
  db: Db,
  environmentId: string,
  viewerActiveSince: Date | null,
): Promise<CreationSpan[]> {
  return concealedSpans(
    await typePeriods(db, environmentId),
    viewerActiveSince,
  );
}

/** SQL: `createdAt` lies outside every concealed span. */
export function createdOutside(
  createdAt: Expression<Date>,
  spans: readonly CreationSpan[],
): RawBuilder<boolean> {
  if (spans.length === 0) {
    return sql<boolean>`true`;
  }

  const within = spans.map((span) =>
    span.until === null
      ? sql`${createdAt} >= ${span.from}`
      : sql`(${createdAt} >= ${span.from} and ${createdAt} < ${span.until})`,
  );

  return sql<boolean>`not (${sql.join(within, sql` or `)})`;
}

export async function closeProposal(
  db: Db,
  proposal: TypeProposalRecord,
  outcome: TypeChangeOutcome,
  details: {
    closedByUserId?: string;
    counts?: { eligible: number; support: number };
  },
  now: Date,
  events: EventRecorder,
): Promise<void> {
  await db
    .updateTable("app.environment_type_proposals")
    .set({
      closed_at: now,
      outcome,
      closed_by_user_id: details.closedByUserId ?? null,
      eligible_count: details.counts?.eligible ?? null,
      support_count: details.counts?.support ?? null,
    })
    .where("id", "=", proposal.id)
    .execute();
  events.record(environmentTypeChangeClosed, {
    resourceId: proposal.environmentId,
    payload: { proposalId: proposal.id, outcome },
  });
}

/**
 * Gives the environment its new type from now on and moves pending
 * membership processes to the rules of that type (vision: «Ventende
 * innmelding når regler eller miljøtype endres»). Members, invitations,
 * roles and established relations stay as they are. An open proposal for the
 * old type can no longer apply, so it lapses.
 */
export async function applyType(
  db: Db,
  environment: { id: string; type: EnvironmentType },
  toType: EnvironmentType,
  proposalId: string | null,
  now: Date,
  events: EventRecorder,
): Promise<void> {
  const open = await findOpenProposal(db, environment.id);
  if (open) {
    await closeProposal(db, open, "lapsed", {}, now, events);
  }

  await db
    .updateTable("app.environments")
    .set({ type: toType, updated_at: now })
    .where("id", "=", environment.id)
    .execute();
  await db
    .insertInto("app.environment_type_periods")
    .values({
      environment_id: environment.id,
      type: toType,
      started_at: now,
      proposal_id: proposalId,
    })
    .execute();
  events.record(environmentTypeChanged, {
    resourceId: environment.id,
    payload: { fromType: environment.type, toType, proposalId },
  });

  await movePendingProcesses(db, environment.id, toType, now, events);
}

async function movePendingProcesses(
  db: Db,
  environmentId: string,
  toType: EnvironmentType,
  now: Date,
  events: EventRecorder,
): Promise<void> {
  const applications = db
    .updateTable("app.environment_memberships")
    .where("environment_id", "=", environmentId)
    .where("state", "=", "pending")
    .where("origin", "=", "application");
  const payload = (row: { id: string; user_id: string }) => ({
    resourceId: row.id,
    payload: { environmentId, userId: row.user_id },
  });

  if (toType === "hidden") {
    // No old application gives access to a hidden environment. It ends
    // neutrally; the administrators may invite the account instead.
    const ended = await applications
      .set({
        state: "ended",
        end_reason: "environment_type_changed",
        ended_at: now,
        review_stage: null,
        updated_at: now,
      })
      .returning(["id", "user_id"])
      .execute();

    for (const row of ended) {
      const { resourceId, payload: base } = payload(row);
      events.record(membershipEnded, {
        resourceId,
        payload: { ...base, reason: "environment_type_changed" },
      });
    }
    return;
  }

  if (toType === "open") {
    // Nobody reviews applications any more, and nobody joins an open
    // environment without saying so: the applicant confirms.
    const asked = await applications
      .set({ review_stage: "confirmation_required", updated_at: now })
      .returning(["id", "user_id"])
      .execute();
    // A passive member's reactivation needs no review in an open
    // environment either; the member rejoins directly.
    const closed = await db
      .updateTable("app.environment_memberships")
      .set({ review_stage: null, updated_at: now })
      .where("environment_id", "=", environmentId)
      .where("state", "=", "passive")
      .where("review_stage", "is not", null)
      .returning(["id", "user_id"])
      .execute();

    for (const row of asked) {
      events.record(membershipConfirmationRequested, payload(row));
    }
    for (const row of closed) {
      const { resourceId, payload: base } = payload(row);
      events.record(membershipReviewClosed, {
        resourceId,
        payload: { ...base, reason: "environment_type_changed" },
      });
    }
    return;
  }

  // Closed: an unconfirmed application from an earlier open period continues
  // under the closed model and goes to the administrators.
  const reviewed = await applications
    .where("review_stage", "=", "confirmation_required")
    .set({ review_stage: "submitted", updated_at: now })
    .returning(["id", "user_id"])
    .execute();

  for (const row of reviewed) {
    const { resourceId, payload: base } = payload(row);
    events.record(membershipReviewRequested, {
      resourceId,
      payload: { ...base, reactivation: false },
    });
  }
}
