import {
  type Loan,
  type LoanRequest,
  type LoanRequestList,
  type LoanRequestPreview,
  type LoanRequestRole,
  loanRequestListQuerySchema,
  loanRequestPageSize,
  loanRequestPreviewQuerySchema,
  loanReadQuerySchema,
  loanRequestReadQuerySchema,
  responsibilityDeclarationVersion,
} from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import type { Kysely } from "kysely";
import type { Actor } from "../actor";
import { defineQuery } from "../commands/query";
import { canSeeEnvironment } from "../environment/policies";
import { findEnvironment, loadEnvironmentAccess } from "../environment/store";
import { calendarDate, toApiInterval } from "../objects/availability";
import { inSnapshot, loadObjectState } from "../objects/state";
import { assessOrigin } from "./access";
import { findOpenAmendment } from "./amendment-store";
import { loadHandoverReading } from "./handover-store";
import {
  type HandoverReading,
  type HandoverStatement,
  isOpen,
  type LoanRequestRecord,
  openStanding,
  presentedLoanStatus,
  presentedStatus,
  type StoredLoanStatus,
  toApiPeriod,
} from "./model";
import {
  listLoanRequestsPolicy,
  loanRoleOf,
  partyRole,
  previewLoanRequestPolicy,
  readLoanPolicy,
  readLoanRequestPolicy,
  roleOf,
} from "./policies";
import { findLoan } from "./reservations";
import { afterCursor, loadRequest, loadTarget, originOf } from "./resources";
import {
  loadAcceptances,
  loadDerivedAvailability,
  loadLenderScope,
  requestSelection,
  termsAt,
  toLoanRequest,
  visibleToLender,
} from "./store";

type Db = Kysely<Database>;

/**
 * PS-LOAN-004/005: what the caller would request through an origin. The
 * object's content, its actual availability, and the version of the terms
 * the request must confirm. Only for those who could make the request now.
 */
export const previewLoanRequest = defineQuery({
  name: "loan_request.preview",
  input: loanRequestPreviewQuerySchema,
  policy: previewLoanRequestPolicy,
  load: ({ db, actor, input, now }) =>
    inSnapshot(db, async (tx) => {
      const object = await loadObjectState(tx, input.objectId);
      const target =
        object &&
        (await loadTarget(
          tx,
          actor,
          object,
          input.environmentId === undefined
            ? { kind: "direct" }
            : { kind: "environment", environmentId: input.environmentId },
          now,
        ));

      if (!target) {
        return null;
      }

      // Nothing more is read for callers the policy will turn away.
      const availability = target.reachable
        ? await loadDerivedAvailability(
            tx,
            target.object.objectId,
            calendarDate(now),
          )
        : null;

      return { resource: { ...target, availability }, context: undefined };
    }),
  present: ({ input, resource }): LoanRequestPreview => ({
    objectId: resource.object.objectId,
    title: resource.object.title,
    categoryId: resource.object.categoryId,
    description: resource.object.description,
    loanTerms: resource.object.loanTerms,
    termsVersion: resource.object.version,
    effectiveAvailability: (resource.availability?.effective ?? []).map(
      toApiInterval,
    ),
    availableForNewLoans: resource.availability?.availableForNewLoans ?? false,
    responsibilityDeclarationVersion:
      input.environmentId === undefined
        ? responsibilityDeclarationVersion
        : null,
  }),
});

/**
 * The environment a request came through, as the viewer may see it. A
 * lender sees it only as an active member there (`visibleToLender`). The
 * borrower made the request there, so they see it as long as they can see
 * the environment at all (PS-ENV-001): a hidden one only while a member.
 */
async function describeOrigin(
  db: Db,
  actor: Actor,
  request: LoanRequestRecord,
  role: LoanRequestRole,
  now: Date,
): Promise<LoanRequest["origin"]> {
  if (request.origin === "direct" || request.environmentId === null) {
    return { kind: "direct" };
  }

  const access =
    role === "borrower"
      ? await loadEnvironmentAccess(db, request.environmentId, actor, now)
      : null;
  const environment =
    role === "borrower"
      ? access &&
        canSeeEnvironment({ actor, now, resource: access, context: undefined })
          .allowed
        ? access.environment
        : null
      : await findEnvironment(db, request.environmentId);

  return {
    kind: "environment",
    environment: environment && {
      id: environment.id,
      type: environment.type,
      name: environment.name,
    },
  };
}

/**
 * The request's status and object as of now. Its status counts access that
 * is gone already (`presentedStatus`); the terms are the confirmed revision,
 * and while confirmation is awaited, the current one too (PS-LOAN-005). A
 * deleted object leaves the ended request without its content, and its
 * owners as they were then.
 */
async function describeObject(db: Db, request: LoanRequestRecord, now: Date) {
  const object =
    request.objectId === null
      ? null
      : await loadObjectState(db, request.objectId);

  if (!object || request.termsVersion === null) {
    return {
      ...presentedStatus(request, openStanding),
      object: null,
      confirmedTerms: null,
      pendingTerms: null,
      ownerIds: request.formerOwnerIds ?? [],
    };
  }

  const standing = isOpen(request.status)
    ? (
        await assessOrigin(
          db,
          object,
          request.borrowerUserId,
          originOf(request),
          now,
        )
      ).standing
    : openStanding;
  const presented = presentedStatus(request, standing);
  const awaiting = presented.status === "awaiting_terms_confirmation";
  const terms = await termsAt(
    db,
    object.objectId,
    awaiting ? [request.termsVersion, object.version] : [request.termsVersion],
  );
  const confirmed = terms.get(request.termsVersion);
  const pending = awaiting ? terms.get(object.version) : undefined;

  if (!confirmed) {
    throw new Error("A loan request without its confirmed revision");
  }

  return {
    ...presented,
    object: { title: confirmed.title, categoryId: confirmed.categoryId },
    confirmedTerms: {
      version: request.termsVersion,
      loanTerms: confirmed.loanTerms,
    },
    pendingTerms: pending
      ? { version: object.version, loanTerms: pending.loanTerms }
      : null,
    ownerIds: object.ownerIds,
  };
}

/**
 * A request as `role` sees it now. Only acceptances of the current
 * declaration by the borrower and by the owners count (PS-LOAN-003).
 */
async function describe(
  db: Db,
  actor: Actor,
  request: LoanRequestRecord,
  role: LoanRequestRole,
  now: Date,
): Promise<LoanRequest> {
  const { ownerIds, ...described } = await describeObject(db, request, now);
  const viewerId = actor.kind === "user" ? actor.userId : null;
  const acceptances =
    request.origin === "direct"
      ? (
          (await loadAcceptances(db, [request.id])).get(request.id) ?? []
        ).filter(
          (acceptance) =>
            acceptance.declarationVersion === responsibilityDeclarationVersion,
        )
      : null;

  return {
    id: request.id,
    objectId: request.objectId,
    role,
    borrowerUserId: request.borrowerUserId,
    origin: await describeOrigin(db, actor, request, role, now),
    start: request.start,
    end: request.end,
    message: request.message,
    ...described,
    responsibility: acceptances && {
      version: responsibilityDeclarationVersion,
      acceptedByBorrower: acceptances.some(
        (acceptance) => acceptance.userId === request.borrowerUserId,
      ),
      acceptedByLender: acceptances.some((acceptance) =>
        ownerIds.includes(acceptance.userId),
      ),
      acceptedByYou: acceptances.some(
        (acceptance) => acceptance.userId === viewerId,
      ),
    },
    loanId:
      request.status === "approved"
        ? ((await findLoan(db, { requestId: request.id }))?.id ?? null)
        : null,
    createdAt: request.createdAt.toISOString(),
    statusChangedAt: request.statusChangedAt.toISOString(),
  };
}

/** One request, for its borrower or an owner who sees it as a lender. */
export const readLoanRequest = defineQuery({
  name: "loan_request.read",
  input: loanRequestReadQuerySchema,
  policy: readLoanRequestPolicy,
  load: ({ db, actor, input, now }) =>
    inSnapshot(db, async (tx) => {
      const loaded = await loadRequest(tx, actor, input.requestId, now);
      const role = loaded && roleOf(actor, loaded.resource);

      if (!loaded) {
        return null;
      }

      // Nothing more is read for callers the policy will turn away.
      const described =
        role && (await describe(tx, actor, loaded.resource.request, role, now));

      return {
        resource: { ...loaded.resource, described },
        context: undefined,
      };
    }),
  present: ({ resource }): LoanRequest => {
    if (!resource.described) {
      throw new Error("The policy allows only a party of the request");
    }

    return resource.described;
  },
});

/**
 * The caller's requests on one side, newest first: those they made as
 * borrower, or those they see as a lender (`visibleToLender`).
 */
export const listLoanRequests = defineQuery({
  name: "loan_request.list",
  input: loanRequestListQuerySchema,
  policy: listLoanRequestsPolicy,
  load: ({ db, actor, input, now }) =>
    inSnapshot(db, async (tx) => {
      if (actor.kind !== "user") {
        return null;
      }

      const query = tx
        .selectFrom("app.loan_requests as request")
        .select(requestSelection)
        .where(afterCursor(input.cursor))
        .orderBy("request.created_at", "desc")
        .orderBy("request.id", "desc")
        .limit(loanRequestPageSize + 1);
      const rows = await (
        input.role === "borrower"
          ? query.where("request.borrower_user_id", "=", actor.userId)
          : query.where(
              visibleToLender(await loadLenderScope(tx, actor.userId, now)),
            )
      ).execute();
      const items = rows.slice(0, loanRequestPageSize).map(toLoanRequest);
      const requests: LoanRequest[] = [];

      // One connection serves the snapshot, so these run one after another.
      for (const request of items) {
        requests.push(await describe(tx, actor, request, input.role, now));
      }

      return {
        resource: {
          requests,
          nextCursor:
            rows.length > loanRequestPageSize
              ? (items.at(-1)?.id ?? null)
              : null,
        },
        context: undefined,
      };
    }),
  present: ({ resource }): LoanRequestList => resource,
});

const presentStatement = (statement: HandoverStatement | null) =>
  statement && {
    outcome: statement.outcome,
    reportedAt: statement.reportedAt.toISOString(),
  };

/**
 * While a reserved loan waits for an answer to «not handed over», when the
 * waiting ends (PS-LOAN-012). Once the other side has answered, or the loan
 * has moved on, there is no deadline.
 */
function answerDue(
  status: StoredLoanStatus,
  { borrower, lender }: HandoverReading,
): string | null {
  const waiting =
    status === "reserved" && (borrower === null) !== (lender === null)
      ? (borrower ?? lender)
      : null;

  return waiting?.answerDueAt?.toISOString() ?? null;
}

/**
 * A loan and what was agreed, for its borrower and its responsible lender
 * (PS-LOAN-006/008), also after it ended. The agreement is its current
 * version: the snapshot taken at approval, with the changes both parties
 * agreed since (PS-LOAN-010), never the object as it is now. An open
 * proposal is shown to both, with the side that made it, so each can see
 * who has to answer (UX-JRN-005).
 */
export const readLoan = defineQuery({
  name: "loan.read",
  input: loanReadQuerySchema,
  policy: readLoanPolicy,
  load: ({ db, input }) =>
    inSnapshot(db, async (tx) => {
      const loan = await findLoan(tx, { loanId: input.loanId });

      if (!loan) {
        return null;
      }

      const amendment = await findOpenAmendment(tx, loan.id);
      const handover = await loadHandoverReading(
        tx,
        loan.id,
        loan.agreement.version,
      );

      return {
        resource: { ...loan, amendment, handover },
        context: undefined,
      };
    }),
  present: ({ actor, resource, now }): Loan => {
    const { ending, handover } = resource;

    return {
      id: resource.id,
      requestId: resource.requestId,
      objectId: resource.objectId,
      role: loanRoleOf(actor, resource) ?? "lender",
      borrowerUserId: resource.borrowerUserId,
      responsibleLenderId: resource.responsibleLenderId,
      status: presentedLoanStatus(
        resource.status,
        resource.agreement.period,
        calendarDate(now),
      ),
      ending: ending && {
        reason: ending.reason,
        endedBy: ending.endedByUserId
          ? partyRole(resource, ending.endedByUserId)
          : null,
        endedAt: ending.endedAt.toISOString(),
      },
      period: toApiPeriod(resource.agreement.period),
      agreement: {
        version: resource.agreement.version,
        agreedAt: resource.agreement.agreedAt.toISOString(),
        objectVersion: resource.agreement.objectVersion,
        title: resource.agreement.title,
        categoryId: resource.agreement.categoryId,
        description: resource.agreement.description,
        loanTerms: resource.agreement.loanTerms,
        responsibilityDeclarationVersion:
          resource.agreement.responsibilityDeclarationVersion,
      },
      amendment: resource.amendment && {
        id: resource.amendment.id,
        period: toApiPeriod(resource.amendment.period),
        proposedBy: resource.amendment.proposerRole,
        proposedAt: resource.amendment.proposedAt.toISOString(),
      },
      handover: {
        borrower: presentStatement(handover.borrower),
        lender: presentStatement(handover.lender),
        answerDueAt: answerDue(resource.status, handover),
      },
      approvedAt: resource.approvedAt.toISOString(),
    };
  },
});
