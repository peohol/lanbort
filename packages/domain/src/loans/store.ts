import type {
  DesiredEnd,
  DesiredStart,
  LoanRequestEndReason,
  LoanRequestRole,
  ObjectStatus,
} from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import { type Kysely, type RawBuilder, sql } from "kysely";
import {
  concealedSpans,
  type PositionSpan,
  toOptionalPosition,
} from "../environment/privacy";
import {
  createdOutside,
  typeHistories,
} from "../environment/type-change-store";
import {
  type DerivedAvailability,
  deriveAvailability,
} from "../objects/availability";
import { loadAvailabilityBlocks } from "../objects/blocks";
import { loadAvailability } from "../objects/state";
import type { LoanRequestOriginKind, LoanRequestRecord } from "./model";
import { openLoanRequestStatuses, type StoredLoanRequestStatus } from "./model";

/**
 * Database access for loan requests. Commands pass their transaction and lock
 * what they change. Lock order: object, then environment, membership and
 * publication (WP-25), then the social pairs, then the request.
 */
type Db = Kysely<Database>;

/** The request's columns, with dates as `YYYY-MM-DD` text. */
export const requestSelection = [
  "request.id",
  "request.object_id",
  "request.borrower_user_id",
  "request.origin",
  "request.environment_id",
  "request.publication_id",
  "request.position",
  sql<string | null>`request.desired_start::text`.as("desired_start"),
  sql<string | null>`request.desired_end::text`.as("desired_end"),
  "request.desired_days",
  "request.message",
  "request.terms_version",
  "request.former_owner_ids",
  "request.status",
  "request.end_reason",
  "request.ended_by_user_id",
  "request.created_at",
  "request.status_changed_at",
] as const;

export interface LoanRequestRow {
  id: string;
  object_id: string | null;
  borrower_user_id: string;
  origin: string;
  environment_id: string | null;
  publication_id: string | null;
  position: string | null;
  desired_start: string | null;
  desired_end: string | null;
  desired_days: number | null;
  message: string;
  terms_version: number | null;
  former_owner_ids: string[] | null;
  status: string;
  end_reason: string | null;
  ended_by_user_id: string | null;
  created_at: Date;
  status_changed_at: Date;
}

export function toLoanRequest(row: LoanRequestRow): LoanRequestRecord {
  const start: DesiredStart =
    row.desired_start === null
      ? { kind: "asap" }
      : { kind: "date", date: row.desired_start };
  const end: DesiredEnd =
    row.desired_end !== null
      ? { kind: "date", date: row.desired_end }
      : { kind: "duration", days: row.desired_days ?? 0 };

  return {
    id: row.id,
    objectId: row.object_id,
    borrowerUserId: row.borrower_user_id,
    origin: row.origin as LoanRequestOriginKind,
    environmentId: row.environment_id,
    publicationId: row.publication_id,
    position: toOptionalPosition(row.position),
    start,
    end,
    message: row.message,
    termsVersion: row.terms_version,
    formerOwnerIds: row.former_owner_ids,
    status: row.status as StoredLoanRequestStatus,
    endReason: row.end_reason as LoanRequestEndReason | null,
    endedByUserId: row.ended_by_user_id,
    createdAt: row.created_at,
    statusChangedAt: row.status_changed_at,
  };
}

/** The stored form of the desired period (PS-LOAN-004). */
export function desiredColumns(start: DesiredStart, end: DesiredEnd) {
  return {
    desired_start: start.kind === "date" ? start.date : null,
    desired_end: end.kind === "date" ? end.date : null,
    desired_days: end.kind === "duration" ? end.days : null,
  };
}

export async function findLoanRequest(
  db: Db,
  requestId: string,
  options: { lock?: boolean } = {},
): Promise<LoanRequestRecord | null> {
  let query = db
    .selectFrom("app.loan_requests as request")
    .select(requestSelection)
    .where("request.id", "=", requestId);

  if (options.lock) {
    query = query.forUpdate();
  }

  const row = await query.executeTakeFirst();

  return row ? toLoanRequest(row) : null;
}

/**
 * Ends those of `requestIds` that are still open, and returns their ids.
 * Requests that ended or were approved in the meantime stay as they are.
 */
export async function endLoanRequests(
  db: Db,
  requestIds: readonly string[],
  reason: LoanRequestEndReason,
  endedByUserId: string | null,
  now: Date,
): Promise<string[]> {
  if (requestIds.length === 0) {
    return [];
  }

  const ended = await db
    .updateTable("app.loan_requests")
    .set({
      status: "ended",
      status_changed_at: now,
      ended_at: now,
      end_reason: reason,
      ended_by_user_id: endedByUserId,
    })
    .where("id", "in", [...requestIds])
    .where("status", "in", [...openLoanRequestStatuses])
    .returning("id")
    .execute();

  return ended.map((row) => row.id);
}

/** The object's open requests, oldest first. */
export async function findOpenLoanRequests(
  db: Db,
  objectId: string,
): Promise<LoanRequestRecord[]> {
  const rows = await db
    .selectFrom("app.loan_requests as request")
    .select(requestSelection)
    .where("request.object_id", "=", objectId)
    .where("request.status", "in", [...openLoanRequestStatuses])
    .orderBy("request.created_at")
    .orderBy("request.id")
    .execute();

  return rows.map(toLoanRequest);
}

/**
 * PS-LOAN-005: whether the object's terms at `current` differ from the ones
 * confirmed at `seen`. Decided by the database function the triggers use, so
 * the rule lives in one place.
 */
export async function termsDiffer(
  db: Db,
  objectId: string,
  seen: number,
  current: number,
): Promise<boolean> {
  const row = await db
    .selectNoFrom(
      sql<boolean>`app.loan_terms_differ(${objectId}, ${seen}::integer, ${current}::integer)`.as(
        "differ",
      ),
    )
    .executeTakeFirstOrThrow();

  return row.differ;
}

/**
 * The object's actual availability as of `today`, from its global truth
 * (PS-OBJ-004/005), as requests and agreement changes are checked against
 * it. Requests are only checked on active objects; an archived object has
 * none. A loan's agreement change leaves out the loan's own blocks
 * (`exceptLoanId`).
 */
export async function loadDerivedAvailability(
  db: Db,
  objectId: string,
  today: string,
  status: ObjectStatus = "active",
  options: { readonly exceptLoanId?: string } = {},
): Promise<DerivedAvailability> {
  // One connection serves a transaction, so these run one after another.
  const availability = await loadAvailability(db, [objectId]);
  const blocks = await loadAvailabilityBlocks(db, [objectId]);

  return deriveAvailability({
    status,
    availability: availability.get(objectId) ?? [],
    blocks: (blocks.get(objectId) ?? []).filter(
      ({ loanId }) =>
        options.exceptLoanId === undefined || loanId !== options.exceptLoanId,
    ),
    today,
  });
}

/** The terms of one object version, from its revision. */
export async function termsAt(
  db: Db,
  objectId: string,
  versions: readonly number[],
): Promise<
  Map<number, { title: string; categoryId: string; loanTerms: string | null }>
> {
  const rows =
    versions.length === 0
      ? []
      : await db
          .selectFrom("app.object_revisions")
          .select(["version", "title", "category_id", "loan_terms"])
          .where("object_id", "=", objectId)
          .where("version", "in", [...new Set(versions)])
          .execute();

  return new Map(
    rows.map((row) => [
      row.version,
      {
        title: row.title,
        categoryId: row.category_id,
        loanTerms: row.loan_terms,
      },
    ]),
  );
}

/**
 * Where an owner may see requests as a lender: the environments they are an
 * active member of now, each with the part of its history that is private
 * to them (PS-ENV-009).
 */
export interface LenderScope {
  readonly userId: string;
  readonly environments: readonly {
    readonly environmentId: string;
    readonly concealed: readonly PositionSpan[];
  }[];
}

export async function loadLenderScope(
  db: Db,
  userId: string,
  now: Date,
): Promise<LenderScope> {
  const memberships = await db
    .selectFrom("app.environment_memberships")
    .select(["environment_id", "activated_position"])
    .where("user_id", "=", userId)
    .where("state", "=", "active")
    .where((eb) =>
      eb.or([
        eb("transition_deadline", "is", null),
        eb("transition_deadline", ">", now),
      ]),
    )
    .execute();
  const histories = await typeHistories(
    db,
    memberships.map((membership) => membership.environment_id),
  );

  return {
    userId,
    environments: memberships.map((membership) => ({
      environmentId: membership.environment_id,
      concealed: concealedSpans(
        histories.get(membership.environment_id) ?? [],
        toOptionalPosition(membership.activated_position),
      ),
    })),
  };
}

/**
 * SQL: the request (aliased `request`) was made in an environment where the
 * scope's user is an active member, and not under a stricter type before
 * they became active (PS-ENV-009).
 */
export function madeWithinScope(scope: LenderScope): RawBuilder<boolean> {
  if (scope.environments.length === 0) {
    return sql<boolean>`false`;
  }

  return sql<boolean>`(${sql.join(
    scope.environments.map(
      (environment) =>
        sql`(request.environment_id = ${environment.environmentId}
          and ${createdOutside(sql.ref("request.position"), environment.concealed)})`,
    ),
    sql` or `,
  )})`;
}

/**
 * SQL: the request (aliased `request`) is visible to the scope's user as a
 * lender: as an owner of the object, or of the deleted object when it was
 * deleted. Ownership alone is not enough (docs/architecture/04): the owner
 * also needs the borrower's relation to the origin, so they see neither the
 * borrower nor a hidden origin they could not otherwise see.
 * - direct: they are the borrower's friend;
 * - environment: they are an active member there, and the request was not
 *   made under a stricter type before they became active (PS-ENV-009);
 * - and never across a block in either direction (PS-USR-006), nor for
 *   their own request (made before they became an owner).
 * An approved request is seen only by the owners of the moment it was
 * approved: co-ownership that starts later applies to future loans only.
 * Its responsible lender always sees it: access lost after approval does
 * not take away what the loan needs (PS-LOAN-002, Port B).
 */
export function visibleToLender(scope: LenderScope): RawBuilder<boolean> {
  return sql<boolean>`(
    request.borrower_user_id <> ${scope.userId}
    and (
      exists (
        select 1 from app.loans
        where request_id = request.id and responsible_lender_id = ${scope.userId}
      )
      or (
        (
          exists (
            select 1 from app.object_owners
            where object_id = request.object_id and user_id = ${scope.userId}
          )
          or ${scope.userId} = any(request.former_owner_ids)
        )
        and not exists (
          select 1 from app.loans
          where request_id = request.id
            and not ${scope.userId} = any(owner_ids_at_approval)
        )
        and not app.users_blocked(request.borrower_user_id, ${scope.userId})
        and case request.origin
          when 'direct' then app.users_are_friends(request.borrower_user_id, ${scope.userId})
          else ${madeWithinScope(scope)}
        end
      )
    )
  )`;
}

/** The request's acceptances of the responsibility declaration. */
export interface ResponsibilityAcceptance {
  readonly userId: string;
  readonly role: LoanRequestRole;
  readonly declarationVersion: number;
}

export async function loadAcceptances(
  db: Db,
  requestIds: readonly string[],
): Promise<Map<string, ResponsibilityAcceptance[]>> {
  const acceptances = new Map<string, ResponsibilityAcceptance[]>(
    requestIds.map((id) => [id, []]),
  );

  if (requestIds.length === 0) {
    return acceptances;
  }

  const rows = await db
    .selectFrom("app.loan_request_responsibility_acceptances")
    .select(["request_id", "user_id", "role", "declaration_version"])
    .where("request_id", "in", [...requestIds])
    .orderBy("accepted_at")
    .execute();

  for (const row of rows) {
    acceptances.get(row.request_id)?.push({
      userId: row.user_id,
      role: row.role as LoanRequestRole,
      declarationVersion: row.declaration_version,
    });
  }

  return acceptances;
}
