import type { LoanRequestOrigin } from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import { type Kysely, sql } from "kysely";
import type { Actor } from "../actor";
import { loadEnvironmentAccess } from "../environment/store";
import { loadObjectState, type ObjectState } from "../objects/state";
import { findsObject } from "../publications/queries";
import { lockPair } from "../social/pair";
import { assessOrigin, type RequestOrigin } from "./access";
import type { LoanRequestRecord } from "./model";
import type { LoanRequestResource, LoanRequestTarget } from "./policies";
import { findLoanRequest, loadLenderScope, visibleToLender } from "./store";

type Db = Kysely<Database>;

/** The request's origin as {@link assessOrigin} takes it. */
export function originOf(request: LoanRequestRecord): RequestOrigin {
  return request.origin === "environment" && request.environmentId !== null
    ? {
        kind: "environment",
        environmentId: request.environmentId,
        publicationId: request.publicationId,
      }
    : { kind: "direct" };
}

export interface LoadedTarget extends LoanRequestTarget {
  readonly object: ObjectState;
  /** The publication a new request would build on. */
  readonly publicationId: string | null;
}

/**
 * Whether `actor` can reach the object through `origin` now: its access
 * stands ({@link assessOrigin}) and, through an environment, they also find
 * the object there, so historical privacy and discovery decide exactly as
 * in the environment's list (PS-ENV-009).
 */
export async function loadTarget(
  db: Db,
  actor: Actor,
  object: ObjectState,
  origin: LoanRequestOrigin,
  now: Date,
  options: { lock?: boolean } = {},
): Promise<LoadedTarget | null> {
  if (actor.kind !== "user") {
    return null;
  }

  const assessment = await assessOrigin(
    db,
    object,
    actor.userId,
    origin.kind === "direct" ? origin : { ...origin, publicationId: null },
    now,
    options,
  );
  let reachable = assessment.standing.kind === "open";

  if (reachable && origin.kind === "environment") {
    const access = await loadEnvironmentAccess(
      db,
      origin.environmentId,
      actor,
      now,
    );
    reachable =
      access !== null &&
      (await findsObject(db, access, object.objectId, actor.userId, now));
  }

  return {
    object,
    ownerIds: object.ownerIds,
    reachable,
    publicationId: assessment.publicationId,
  };
}

/**
 * Whether `userId` may see the request as a lender now
 * ({@link visibleToLender}).
 */
async function seesAsLender(
  db: Db,
  request: LoanRequestRecord,
  userId: string,
  now: Date,
): Promise<boolean> {
  const scope = await loadLenderScope(db, userId, now);
  const row = await db
    .selectFrom("app.loan_requests as request")
    .select("request.id")
    .where("request.id", "=", request.id)
    .where(visibleToLender(scope))
    .executeTakeFirst();

  return row !== undefined;
}

export interface LoadedRequest extends LoanRequestResource {
  readonly request: LoanRequestRecord;
  readonly object: ObjectState;
}

/**
 * The request with who may act on it, or null if it does not exist. With
 * `lock`, the object is locked first, then the social pair between a lender
 * and the borrower (so a friendship or block cannot change under the
 * decision), then the request itself.
 */
export async function loadRequest(
  db: Db,
  actor: Actor,
  requestId: string,
  now: Date,
  options: { lock?: boolean } = {},
): Promise<{ resource: LoadedRequest; context: undefined } | null> {
  const found = await findLoanRequest(db, requestId);
  const object = found && (await loadObjectState(db, found.objectId, options));

  if (!found || !object || actor.kind !== "user") {
    return null;
  }

  if (options.lock && actor.userId !== found.borrowerUserId) {
    await lockPair(db, actor.userId, found.borrowerUserId);
  }

  const request = options.lock
    ? await findLoanRequest(db, requestId, options)
    : found;

  if (!request) {
    return null;
  }

  return {
    resource: {
      request,
      object,
      borrowerUserId: request.borrowerUserId,
      lenderIds:
        actor.userId !== request.borrowerUserId &&
        (await seesAsLender(db, request, actor.userId, now))
          ? [actor.userId]
          : [],
    },
    context: undefined,
  };
}

/** Rows after the cursor, newest first. */
export function afterCursor(cursor: string | undefined) {
  return cursor === undefined
    ? sql<boolean>`true`
    : sql<boolean>`(request.created_at, request.id) < (
        select created_at, id from app.loan_requests where id = ${cursor}
      )`;
}
