import {
  acceptResponsibilitySchema,
  confirmLoanTermsSchema,
  createLoanRequestSchema,
  type DesiredEnd,
  type DesiredStart,
  type LoanRequestRole,
  loanRequestReferenceSchema,
  loanRequestResultSchema,
  responsibilityDeclarationVersion,
} from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import type { Kysely } from "kysely";
import type { Actor } from "../actor";
import { defineCommand } from "../commands/command";
import { DomainError } from "../errors";
import type { EventRecorder } from "../events/recorder";
import { calendarDate } from "../objects/availability";
import { actingUserId, loadObjectState } from "../objects/state";
import {
  loanRequestCreated,
  loanRequestDeclined,
  loanRequestResponsibilityAccepted,
  loanRequestTermsConfirmed,
  loanRequestWithdrawn,
} from "./events";
import {
  earliestPeriod,
  isOpen,
  type LoanRequestRecord,
  validateDesiredPeriod,
} from "./model";
import {
  acceptResponsibilityPolicy,
  confirmLoanTermsPolicy,
  createLoanRequestPolicy,
  declineLoanRequestPolicy,
  roleOf,
  withdrawLoanRequestPolicy,
} from "./policies";
import { loadRequest, loadTarget } from "./resources";
import {
  desiredColumns,
  endLoanRequests,
  loadDerivedAvailability,
  termsDiffer,
} from "./store";

function conflict(message: string, fields: readonly string[] = []): never {
  throw new DomainError("conflict", message, fields);
}

const result = (request: Pick<LoanRequestRecord, "id" | "status">) => ({
  requestId: request.id,
  status: request.status,
});

/**
 * PS-LOAN-005: the caller saw the object's terms at `seen`. They must still
 * be the current ones; otherwise the caller has to look again before asking
 * or confirming, so nobody is bound to terms they have not seen.
 */
async function requireCurrentTerms(
  db: Kysely<Database>,
  objectId: string,
  seen: number,
  current: number,
): Promise<void> {
  if (seen > current || (await termsDiffer(db, objectId, seen, current))) {
    conflict("The terms have changed", ["termsVersion"]);
  }
}

async function requireAvailable(
  db: Kysely<Database>,
  objectId: string,
  request: { readonly start: DesiredStart; readonly end: DesiredEnd },
  today: string,
): Promise<void> {
  const { effective } = await loadDerivedAvailability(db, objectId, today);

  if (!earliestPeriod(request.start, request.end, effective, today)) {
    conflict("The object is not available then", ["start"]);
  }
}

/**
 * PS-LOAN-001–005: a request for an object the caller found through an
 * environment, or owned by a friend. Both make the same request; only the
 * origin differs. It needs the access its origin gives
 * ({@link loadTarget}), the terms the caller saw and confirmed, a period
 * within the object's actual availability, and for a direct request the
 * caller's acceptance of the responsibility declaration. Nothing is reserved
 * (WP-31). Retry-safe, so a double submit makes one request.
 */
export const createLoanRequest = defineCommand({
  name: "loan_request.create",
  input: createLoanRequestSchema,
  output: loanRequestResultSchema,
  policy: createLoanRequestPolicy,
  idempotency: "required",
  load: async ({ tx, actor, input, now }) => {
    // Object first; loadTarget locks the rest in order.
    const object = await loadObjectState(tx, input.objectId, { lock: true });
    const target =
      object &&
      (await loadTarget(tx, actor, object, input.origin, now, { lock: true }));

    return target ? { resource: target, context: undefined } : null;
  },
  execute: async ({ tx, actor, input, resource, events, now }) => {
    const { object } = resource;
    const borrowerId = actingUserId(actor);
    const today = calendarDate(now);

    validateDesiredPeriod(input.start, input.end, today);

    if (
      input.origin.kind === "direct" &&
      input.responsibilityDeclarationVersion !==
        responsibilityDeclarationVersion
    ) {
      conflict("The declaration has changed", [
        "responsibilityDeclarationVersion",
      ]);
    }

    await requireCurrentTerms(
      tx,
      object.objectId,
      input.termsVersion,
      object.version,
    );
    await requireAvailable(tx, object.objectId, input, today);

    const environmentId =
      input.origin.kind === "environment" ? input.origin.environmentId : null;
    const request = await tx
      .insertInto("app.loan_requests")
      .values({
        object_id: object.objectId,
        borrower_user_id: borrowerId,
        origin: input.origin.kind,
        environment_id: environmentId,
        publication_id: resource.publicationId,
        ...desiredColumns(input.start, input.end),
        message: input.message,
        terms_version: input.termsVersion,
        created_at: now,
        status_changed_at: now,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    events.record(loanRequestCreated, {
      resourceId: request.id,
      payload: {
        objectId: object.objectId,
        origin: input.origin.kind,
        environmentId,
        termsVersion: input.termsVersion,
      },
    });

    if (input.origin.kind === "direct") {
      await recordAcceptance(
        tx,
        request.id,
        object.objectId,
        borrowerId,
        "borrower",
        now,
        events,
      );
    }

    return { requestId: request.id, status: "requested" as const };
  },
});

async function recordAcceptance(
  db: Kysely<Database>,
  requestId: string,
  objectId: string,
  userId: string,
  role: LoanRequestRole,
  now: Date,
  events: EventRecorder,
): Promise<void> {
  const accepted = await db
    .insertInto("app.loan_request_responsibility_acceptances")
    .values({
      request_id: requestId,
      user_id: userId,
      role,
      declaration_version: responsibilityDeclarationVersion,
      accepted_at: now,
    })
    .onConflict((conflict) => conflict.doNothing())
    .returning("request_id")
    .executeTakeFirst();

  if (accepted) {
    events.record(loanRequestResponsibilityAccepted, {
      resourceId: requestId,
      payload: {
        objectId,
        role,
        declarationVersion: responsibilityDeclarationVersion,
      },
    });
  }
}

/** Loads the request named by the input, locked for the command. */
function lockedRequest({
  tx,
  actor,
  input,
  now,
}: {
  tx: Kysely<Database>;
  actor: Actor;
  input: { readonly requestId: string };
  now: Date;
}) {
  return loadRequest(tx, actor, input.requestId, now, { lock: true });
}

/**
 * The borrower takes the request back. Withdrawing a request that has
 * already ended returns it unchanged.
 */
export const withdrawLoanRequest = defineCommand({
  name: "loan_request.withdraw",
  input: loanRequestReferenceSchema,
  output: loanRequestResultSchema,
  policy: withdrawLoanRequestPolicy,
  idempotency: "required",
  load: (args) => lockedRequest(args),
  execute: async ({ tx, actor, resource, events, now }) => {
    const { request, object } = resource;

    if (!isOpen(request.status) || !object) {
      return result(request);
    }

    await endLoanRequests(
      tx,
      [request.id],
      "withdrawn",
      actingUserId(actor),
      now,
    );
    events.record(loanRequestWithdrawn, {
      resourceId: request.id,
      payload: { objectId: object.objectId },
    });

    return { requestId: request.id, status: "ended" as const };
  },
});

/**
 * An owner who sees the request declines it. It ends for every owner: any
 * co-owner may limit new commitments. Declining a request that has already
 * ended returns it unchanged.
 */
export const declineLoanRequest = defineCommand({
  name: "loan_request.decline",
  input: loanRequestReferenceSchema,
  output: loanRequestResultSchema,
  policy: declineLoanRequestPolicy,
  idempotency: "required",
  load: (args) => lockedRequest(args),
  execute: async ({ tx, actor, resource, events, now }) => {
    const { request, object } = resource;

    if (!isOpen(request.status) || !object) {
      return result(request);
    }

    await endLoanRequests(
      tx,
      [request.id],
      "declined",
      actingUserId(actor),
      now,
    );
    events.record(loanRequestDeclined, {
      resourceId: request.id,
      payload: { objectId: object.objectId },
    });

    return { requestId: request.id, status: "ended" as const };
  },
});

/**
 * PS-LOAN-005: the borrower confirms the object's current terms, which lifts
 * the hold a change of terms put on the request. The version must carry the
 * current terms; confirming terms that are already confirmed changes nothing.
 */
export const confirmLoanTerms = defineCommand({
  name: "loan_request.confirm_terms",
  input: confirmLoanTermsSchema,
  output: loanRequestResultSchema,
  policy: confirmLoanTermsPolicy,
  idempotency: "required",
  load: (args) => lockedRequest(args),
  execute: async ({ tx, input, resource, events, now }) => {
    const { request, object } = resource;

    if (!isOpen(request.status) || !object) {
      conflict("The request has ended");
    }

    await requireCurrentTerms(
      tx,
      object.objectId,
      input.termsVersion,
      object.version,
    );

    if (request.status === "requested") {
      return result(request);
    }

    await tx
      .updateTable("app.loan_requests")
      .set({
        status: "requested",
        terms_version: input.termsVersion,
        status_changed_at: now,
      })
      .where("id", "=", request.id)
      .execute();
    events.record(loanRequestTermsConfirmed, {
      resourceId: request.id,
      payload: { objectId: object.objectId, termsVersion: input.termsVersion },
    });

    return { requestId: request.id, status: "requested" as const };
  },
});

/**
 * PS-LOAN-003: a party of a direct request accepts the responsibility
 * declaration for it: the borrower (who already does so when asking), or an
 * owner who is the borrower's friend. Each acceptance names the version it
 * was given for, and accepting again changes nothing. Whether the owner who
 * approves has accepted is checked at approval (WP-31).
 */
export const acceptResponsibility = defineCommand({
  name: "loan_request.accept_responsibility",
  input: acceptResponsibilitySchema,
  output: loanRequestResultSchema,
  policy: acceptResponsibilityPolicy,
  idempotency: "required",
  load: (args) => lockedRequest(args),
  execute: async ({ tx, actor, input, resource, events, now }) => {
    const { request, object } = resource;

    if (request.origin !== "direct") {
      conflict("Only a direct request has a responsibility declaration");
    }

    if (input.declarationVersion !== responsibilityDeclarationVersion) {
      conflict("The declaration has changed", ["declarationVersion"]);
    }

    if (!isOpen(request.status) || !object) {
      conflict("The request has ended");
    }

    await recordAcceptance(
      tx,
      request.id,
      object.objectId,
      actingUserId(actor),
      roleOf(actor, resource) ?? "borrower",
      now,
      events,
    );

    return result(request);
  },
});
