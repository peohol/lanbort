import {
  type CaseActionResult,
  caseActionResultSchema,
  type CaseEntryResult,
  caseEntryResultSchema,
  type CaseOpenedResult,
  caseOpenedResultSchema,
  type PartyStatement,
  privateMessagesPerCaseLimit,
  caseReferenceSchema,
  closeCaseSchema,
  openCaseRoundSchema,
  openEnvironmentContactSchema,
  openLoanMediationSchema,
  type ReportTargetKind,
  reportUnavailabilitySchema,
  transferCaseSchema,
  type WriteCaseEntry,
  writeCaseEntrySchema,
} from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import { type Kysely, sql, type Transaction } from "kysely";
import type { z } from "zod";
import type { Actor } from "../actor";
import type { Policy } from "../authorization/policy";
import { defineCommand, type Loaded } from "../commands/command";
import { loadEnvironmentAccess } from "../environment/store";
import { DomainError } from "../errors";
import type { EventRecorder } from "../events/recorder";
import { mediationOffered } from "../loans/model";
import { requestLoanMediationPolicy } from "../loans/policies";
import { loadLockedLoan } from "../loans/resources";
import { settleDueReturns } from "../loans/return";
import { findLoanRequest } from "../loans/store";
import { calendarDate } from "../objects/availability";
import { actingUserId } from "../objects/state";
import { loadPair, lockPair } from "../social/pair";
import {
  caseAssigned,
  caseClosed,
  caseContactEnded,
  caseEntryAdded,
  caseOpened,
  caseRecused,
  caseReleased,
  caseReportWithdrawn,
  caseRoundOpened,
  caseStatementsShared,
} from "./events";
import {
  type CaseRecord,
  caseKinds,
  type ParticipantRecord,
  type PrivateMessageCopyRecord,
} from "./model";
import {
  type CaseResource,
  claimCasePolicy,
  closeCasePolicy,
  endContactPolicy,
  openCaseRoundPolicy,
  openEnvironmentContactPolicy,
  recuseFromCasePolicy,
  releaseCasePolicy,
  reportUnavailabilityPolicy,
  shareCaseStatementsPolicy,
  transferCasePolicy,
  withdrawReportPolicy,
  writeCaseEntryPolicy,
} from "./policies";
import {
  findCase,
  findEntry,
  findOpenCase,
  insertCase,
  countPrivateMessages,
  insertEntry,
  insertPrivateMessages,
  isCaseHandler,
  loadActions,
  loadHandlerStanding,
  loadParticipants,
  type OpenCaseKey,
  recordAction,
  related,
  setMayWrite,
  settleAssignment,
  copiesFromOwnConversations,
} from "./store";
import { rateLimits } from "../abuse/rate-limits";

/**
 * Administrative cases (WP-45, PS-COM-010–015). Each command locks what it
 * changes first: the case row, and before opening one, what makes it unique
 * (the member's membership, the loan, or the pair of users), so two requests
 * for the same case run one after another and the second writes into the
 * case the first opened.
 */
type Db = Kysely<Database>;
type Tx = Transaction<Database>;

function conflict(message: string): never {
  throw new DomainError("conflict", message);
}

function invalid(field: string, message: string): never {
  throw new DomainError("invalid_input", message, [field]);
}

/** The case as the caller stands to it, or null when it does not exist. */
export async function loadCase(
  db: Db,
  actor: Actor,
  caseId: string,
  now: Date,
  options: { lock?: boolean } = {},
): Promise<Loaded<CaseResource, undefined> | null> {
  if (actor.kind !== "user") {
    return null;
  }

  const record = await findCase(db, caseId, options);

  if (!record) {
    return null;
  }

  const participants = await loadParticipants(db, caseId);

  return {
    resource: {
      case: record,
      participant:
        participants.find(
          (participant) => participant.userId === actor.userId,
        ) ?? null,
      standing: await loadHandlerStanding(db, caseId, actor.userId, now),
    },
    context: undefined,
  };
}

export const eventBase = (c: CaseRecord) => ({
  caseKind: c.kind,
  environmentId: c.environmentId,
});

function recordEntry(
  events: EventRecorder,
  c: CaseRecord,
  entry: {
    readonly id: string;
    readonly capacity: "party" | "handler";
    readonly audience: "parties" | "party" | "handlers";
    readonly correction: boolean;
  },
) {
  events.record(caseEntryAdded, {
    resourceId: c.id,
    payload: {
      ...eventBase(c),
      entryId: entry.id,
      capacity: entry.capacity,
      audience: entry.audience,
      correction: entry.correction,
    },
  });
}

/**
 * PS-COM-014: a correction names the writer's own earlier entry in the case,
 * written in the same capacity and to the same audience; the original stays.
 */
async function requireCorrectable(
  db: Db,
  c: CaseRecord,
  correctsEntryId: string | undefined,
  own: {
    readonly authorUserId: string;
    readonly capacity: "party" | "handler";
    readonly audience: "parties" | "party" | "handlers";
    readonly audienceUserId: string | null;
  },
): Promise<string | null> {
  if (correctsEntryId === undefined) {
    return null;
  }

  const entry = await findEntry(db, c.id, correctsEntryId);

  if (
    !entry ||
    entry.authorUserId !== own.authorUserId ||
    entry.capacity !== own.capacity ||
    entry.audience !== own.audience ||
    entry.audienceUserId !== own.audienceUserId
  ) {
    invalid("correctsEntryId", "Only one's own entry to the same audience");
  }

  return entry.id;
}

/**
 * PS-COM-013 (WP-46): the private messages a participant chose to submit,
 * in the order they were sent. They come from the participant's own device,
 * where they were decrypted; the server has no way into the conversation
 * and checks only that the copy can be what it claims to be: from a
 * conversation the caller is in, sent by one of its participants.
 */
async function privateMessageCopies(
  db: Db,
  c: CaseRecord,
  userId: string,
  copies: PartyStatement["privateMessages"],
  now: Date,
): Promise<PrivateMessageCopyRecord[]> {
  const records = (copies ?? [])
    .map((copy) => ({ ...copy, sentAt: new Date(copy.sentAt) }))
    .sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime());

  if (records.some((copy) => copy.sentAt > now)) {
    invalid("privateMessages", "A message cannot be sent after now");
  }

  if (!(await copiesFromOwnConversations(db, userId, records))) {
    invalid(
      "privateMessages",
      "Every copy is from the caller's own conversation and one of its participants",
    );
  }

  if (
    records.length > 0 &&
    (await countPrivateMessages(db, c.id, userId)) + records.length >
      privateMessagesPerCaseLimit
  ) {
    invalid("privateMessages", "The case holds no more of the caller's copies");
  }

  return records;
}

/**
 * A participant writes to the case while it is open and it is their turn.
 * In a case with turns, that is one entry; then they wait until a handler
 * opens a new round.
 */
async function writeAsParticipant(
  tx: Tx,
  events: EventRecorder,
  c: CaseRecord,
  participant: ParticipantRecord,
  input: PartyStatement & Pick<WriteCaseEntry, "correctsEntryId">,
  now: Date,
): Promise<string> {
  if (c.status !== "open") {
    conflict("The case is closed");
  }

  if (!participant.mayWrite) {
    conflict("The participant waits for a new round");
  }

  const own = {
    authorUserId: participant.userId,
    capacity: "party",
    audience: "parties",
    audienceUserId: null,
  } as const;
  const correctsEntryId = await requireCorrectable(
    tx,
    c,
    input.correctsEntryId,
    own,
  );
  const copies = await privateMessageCopies(
    tx,
    c,
    participant.userId,
    input.privateMessages,
    now,
  );
  const id = await insertEntry(tx, {
    caseId: c.id,
    ...own,
    body: input.body,
    correctsEntryId,
    now,
  });

  await insertPrivateMessages(tx, id, copies);

  if (caseKinds[c.kind].turns) {
    await setMayWrite(tx, c.id, false, participant.userId);
  }

  recordEntry(events, c, { id, ...own, correction: correctsEntryId !== null });

  return id;
}

/**
 * A handler writes while acting on the open case: to every participant, to
 * one of them, or to the handlers only. Once it is closed, any handler may
 * still correct their own entry.
 */
async function writeAsHandler(
  tx: Tx,
  events: EventRecorder,
  c: CaseRecord,
  userId: string,
  input: WriteCaseEntry,
  now: Date,
): Promise<string> {
  const { audience } = input;

  if (input.privateMessages !== undefined) {
    invalid("privateMessages", "Only a participant submits private messages");
  }

  if (audience === undefined) {
    invalid("audience", "A handler names the audience");
  }

  if ((audience === "party") !== (input.toUserId !== undefined)) {
    invalid("toUserId", "Only an entry to one participant names them");
  }

  if (audience !== "handlers") {
    const participants = await loadParticipants(tx, c.id);

    // A steward's own inquiry has no parties to write to (PS-ADM-015).
    if (participants.length === 0) {
      invalid("audience", "Nobody takes part in the case");
    }

    if (
      input.toUserId !== undefined &&
      !participants.some((participant) => participant.userId === input.toUserId)
    ) {
      invalid("toUserId", "Not a participant of the case");
    }
  }

  if (c.status === "open") {
    requireActing(c, userId);
  } else if (input.correctsEntryId === undefined) {
    conflict("The case is closed");
  }

  const own = {
    authorUserId: userId,
    capacity: "handler",
    audience,
    audienceUserId: input.toUserId ?? null,
  } as const;
  const correctsEntryId = await requireCorrectable(
    tx,
    c,
    input.correctsEntryId,
    own,
  );
  const id = await insertEntry(tx, {
    caseId: c.id,
    ...own,
    body: input.body,
    correctsEntryId,
    now,
  });

  recordEntry(events, c, { id, ...own, correction: correctsEntryId !== null });

  return id;
}

/** A handler acts on the case only while nobody else has taken it. */
export function requireActing(c: CaseRecord, userId: string) {
  if (c.assigneeUserId !== null && c.assigneeUserId !== userId) {
    conflict("Another handler has the case");
  }
}

/** The case after its handler, if they can no longer handle it, is gone. */
async function settledCase(tx: Tx, caseId: string, now: Date) {
  await settleAssignment(tx, caseId, now);

  const settled = await findCase(tx, caseId);

  if (!settled) {
    throw new Error("A locked case disappeared");
  }

  return settled;
}

/**
 * Something written in a case, by a participant or by a handler (the
 * policy decided which the caller is).
 */
export const writeCaseEntry = defineCommand({
  name: "case.write",
  input: writeCaseEntrySchema,
  output: caseEntryResultSchema,
  policy: writeCaseEntryPolicy,
  rateLimit: rateLimits.caseEntries,
  idempotency: "required",
  load: ({ tx, actor, input, now }) =>
    loadCase(tx, actor, input.caseId, now, { lock: true }),
  execute: async ({
    tx,
    actor,
    input,
    resource,
    events,
    now,
  }): Promise<CaseEntryResult> => {
    const { participant } = resource;

    if (participant) {
      if (input.audience !== undefined || input.toUserId !== undefined) {
        invalid("audience", "A participant writes to the case");
      }

      return {
        caseId: resource.case.id,
        entryId: await writeAsParticipant(
          tx,
          events,
          resource.case,
          participant,
          input,
          now,
        ),
      };
    }

    const c = await settledCase(tx, resource.case.id, now);

    return {
      caseId: c.id,
      entryId: await writeAsHandler(
        tx,
        events,
        c,
        actingUserId(actor),
        input,
        now,
      ),
    };
  },
});

/** A new case of its kind: its context and its participants. */
export interface CaseOpening {
  readonly key: OpenCaseKey;
  readonly environmentId: string | null;
  readonly loanId: string | null;
  readonly subjectUserId: string | null;
  /** What a moderation report is about (WP-52). */
  readonly report?: {
    readonly target: ReportTargetKind;
    readonly objectId: string | null;
    readonly reviewId: string | null;
    readonly escalatedFromCaseId: string | null;
  };
  readonly participants: readonly Pick<ParticipantRecord, "userId" | "role">[];
}

/**
 * Opens the case with the caller's first entry, or writes it into their
 * open case of the same kind and context, so nobody has to start over
 * (vision 06). The caller has locked what makes the case unique.
 */
export async function openOrContinue(
  tx: Tx,
  events: EventRecorder,
  userId: string,
  opening: CaseOpening,
  statement: PartyStatement,
  now: Date,
): Promise<CaseOpenedResult> {
  const existing = await findOpenCase(tx, opening.key);

  if (existing) {
    const participant = (await loadParticipants(tx, existing.id)).find(
      (candidate) => candidate.userId === userId,
    );

    if (!participant) {
      conflict("The caller is not a participant of the open case");
    }

    return {
      caseId: existing.id,
      entryId: await writeAsParticipant(
        tx,
        events,
        existing,
        participant,
        statement,
        now,
      ),
      created: false,
    };
  }

  const caseId = await insertCase(tx, {
    kind: opening.key.kind,
    environmentId: opening.environmentId,
    loanId: opening.loanId,
    subjectUserId: opening.subjectUserId,
    ...(opening.report ? { report: opening.report } : {}),
    openedByUserId: userId,
    participants: opening.participants,
    now,
  });
  const opened = await findCase(tx, caseId, { lock: true });
  const participant = opening.participants.find(
    (candidate) => candidate.userId === userId,
  );

  if (!opened || !participant) {
    throw new Error("A case opens with its opener as a participant");
  }

  events.record(caseOpened, {
    resourceId: caseId,
    payload: { ...eventBase(opened), loanId: opened.loanId },
  });

  return {
    caseId,
    entryId: await writeAsParticipant(
      tx,
      events,
      opened,
      { ...participant, mayWrite: true },
      statement,
      now,
    ),
    created: true,
  };
}

/**
 * PS-COM-010: an active member writes to the environment's administrators
 * as a function. Their membership is locked, so their contacts run one
 * after another.
 */
export const openEnvironmentContact = defineCommand({
  name: "case.open_environment_contact",
  input: openEnvironmentContactSchema,
  output: caseOpenedResultSchema,
  policy: openEnvironmentContactPolicy,
  rateLimit: rateLimits.contact,
  idempotency: "required",
  load: async ({ tx, actor, input, now }) => {
    const access = await loadEnvironmentAccess(
      tx,
      input.environmentId,
      actor,
      now,
      { lock: true },
    );

    if (!access) {
      return null;
    }

    const removed =
      actor.kind === "user" &&
      (
        await sql<{ removed: boolean }>`
          select app.removed_from_environment(
            ${input.environmentId}, ${actor.userId}
          ) as removed
        `.execute(tx)
      ).rows[0]?.removed === true;

    return { resource: { ...access, removed }, context: undefined };
  },
  execute: async ({ tx, actor, input, events, now }) => {
    const userId = actingUserId(actor);

    return openOrContinue(
      tx,
      events,
      userId,
      {
        key: {
          kind: "environment_contact",
          environmentId: input.environmentId,
          userId,
        },
        environmentId: input.environmentId,
        loanId: null,
        subjectUserId: null,
        participants: [{ userId, role: "requester" }],
      },
      input,
      now,
    );
  },
});

/**
 * A party of a loan that came through an environment asks its
 * administrators to mediate (vision 05): at once when the parties
 * contradict each other about the handover or the return, or once the
 * return has waited for clarification (`mediationOffered`). Both parties
 * take part, each with their own first statement (PS-COM-012). Return
 * confirmations that are due are made first. A friend loan has no
 * administrators, so no mediation.
 */
export const requestLoanMediation = defineCommand({
  name: "loan.request_mediation",
  input: openLoanMediationSchema,
  output: caseOpenedResultSchema,
  policy: requestLoanMediationPolicy,
  rateLimit: rateLimits.caseEntries,
  idempotency: "required",
  load: ({ tx, input }) => loadLockedLoan(tx, input.loanId),
  execute: async ({ tx, actor, input, resource, events, now }) => {
    const { loan } = await settleDueReturns(tx, resource.loan, now, events);
    const request = await findLoanRequest(tx, loan.requestId);
    const environmentId =
      request?.origin === "environment" ? request.environmentId : null;

    if (environmentId === null) {
      conflict("Only a loan through an environment has mediation");
    }

    if (
      !mediationOffered(
        {
          status: loan.status,
          statusChangedAt: loan.statusChangedAt,
          period: loan.agreement.period,
        },
        now,
        calendarDate(now),
      )
    ) {
      conflict("The loan's handover or return is not in question");
    }

    return openOrContinue(
      tx,
      events,
      actingUserId(actor),
      {
        key: { kind: "loan_mediation", loanId: loan.id },
        environmentId,
        loanId: loan.id,
        subjectUserId: null,
        participants: [
          { userId: loan.borrowerUserId, role: "borrower" },
          { userId: loan.responsibleLenderId, role: "lender" },
        ],
      },
      input,
      now,
    );
  },
});

/**
 * PS-COM-015: a confidential report that a user may have died or be
 * permanently unavailable. It only starts a verification by the platform
 * stewards: no account, loan or access changes, and the reporter gets no
 * access to the user's account or private information. Nobody acts for the
 * user either: representative access (PS-ADM-008) is off until OD-0003 is
 * decided. The pair is locked, so a block and a report between them run one
 * after another.
 */
export const reportUnavailability = defineCommand({
  name: "case.report_unavailability",
  input: reportUnavailabilitySchema,
  output: caseOpenedResultSchema,
  policy: reportUnavailabilityPolicy,
  rateLimit: rateLimits.reports,
  idempotency: "required",
  load: async ({ tx, actor, input }) => {
    if (actor.kind !== "user") {
      return null;
    }

    await lockPair(tx, actor.userId, input.userId);

    const pair = await loadPair(tx, actor.userId, input.userId);

    return (
      pair && {
        resource: {
          ...pair,
          related: await related(tx, actor.userId, input.userId),
        },
        context: undefined,
      }
    );
  },
  execute: async ({ tx, actor, input, events, now }) => {
    const userId = actingUserId(actor);

    return openOrContinue(
      tx,
      events,
      userId,
      {
        key: {
          kind: "unavailability_report",
          userId,
          subjectUserId: input.userId,
        },
        environmentId: null,
        loanId: null,
        subjectUserId: input.userId,
        participants: [{ userId, role: "reporter" }],
      },
      input,
      now,
    );
  },
});

/** What a handler's action needs: the open case after settling who has it. */
export interface HandlerAction<I> {
  readonly tx: Tx;
  readonly c: CaseRecord;
  readonly userId: string;
  readonly input: I;
  readonly events: EventRecorder;
  readonly now: Date;
}

/**
 * An action on an open case, a handler's or (as its policy says) a
 * participant's. The case is locked, and returned to the queue first if its
 * handler can no longer handle it.
 */
export function handlerCommand<
  I extends { readonly caseId: string },
  O = CaseActionResult,
>(
  name: string,
  input: z.ZodType<I>,
  policy: Policy<CaseResource, undefined>,
  act: (action: HandlerAction<I>) => Promise<O | void>,
  output: z.ZodType<O> = caseActionResultSchema as unknown as z.ZodType<O>,
) {
  return defineCommand({
    name,
    input,
    output,
    policy,
    idempotency: "required",
    load: ({ tx, actor, input: parsed, now }) =>
      loadCase(tx, actor, parsed.caseId, now, { lock: true }),
    execute: async ({
      tx,
      actor,
      input: parsed,
      resource,
      events,
      now,
    }): Promise<O> => {
      const c = await settledCase(tx, resource.case.id, now);

      if (c.status !== "open") {
        conflict("The case is closed");
      }

      const acted = await act({
        tx,
        c,
        userId: actingUserId(actor),
        input: parsed,
        events,
        now,
      });

      if (acted !== undefined) {
        return acted;
      }

      const after = await findCase(tx, c.id);

      return {
        caseId: c.id,
        status: after?.status ?? c.status,
        assigneeUserId: after?.assigneeUserId ?? null,
      } satisfies CaseActionResult as O;
    },
  });
}

/** PS-COM-011: a handler takes the case while nobody has it. */
export const claimCase = handlerCommand(
  "case.claim",
  caseReferenceSchema,
  claimCasePolicy,
  async ({ tx, c, userId, events, now }) => {
    if (c.assigneeUserId === userId) {
      return;
    }

    requireActing(c, userId);
    await recordAction(tx, {
      caseId: c.id,
      kind: "assigned",
      actorUserId: userId,
      targetUserId: userId,
      now,
    });
    events.record(caseAssigned, {
      resourceId: c.id,
      payload: { ...eventBase(c), assigneeUserId: userId },
    });
  },
);

function requireHolding(c: CaseRecord, userId: string) {
  if (c.assigneeUserId !== userId) {
    conflict("The caller does not have the case");
  }
}

async function release({ tx, c, userId, events, now }: HandlerAction<unknown>) {
  await recordAction(tx, {
    caseId: c.id,
    kind: "released",
    actorUserId: userId,
    now,
  });
  events.record(caseReleased, { resourceId: c.id, payload: eventBase(c) });
}

/** The handler who has the case gives it back to the queue. */
export const releaseCase = handlerCommand(
  "case.release",
  caseReferenceSchema,
  releaseCasePolicy,
  async (action) => {
    requireHolding(action.c, action.userId);
    await release(action);
  },
);

/** The handler who has the case hands it to another who may handle it. */
export const transferCase = handlerCommand(
  "case.transfer",
  transferCaseSchema,
  transferCasePolicy,
  async ({ tx, c, userId, input, events, now }) => {
    requireHolding(c, userId);

    if (
      input.toUserId === userId ||
      !(await isCaseHandler(tx, c.id, input.toUserId, now))
    ) {
      invalid("toUserId", "Not another handler of the case");
    }

    await recordAction(tx, {
      caseId: c.id,
      kind: "assigned",
      actorUserId: userId,
      targetUserId: input.toUserId,
      now,
    });
    events.record(caseAssigned, {
      resourceId: c.id,
      payload: { ...eventBase(c), assigneeUserId: input.toUserId },
    });
  },
);

/**
 * PS-USR-009: a handler who is not impartial steps aside for good; if they
 * have the case, it goes back to the queue first.
 */
export const recuseFromCase = handlerCommand(
  "case.recuse",
  caseReferenceSchema,
  recuseFromCasePolicy,
  async (action) => {
    const { tx, c, userId, events, now } = action;

    if (c.assigneeUserId === userId) {
      await release(action);
    }

    await recordAction(tx, {
      caseId: c.id,
      kind: "recused",
      actorUserId: userId,
      now,
    });
    events.record(caseRecused, { resourceId: c.id, payload: eventBase(c) });
  },
);

/** A new writing round for one participant, or for all of them. */
export const openCaseRound = handlerCommand(
  "case.open_round",
  openCaseRoundSchema,
  openCaseRoundPolicy,
  async ({ tx, c, userId, input, events, now }) => {
    requireActing(c, userId);

    if (!caseKinds[c.kind].turns) {
      conflict("Participants of this case write freely");
    }

    if (
      input.userId !== undefined &&
      !(await loadParticipants(tx, c.id)).some(
        (participant) => participant.userId === input.userId,
      )
    ) {
      invalid("userId", "Not a participant of the case");
    }

    await setMayWrite(tx, c.id, true, input.userId);
    await recordAction(tx, {
      caseId: c.id,
      kind: "round_opened",
      actorUserId: userId,
      targetUserId: input.userId ?? null,
      now,
    });
    events.record(caseRoundOpened, {
      resourceId: c.id,
      payload: { ...eventBase(c), userId: input.userId ?? null },
    });
  },
);

/**
 * PS-COM-012: the parties of a mediation see each other's statements
 * written so far; later statements wait for the next sharing.
 */
export const shareCaseStatements = handlerCommand(
  "case.share_statements",
  caseReferenceSchema,
  shareCaseStatementsPolicy,
  async ({ tx, c, userId, events, now }) => {
    requireActing(c, userId);

    if (!caseKinds[c.kind].separateStatements) {
      conflict("This case has no separate statements");
    }

    await recordAction(tx, {
      caseId: c.id,
      kind: "statements_shared",
      actorUserId: userId,
      now,
    });
    events.record(caseStatementsShared, {
      resourceId: c.id,
      payload: eventBase(c),
    });
  },
);

/**
 * The handler closes the case. It decides nothing about the loan or the
 * account it concerns: a mediator is not a judge (vision 06), and a report
 * changes nothing by itself (PS-COM-015). A report or a mediation is closed
 * with a short closing message to its parties, its last entry
 * (PS-COM-020); the parties learn of it from the notice that the case is
 * closed, not from one of their own.
 */
export const closeCase = handlerCommand(
  "case.close",
  closeCaseSchema,
  closeCasePolicy,
  async ({ tx, c, userId, input, events, now }) => {
    requireActing(c, userId);

    if (caseKinds[c.kind].closingMessage !== (input.body !== undefined)) {
      invalid(
        "body",
        caseKinds[c.kind].closingMessage
          ? "A report or mediation is closed with a closing message"
          : "Only a report or mediation has a closing message",
      );
    }

    if (input.body !== undefined) {
      await insertEntry(tx, {
        caseId: c.id,
        authorUserId: userId,
        capacity: "handler",
        audience: "parties",
        audienceUserId: null,
        body: input.body,
        correctsEntryId: null,
        closing: true,
        now,
      });
    }

    await recordAction(tx, {
      caseId: c.id,
      kind: "closed",
      actorUserId: userId,
      now,
    });
    events.record(caseClosed, { resourceId: c.id, payload: eventBase(c) });
  },
);

/**
 * What a participant's own step returns: never who handles the case, which
 * a participant is not shown.
 */
const participantResult = (c: CaseRecord, status: CaseRecord["status"]) => ({
  caseId: c.id,
  status,
  assigneeUserId: null,
});

/**
 * PS-COM-021: the member who contacted the administrators closes the
 * contact while it is open. Everything written stays, and whoever has it
 * is told.
 */
export const endContact = handlerCommand(
  "case.end_contact",
  caseReferenceSchema,
  endContactPolicy,
  async ({ tx, c, userId, events, now }) => {
    if (caseKinds[c.kind].openerEnds !== "close") {
      conflict("Only a contact is closed by the member who opened it");
    }

    await recordAction(tx, {
      caseId: c.id,
      kind: "closed",
      actorUserId: userId,
      now,
    });
    events.record(caseContactEnded, {
      resourceId: c.id,
      payload: eventBase(c),
    });

    return participantResult(c, "closed");
  },
);

/**
 * PS-COM-021: a reporter withdraws their report. It is recorded and the
 * handlers are told, but nothing sent in is removed, and the report stays
 * open: a handler may still finish the assessment and any measure.
 */
export const withdrawReport = handlerCommand(
  "case.withdraw_report",
  caseReferenceSchema,
  withdrawReportPolicy,
  async ({ tx, c, userId, events, now }) => {
    if (caseKinds[c.kind].openerEnds !== "withdraw") {
      conflict("Only a report is withdrawn");
    }

    if (
      (await loadActions(tx, c.id)).some(({ kind }) => kind === "withdrawn")
    ) {
      conflict("The report is already withdrawn");
    }

    await recordAction(tx, {
      caseId: c.id,
      kind: "withdrawn",
      actorUserId: userId,
      now,
    });
    events.record(caseReportWithdrawn, {
      resourceId: c.id,
      payload: eventBase(c),
    });

    return participantResult(c, "open");
  },
);
