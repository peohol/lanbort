import type { CaseKind, PlatformInterventionKind } from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import { type Kysely, sql } from "kysely";
import type { Actor } from "../actor";
import { caseInterventionRecorded } from "../cases/events";
import type { CaseRecord } from "../cases/model";
import { findCase, settleAssignment } from "../cases/store";
import { DomainError } from "../errors";
import type { EventRecorder } from "../events/recorder";
import type { FromCase, InterventionCase } from "./policies";

/**
 * PS-ADM-015: a platform steward's intervention toward an account, an
 * environment role or a thing starts from a case in the platform queue: a
 * report, or the steward's own inquiry when no report came in. The steward
 * holds the case, is not involved in it, and the intervention is toward
 * what the case is about. It is recorded with the case and its basis
 * (PS-ADM-014, `app.platform_interventions`, whose guard checks the same).
 */
type Db = Kysely<Database>;

/**
 * What an intervention is toward: it is about the case when the case
 * reports one of the accounts (`app.case_reported`, an owner of a reported
 * thing included) or names the thing.
 */
export interface InterventionTargets {
  readonly userIds: readonly string[];
  readonly objectId?: string;
}

/**
 * The case, locked after whatever the command locked first (account rows
 * come first, `account/store.ts`); null when it does not exist.
 */
export async function loadInterventionCase(
  db: Db,
  actor: Actor,
  caseId: string,
  targets: InterventionTargets,
  now: Date,
): Promise<InterventionCase | null> {
  if (actor.kind !== "user") {
    return null;
  }

  const { rows } = await sql<{
    kind: string;
    holds_role: boolean;
    involved: boolean;
    about: boolean;
  }>`
    select
      c.kind,
      app.case_handler_role(c, ${actor.userId}, ${now}) as holds_role,
      app.case_involved(c, ${actor.userId}) as involved,
      (
        exists (
          select 1 from unnest(${[...targets.userIds]}::uuid[]) as target
          where app.case_reported(c, target)
        )
        or c.object_id is not distinct from ${targets.objectId ?? null}::uuid
          and c.object_id is not null
      ) as about
    from app.cases as c
    where c.id = ${caseId}
    for update
  `.execute(db);
  const row = rows[0];

  return row
    ? {
        id: caseId,
        kind: row.kind as CaseKind,
        holdsRole: row.holds_role,
        involved: row.involved,
        about: row.about,
      }
    : null;
}

/**
 * Adds the case to what the command loaded, or null when either is
 * missing.
 */
export async function withInterventionCase<R>(
  db: Db,
  actor: Actor,
  caseId: string,
  now: Date,
  loaded: { resource: R; context: undefined } | null,
  targets: (resource: R) => InterventionTargets,
): Promise<{ resource: R & FromCase; context: undefined } | null> {
  const fromCase =
    loaded &&
    (await loadInterventionCase(
      db,
      actor,
      caseId,
      targets(loaded.resource),
      now,
    ));

  return loaded && fromCase
    ? { resource: { ...loaded.resource, fromCase }, context: undefined }
    : null;
}

/**
 * The steward acts on the open case they hold; it is first returned to the
 * queue if they can no longer handle it.
 */
async function requireHeldCase(
  db: Db,
  caseId: string,
  stewardId: string,
  now: Date,
): Promise<CaseRecord> {
  await settleAssignment(db, caseId, now);
  const c = await findCase(db, caseId);

  if (c?.status !== "open") {
    throw new DomainError("conflict", "The case is closed");
  }

  if (c.assigneeUserId !== stewardId) {
    throw new DomainError("conflict", "The caller does not have the case");
  }

  return c;
}

/** An intervention command's transaction, as the steward who takes it. */
export interface InterventionScope {
  readonly tx: Db;
  readonly actor: Actor;
  readonly input: { readonly caseId: string; readonly basis: string };
  readonly events: EventRecorder;
  readonly now: Date;
}

/** What an intervention did, and toward whom or what. */
export interface InterventionTaken {
  readonly kind: PlatformInterventionKind;
  readonly userId: string;
  readonly otherUserId?: string;
  readonly environmentId?: string;
  readonly objectId?: string;
}

/**
 * Takes an intervention from the case the steward holds, and records it
 * with the case and its basis when it did something (PS-ADM-014); the
 * basis is never in events or logs. `act` returns null when everything was
 * as the intervention would have it already.
 */
export async function intervene<T>(
  { tx, actor, input, events, now }: InterventionScope,
  act: () => Promise<{ result: T; taken: InterventionTaken | null }>,
): Promise<T> {
  if (actor.kind !== "user") {
    throw new Error("Only a steward intervenes");
  }

  const c = await requireHeldCase(tx, input.caseId, actor.userId, now);
  const { result, taken } = await act();

  if (taken) {
    const { id } = await tx
      .insertInto("app.platform_interventions")
      .values({
        case_id: c.id,
        kind: taken.kind,
        user_id: taken.userId,
        other_user_id: taken.otherUserId ?? null,
        environment_id: taken.environmentId ?? null,
        object_id: taken.objectId ?? null,
        basis: input.basis,
        decided_by_user_id: actor.userId,
        decided_at: now,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    events.record(caseInterventionRecorded, {
      resourceId: c.id,
      payload: {
        caseKind: c.kind,
        environmentId: c.environmentId,
        interventionId: id,
        kind: taken.kind,
      },
    });
  }

  return result;
}
