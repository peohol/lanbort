import type { LoanRequestOrigin } from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import { type Kysely, sql } from "kysely";
import type { Actor } from "../actor";
import { loadEnvironmentAccess } from "../environment/store";
import { loadObjectState, type ObjectState } from "../objects/state";
import { findsObject } from "../publications/queries";
import { lockPair } from "../social/pair";
import {
  assessOrigin,
  type OriginAssessment,
  type RequestOrigin,
} from "./access";
import { findAmendment, type LoanAmendmentRecord } from "./amendment-store";
import { isOpen, type LoanRequestRecord } from "./model";
import type {
  LoanAmendmentResource,
  LoanRequestResource,
  LoanRequestTarget,
  LoanResource,
} from "./policies";
import { findLoan, type LoanRecord } from "./reservations";
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
  /** Null once the object is deleted. */
  readonly object: ObjectState | null;
  /**
   * With `assess`, whether the access behind the open request still holds
   * ({@link assessOrigin}); null otherwise, and for a request that is no
   * longer open.
   */
  readonly assessment: OriginAssessment | null;
}

/**
 * The request with who may act on it, or null if it does not exist. With
 * `lock`, the object is locked first, then (with `assess`) everything the
 * request's access builds on, then the social pair between a lender and the
 * borrower (so a friendship or block cannot change under the decision), then
 * the request itself.
 */
export async function loadRequest(
  db: Db,
  actor: Actor,
  requestId: string,
  now: Date,
  options: { lock?: boolean; assess?: boolean } = {},
): Promise<{ resource: LoadedRequest; context: undefined } | null> {
  const found = await findLoanRequest(db, requestId);

  if (!found || actor.kind !== "user") {
    return null;
  }

  const object =
    found.objectId === null
      ? null
      : await loadObjectState(db, found.objectId, options);
  // An approved or ended request never opens again, so this holds even if
  // it changed before the request's own lock below.
  const assessment =
    options.assess && object && isOpen(found.status)
      ? await assessOrigin(
          db,
          object,
          found.borrowerUserId,
          originOf(found),
          now,
          options,
        )
      : null;

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
      assessment,
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

export interface LoadedLoan extends LoanResource {
  readonly loan: LoanRecord;
  /** Null once an ended loan's object is deleted. */
  readonly object: ObjectState | null;
}

/**
 * The loan with its parties, or null if it does not exist. With `lock`, its
 * object is locked first, then the loan, so changes to one object's loans
 * and its approvals run one after another. Nothing else is checked: the
 * friendship, membership or block between the parties no longer matters
 * once the loan exists (PS-LOAN-002, vision «Blokkering ... før
 * overlevering»).
 */
export async function loadLoan(
  db: Db,
  loanId: string,
  options: { lock?: boolean } = {},
): Promise<LoadedLoan | null> {
  const found = await findLoan(db, { loanId });
  const object =
    found?.objectId == null
      ? null
      : await loadObjectState(db, found.objectId, options);
  const loan = options.lock ? await findLoan(db, { loanId }, options) : found;

  return loan
    ? {
        loan,
        object,
        borrowerUserId: loan.borrowerUserId,
        responsibleLenderId: loan.responsibleLenderId,
      }
    : null;
}

/** The loan, locked for the rest of the command, as its policy resource. */
export async function loadLockedLoan(
  db: Db,
  loanId: string,
): Promise<{ resource: LoadedLoan; context: undefined } | null> {
  const loaded = await loadLoan(db, loanId, { lock: true });

  return loaded ? { resource: loaded, context: undefined } : null;
}

export interface LoadedAmendment extends LoadedLoan, LoanAmendmentResource {
  readonly amendment: LoanAmendmentRecord;
}

/** A proposal on the loan, locked after the loan with `lock`. */
export async function loadAmendment(
  db: Db,
  input: { readonly loanId: string; readonly amendmentId: string },
  options: { lock?: boolean } = {},
): Promise<{ resource: LoadedAmendment; context: undefined } | null> {
  const loaded = await loadLoan(db, input.loanId, options);
  const amendment =
    loaded &&
    (await findAmendment(db, input.loanId, input.amendmentId, options));

  return loaded && amendment
    ? {
        resource: {
          ...loaded,
          amendment,
          proposerRole: amendment.proposerRole,
        },
        context: undefined,
      }
    : null;
}

/** Rows after the cursor, newest first. */
export function afterCursor(cursor: string | undefined) {
  return cursor === undefined
    ? sql<boolean>`true`
    : sql<boolean>`(request.created_at, request.id) < (
        select created_at, id from app.loan_requests where id = ${cursor}
      )`;
}
