import {
  type Loan,
  type LoanActions,
  type LoanList,
  loanListQuerySchema,
  loanPageSize,
  type LoanRequest,
  type LoanRequestDetail,
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
import { type Kysely, sql } from "kysely";
import { realNames } from "../account/store";
import type { Actor } from "../actor";
import { defineQuery } from "../commands/query";
import { canSeeEnvironment } from "../environment/policies";
import { findEnvironment, loadEnvironmentAccess } from "../environment/store";
import { calendarDate, toApiInterval } from "../objects/availability";
import { inSnapshot, loadImages, loadObjectState } from "../objects/state";
import { personPageIds, profileIdIn } from "../people/queries";
import { assessOrigin } from "./access";
import { findOpenAmendment, type LoanAmendmentRecord } from "./amendment-store";
import { loanActions } from "./next-steps";
import { loadHandoverReading } from "./handover-store";
import {
  amendmentFits,
  collidingRequests,
  earliestPeriod,
  type HandoverReading,
  latestReturnStatement,
  isOpen,
  mediationOffered,
  type LoanRequestRecord,
  openLoanRequestStatuses,
  openStanding,
  presentedLoanStatus,
  periodChangeable,
  presentedStatus,
  type StoredLoanStatus,
  toApiPeriod,
} from "./model";
import {
  listLoanRequestsPolicy,
  listLoansPolicy,
  loanRoleOf,
  partyRole,
  previewLoanRequestPolicy,
  readLoanPolicy,
  readLoanRequestPolicy,
  roleOf,
} from "./policies";
import {
  awaitingControl,
  findControlConfirmation,
  findLoan,
  type LoanRecord,
} from "./reservations";
import { afterCursor, loadRequest, loadTarget, originOf } from "./resources";
import { presentTransfer } from "./responsibility";
import { findTransfer, loadCoOwnerReach } from "./responsibility-store";
import {
  findPendingReturns,
  loadReturnStatements,
  type RecordedReturnStatement,
} from "./return-store";
import {
  findLoanRequest,
  loadAcceptances,
  loadDerivedAvailability,
  loadLenderScope,
  requestSelection,
  termsAt,
  toLoanRequest,
  visibleToLender,
} from "./store";
import { rateLimits } from "../abuse/rate-limits";
import { blockedWithAny } from "../social/pair";

type Db = Kysely<Database>;

/**
 * What someone who may request the object sees of it now: its actual
 * availability, its pictures, and whether they follow it (PS-OBJ-014).
 */
async function loadSeen(db: Db, actor: Actor, objectId: string, now: Date) {
  const availability = await loadDerivedAvailability(
    db,
    objectId,
    calendarDate(now),
  );
  const images = (await loadImages(db, [objectId])).get(objectId) ?? [];
  const following =
    actor.kind === "user" &&
    (await db
      .selectFrom("app.object_subscriptions")
      .select("id")
      .where("object_id", "=", objectId)
      .where("user_id", "=", actor.userId)
      .executeTakeFirst()) !== undefined;

  return { availability, images, following };
}

/**
 * PS-LOAN-004/005: what the caller would request through an origin. The
 * object's content, its actual availability, and the version of the terms
 * the request must confirm. Only for those who could make the request now.
 */
export const previewLoanRequest = defineQuery({
  name: "loan_request.preview",
  input: loanRequestPreviewQuerySchema,
  policy: previewLoanRequestPolicy,
  rateLimit: rateLimits.lookups,
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
      const seen = target.reachable
        ? await loadSeen(tx, actor, target.object.objectId, now)
        : null;

      return { resource: { ...target, seen }, context: undefined };
    }),
  present: ({ input, resource }): LoanRequestPreview => ({
    objectId: resource.object.objectId,
    title: resource.object.title,
    categoryId: resource.object.categoryId,
    description: resource.object.description,
    loanTerms: resource.object.loanTerms,
    termsVersion: resource.object.version,
    effectiveAvailability: (resource.seen?.availability.effective ?? []).map(
      toApiInterval,
    ),
    availableForNewLoans:
      resource.seen?.availability.availableForNewLoans ?? false,
    responsibilityDeclarationVersion:
      input.environmentId === undefined
        ? responsibilityDeclarationVersion
        : null,
    images: (resource.seen?.images ?? []).map(({ id, width, height }) => ({
      id,
      width,
      height,
    })),
    following: resource.seen?.following ?? false,
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
  const names = await realNames(db, [request.borrowerUserId]);
  const pages = viewerId
    ? await personPageIds(db, viewerId, [request.borrowerUserId], now)
    : new Set<string>();
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
    borrower: {
      realName: names.get(request.borrowerUserId) ?? null,
      profileId: profileIdIn(pages, request.borrowerUserId),
    },
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

/**
 * UX-JRN-005: what approving the request would agree to now, by the same
 * rules as the approval (`approveLoanRequest`): the period it would
 * reserve, and the other open requests the lender sees that it would end
 * because they collide (PS-LOAN-007). Only while it waits for the lender.
 */
async function approvalPreview(
  db: Db,
  actor: Actor,
  request: LoanRequestRecord,
  described: LoanRequest,
  now: Date,
): Promise<LoanRequestDetail["approval"]> {
  if (
    actor.kind !== "user" ||
    described.role !== "lender" ||
    described.status !== "requested" ||
    request.objectId === null
  ) {
    return null;
  }

  const today = calendarDate(now);
  const { effective } = await loadDerivedAvailability(
    db,
    request.objectId,
    today,
  );
  const period = earliestPeriod(request.start, request.end, effective, today);

  if (!period) {
    return { period: null, endsOtherRequests: 0 };
  }

  const scope = await loadLenderScope(db, actor.userId, now);
  const others = await db
    .selectFrom("app.loan_requests as request")
    .select(requestSelection)
    .where("request.object_id", "=", request.objectId)
    .where("request.id", "<>", request.id)
    .where("request.status", "in", [...openLoanRequestStatuses])
    .where(visibleToLender(scope))
    .execute();

  return {
    period: toApiPeriod(period),
    endsOtherRequests: collidingRequests(
      others.map(toLoanRequest),
      period,
      effective,
      today,
    ).length,
  };
}

/**
 * One request, for its borrower or an owner who sees it as a lender, with
 * what approving it would agree to now.
 */
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
      const { request } = loaded.resource;
      const described = role && (await describe(tx, actor, request, role, now));
      const approval =
        described &&
        (await approvalPreview(tx, actor, request, described, now));

      return {
        resource: { ...loaded.resource, described, approval },
        context: undefined,
      };
    }),
  present: ({ resource }): LoanRequestDetail => {
    if (!resource.described) {
      throw new Error("The policy allows only a party of the request");
    }

    return { ...resource.described, approval: resource.approval ?? null };
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
        .$if(input.state === "open", (open) =>
          open.where("request.status", "in", openLoanRequestStatuses),
        )
        .$if(input.objectId !== undefined, (one) =>
          one.where("request.object_id", "=", input.objectId!),
        )
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

const presentStatement = <O extends string>(
  statement: { outcome: O; reportedAt: Date } | null,
) =>
  statement && {
    outcome: statement.outcome,
    reportedAt: statement.reportedAt.toISOString(),
  };

const presentReturnStatement = (statement: RecordedReturnStatement | null) =>
  statement && {
    outcome: statement.outcome,
    reportedAt: statement.reportedAt.toISOString(),
    reportedAs: statement.reportedAs,
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

/** A loan with everything its parties see of it now. */
type LoanDetail = NonNullable<Awaited<ReturnType<typeof loadLoanDetail>>>;

async function loadLoanDetail(
  db: Db,
  loanId: string,
  viewer: Actor,
  now: Date,
) {
  const loan = await findLoan(db, { loanId });

  if (!loan) {
    return null;
  }

  const amendment = await findOpenAmendment(db, loan.id);
  const amendmentAcceptable =
    amendment !== null &&
    (await amendmentAcceptableNow(db, loan, amendment, calendarDate(now)));
  const handover = await loadHandoverReading(db, loan.id);
  const returns = await loadReturnStatements(
    db,
    loan.id,
    loan.agreement.version,
  );
  const pending = await findPendingReturns(db, loan.id);
  const open = await findTransfer(db, loan.id);
  const transfer = open?.possible ? open : null;
  const control =
    loan.ending?.reason === "unresolved"
      ? { confirmedAt: await findControlConfirmation(db, loan.id) }
      : null;
  const parties = [loan.borrowerUserId, loan.responsibleLenderId];
  const names = await realNames(db, parties);
  const pages =
    viewer.kind === "user"
      ? await personPageIds(db, viewer.userId, parties, now)
      : new Set<string>();
  const awaitingControl = control !== null && control.confirmedAt === null;
  const ownerIds =
    loan.objectId === null
      ? []
      : (
          await db
            .selectFrom("app.object_owners")
            .select("user_id")
            .where("object_id", "=", loan.objectId)
            .execute()
        ).map((owner) => owner.user_id);
  // Only while the role can be offered, and only those the offer would
  // accept (`offerResponsibility`).
  const coOwnerIds =
    loan.status === "ended" || open?.possible
      ? []
      : await offerableCoOwners(
          db,
          loan,
          ownerIds.filter((userId) => !parties.includes(userId)),
        );
  const coOwnerNames = await realNames(db, coOwnerIds);
  const mediations = await loadMediations(db, loan.id);

  return {
    ...loan,
    amendment,
    amendmentAcceptable,
    handover,
    returns,
    pending,
    transfer,
    control,
    names,
    pages,
    awaitingControl,
    lenderOwns: awaitingControl && ownerIds.includes(loan.responsibleLenderId),
    coOwners: coOwnerIds.flatMap((userId) => {
      const realName = coOwnerNames.get(userId);

      return realName ? [{ userId, realName }] : [];
    }),
    mediations,
    mediationAvailable:
      !mediations.some(({ open }) => open) &&
      mediationOffered(
        { ...loan, period: loan.agreement.period },
        now,
        calendarDate(now),
      ) &&
      (await findLoanRequest(db, loan.requestId))?.origin === "environment",
  };
}

/**
 * The co-owners the responsible lender's offer would accept now, by the
 * offer's own rules (PS-LOAN-009): one who can step into the lender's side
 * (`app.loan_co_owner_standing`: an owner now, not blocked with the
 * borrower), while the lender is not established as unavailable, and with
 * no block between them and the lender.
 */
async function offerableCoOwners(
  db: Db,
  loan: LoanRecord,
  candidates: readonly string[],
): Promise<string[]> {
  const offerable: string[] = [];

  // One connection serves the snapshot, so these run one after another.
  for (const userId of candidates) {
    const reach = await loadCoOwnerReach(db, loan.id, userId);

    if (
      reach.standing !== null &&
      !reach.lenderUnavailable &&
      !(await blockedWithAny(db, loan.responsibleLenderId, [userId]))
    ) {
      offerable.push(userId);
    }
  }

  return offerable;
}

/**
 * The loan's mediations (PS-LOAN-018), newest first, with who takes part in
 * each: a party sees only one they take part in.
 */
async function loadMediations(db: Db, loanId: string) {
  const rows = await db
    .selectFrom("app.cases as c")
    .innerJoin("app.case_participants as p", "p.case_id", "c.id")
    .select(["c.id", "c.status", "p.user_id"])
    .where("c.kind", "=", "loan_mediation")
    .where("c.loan_id", "=", loanId)
    .orderBy("c.opened_at", "desc")
    .orderBy("c.id", "desc")
    .execute();
  const cases = new Map<
    string,
    { caseId: string; open: boolean; participantIds: string[] }
  >();

  for (const row of rows) {
    const mediation = cases.get(row.id) ?? {
      caseId: row.id,
      open: row.status === "open",
      participantIds: [],
    };
    mediation.participantIds.push(row.user_id);
    cases.set(row.id, mediation);
  }

  return [...cases.values()];
}

/**
 * Whether accepting the open proposal would succeed now, by the checks the
 * acceptance makes (PS-LOAN-010, scenario 26): on the current agreement, a
 * loan that can still change, and every day it adds still open. A proposal
 * reserves nothing, so another loan may have taken those days since.
 */
async function amendmentAcceptableNow(
  db: Db,
  loan: LoanRecord,
  amendment: LoanAmendmentRecord,
  today: string,
): Promise<boolean> {
  if (
    amendment.baseVersion !== loan.agreement.version ||
    !periodChangeable(loan.status) ||
    loan.objectId === null
  ) {
    return false;
  }

  const object = await loadObjectState(db, loan.objectId);

  if (!object) {
    return false;
  }

  const { open } = await loadDerivedAvailability(
    db,
    loan.objectId,
    today,
    object.status,
    { exceptLoanId: loan.id },
  );

  return amendmentFits(
    loan.status,
    loan.agreement.period,
    amendment.period,
    open,
    today,
  );
}

const personOf = (
  { names, pages }: Pick<LoanDetail, "names" | "pages">,
  userId: string,
) => ({
  realName: names.get(userId) ?? null,
  profileId: profileIdIn(pages, userId),
});

const noActions: LoanActions = {
  handover: [],
  return: [],
  undoReturn: false,
  amendment: [],
  responsibility: [],
  confirmControl: false,
  proposeAmendment: null,
  withdrawAmendment: false,
  cancel: false,
  offerResponsibility: [],
  withdrawResponsibility: false,
  requestMediation: false,
};

/** The latest mediation the caller takes part in, if any. */
function ownMediation(
  actor: Actor,
  mediations: LoanDetail["mediations"],
): Loan["mediation"] {
  const own = mediations.find(
    ({ participantIds }) =>
      actor.kind === "user" && participantIds.includes(actor.userId),
  );

  return own ? { caseId: own.caseId, open: own.open } : null;
}

/** The loan as the caller, one of its parties, sees it as of `now`. */
function presentLoan(actor: Actor, resource: LoanDetail, now: Date): Loan {
  const { ending, handover, returns } = resource;
  const role = loanRoleOf(actor, resource);
  const pending = resource.pending.find(
    (own) => actor.kind === "user" && own.userId === actor.userId,
  );

  return {
    id: resource.id,
    requestId: resource.requestId,
    objectId: resource.objectId,
    role: role ?? "lender",
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
    return: {
      borrower: presentReturnStatement(
        latestReturnStatement(returns, "borrower"),
      ),
      lender: presentReturnStatement(latestReturnStatement(returns, "lender")),
      pending: pending
        ? {
            outcome: pending.outcome,
            effectiveAt: pending.effectiveAt.toISOString(),
          }
        : null,
    },
    responsibilityTransfer:
      resource.transfer && presentTransfer(resource.transfer),
    control: resource.control && {
      confirmedAt: resource.control.confirmedAt?.toISOString() ?? null,
    },
    approvedAt: resource.approvedAt.toISOString(),
    parties: {
      borrower: personOf(resource, resource.borrowerUserId),
      lender: personOf(resource, resource.responsibleLenderId),
    },
    mediation: ownMediation(actor, resource.mediations),
    actions:
      actor.kind === "user" && role
        ? loanActions(
            actor,
            role,
            {
              status: resource.status,
              endReason: ending?.reason ?? null,
              period: resource.agreement.period,
              handover,
              returns,
              pending: resource.pending,
              amendment: resource.amendment && {
                proposerRole: resource.amendment.proposerRole,
                acceptable: resource.amendmentAcceptable,
              },
              transfer: resource.transfer,
              awaitingControl: resource.awaitingControl,
              lenderOwns: resource.lenderOwns,
              hasObject: resource.objectId !== null,
              coOwners: resource.coOwners,
              mediationAvailable: resource.mediationAvailable,
            },
            now,
          )
        : noActions,
  };
}

/**
 * A loan and what was agreed, for its borrower and its responsible lender
 * (PS-LOAN-006/008), also after it ended. The agreement is its current
 * version: the snapshot taken at approval, with the changes both parties
 * agreed since (PS-LOAN-010), never the object as it is now. An open
 * proposal is shown to both, with the side that made it, so each can see
 * who has to answer (UX-JRN-005), and so is an open change of the
 * responsible lender (PS-LOAN-009). A co-owner's narrow receipt shows as
 * the lender side's statement, marked as theirs.
 */
export const readLoan = defineQuery({
  name: "loan.read",
  input: loanReadQuerySchema,
  policy: readLoanPolicy,
  load: ({ db, actor, input, now }) =>
    inSnapshot(db, async (tx) => {
      const loan = await loadLoanDetail(tx, input.loanId, actor, now);

      return loan && { resource: loan, context: undefined };
    }),
  present: ({ actor, resource, now }): Loan =>
    presentLoan(actor, resource, now),
});

/**
 * The caller's own loans as borrower or responsible lender (UX-IA-006),
 * most recently approved first, each exactly as `loan.read` shows it. The
 * loans of objects they only co-own are not theirs to see
 * (`loan.list_for_co_owner` has what they may act on).
 */
export const listLoans = defineQuery({
  name: "loan.list",
  input: loanListQuerySchema,
  policy: listLoansPolicy,
  load: ({ db, actor, input, now }) =>
    inSnapshot(db, async (tx) => {
      if (actor.kind !== "user") {
        return null;
      }

      const sides = input.role
        ? [input.role]
        : (["borrower", "lender"] as const);
      const rows = await tx
        .selectFrom("app.loans as loan")
        .select("loan.id")
        .where((eb) =>
          eb.or(
            sides.map((side) =>
              eb(
                side === "borrower"
                  ? "loan.borrower_user_id"
                  : "loan.responsible_lender_id",
                "=",
                actor.userId,
              ),
            ),
          ),
        )
        .where(
          input.state === "awaiting_control"
            ? awaitingControl
            : sql<boolean>`(loan.status = 'ended') = ${input.state === "ended"}`,
        )
        .$if(input.objectId !== undefined, (one) =>
          one.where("loan.object_id", "=", input.objectId!),
        )
        .where(
          input.cursor === undefined
            ? sql<boolean>`true`
            : sql<boolean>`(loan.approved_at, loan.id) < (
                select approved_at, id from app.loans where id = ${input.cursor}
              )`,
        )
        .orderBy("loan.approved_at", "desc")
        .orderBy("loan.id", "desc")
        .limit(loanPageSize + 1)
        .execute();
      const page = rows.slice(0, loanPageSize);
      const loans: LoanDetail[] = [];

      // One connection serves the snapshot, so these run one after another.
      for (const { id } of page) {
        const loan = await loadLoanDetail(tx, id, actor, now);

        if (loan) {
          loans.push(loan);
        }
      }

      return {
        resource: {
          loans,
          nextCursor:
            rows.length > loanPageSize ? (page.at(-1)?.id ?? null) : null,
        },
        context: undefined,
      };
    }),
  present: ({ actor, resource, now }): LoanList => ({
    loans: resource.loans.map((loan) => presentLoan(actor, loan, now)),
    nextCursor: resource.nextCursor,
  }),
});
