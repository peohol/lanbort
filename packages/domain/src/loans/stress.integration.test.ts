import { randomUUID } from "node:crypto";
import type { ReturnOutcome } from "@lanbort/contracts";
import { sql } from "kysely";
import { afterAll, describe, expect, it } from "vitest";
import type { UserActor } from "../actor";
import {
  type CommandDefinition,
  type CommandResult,
  executeCommand,
} from "../commands/command";
import { type DomainErrorCode, isDomainError } from "../errors";
import { connectTestDatabase } from "../testing/database";
import { loanTestKit } from "../testing/loans";
import {
  acceptLoanAmendment,
  declineLoanAmendment,
  proposeLoanAmendment,
  withdrawLoanAmendment,
} from "./amendments";
import { approveLoanRequest } from "./approval";
import { cancelLoan } from "./cancellation";
import { createLoanRequest } from "./commands";
import { reportHandover } from "./handover";
import { reportReturn, undoReturn } from "./return";

/**
 * WP-71: the concurrency and idempotency stress test that quality gate D
 * needs. Where the feature tests race two commands, this suite fires many at
 * once: parallel approvals of one object, the same retry several times at
 * once, double presses with new keys, agreement changes from every side, and
 * a return that reopens while others act on the object. Each burst must
 * leave the data as one order of the commands would (docs/architecture/05):
 * no double booking, no period refused while it was free, one result and
 * one set of events per logical command, and history that only grows.
 * Every refusal is an expected domain answer (PS-NFR-004–005): never a
 * deadlock or constraint error the caller would see as a server failure.
 */
const db = connectTestDatabase();
afterAll(() => db.destroy());

// Starts beyond where the files that run the scheduled jobs move their
// clocks, so those jobs never act on these loans mid-burst. This file runs
// no scheduled job itself: one would act on every due loan in the shared
// database, also other files' waiting ones; return.integration.test.ts
// races the jobs with commands.
const kit = loanTestKit(db, { startInDays: 400 });
const {
  run,
  tick,
  member,
  addCoOwner,
  published,
  environmentOrigin,
  ask,
  day,
  dated,
  stored,
  eventsFor,
} = kit;

/** The command as one press or retry: its own result, with `replayed`. */
const press = <I, R, C, O>(
  command: CommandDefinition<I, R, C, O>,
  actor: UserActor,
  input: object,
  idempotencyKey: string = randomUUID(),
): Promise<CommandResult<O>> =>
  executeCommand(tick(), command, {
    actor,
    input,
    ...(command.idempotency === "none" ? {} : { idempotencyKey }),
  });

/** Fires every call at once and waits for all of them. */
const burst = <T>(calls: readonly (() => Promise<T>)[]) =>
  Promise.allSettled(calls.map((call) => call()));

/**
 * The codes of the refused calls. Anything that is not a domain answer
 * (a deadlock, a constraint the domain should have checked first) fails
 * the test as itself.
 */
function refusals(results: readonly PromiseSettledResult<unknown>[]) {
  return results.flatMap((result) => {
    if (result.status === "fulfilled") {
      return [];
    }

    if (!isDomainError(result.reason)) {
      throw result.reason;
    }

    return [result.reason.code];
  });
}

function expectRefusedOnlyWith(
  results: readonly PromiseSettledResult<unknown>[],
  codes: readonly DomainErrorCode[],
) {
  for (const code of refusals(results)) {
    expect(codes).toContain(code);
  }
}

function values<T>(results: readonly PromiseSettledResult<T>[]): T[] {
  refusals(results);
  return results.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );
}

/** Every call succeeded with the same output. */
function oneAnswer<O>(
  results: readonly PromiseSettledResult<CommandResult<O>>[],
) {
  expect(refusals(results)).toEqual([]);
  const outputs = values(results).map((result) => result.output);
  expect(new Set(outputs.map((output) => JSON.stringify(output))).size).toBe(1);

  return outputs[0]!;
}

/** Small deterministic generator, so a failing round can be replayed. */
function seeded(seed: number) {
  let state = seed;

  return (below: number) => {
    state = (state * 1103515245 + 12345) % 2 ** 31;
    return state % below;
  };
}

const overlaps = (
  a: { from: number; to: number },
  b: { from: number; to: number },
) => a.from <= b.to && b.from <= a.to;

const loansFor = (requestId: string) =>
  db
    .selectFrom("app.loans")
    .select(["id", "status", "responsible_lender_id"])
    .where("request_id", "=", requestId)
    .execute();

const loanStatus = async (loanId: string) =>
  (
    await db
      .selectFrom("app.loans")
      .select("status")
      .where("id", "=", loanId)
      .executeTakeFirstOrThrow()
  ).status;

const typesOf = async (resourceType: string, resourceId: string) =>
  (await eventsFor(resourceType, resourceId)).map((event) => event.event_type);

const eventOf = (loanId: string, type: string) =>
  db
    .selectFrom("app.audit_events")
    .select(["position", "payload"])
    .where("resource_type", "=", "loan")
    .where("resource_id", "=", loanId)
    .where("event_type", "=", type)
    .executeTakeFirstOrThrow();

const countOf = (types: readonly string[], type: string) =>
  types.filter((each) => each === type).length;

const reservedPeriod = async (loanId: string) =>
  (
    await db
      .selectFrom("app.loan_reservations")
      .select(sql<string>`period::text`.as("period"))
      .where("loan_id", "=", loanId)
      .executeTakeFirst()
  )?.period ?? null;

const range = (from: number, to: number) => `[${day(from)},${day(to + 1)})`;

/** No two reservations of the object share a day. */
async function expectNoDoubleBooking(objectId: string) {
  const { rows } = await sql<{ pairs: number }>`
    select count(*)::int as pairs
    from app.loan_reservations a
    join app.loan_reservations b
      on a.object_id = b.object_id and a.loan_id < b.loan_id
     and a.period && b.period
    where a.object_id = ${objectId}
  `.execute(db);
  expect(rows[0]!.pairs).toBe(0);
}

const amendmentsOf = (loanId: string) =>
  db
    .selectFrom("app.loan_amendments")
    .select(["id", "status"])
    .where("loan_id", "=", loanId)
    .execute();

const statementsOf = (loanId: string) =>
  db
    .selectFrom("app.loan_return_reports")
    .select(["reporter_role", "outcome"])
    .where("loan_id", "=", loanId)
    .orderBy("position")
    .execute();

/** An object with an owner and two co-owners, published where all are members. */
async function coOwned() {
  const setup = await published();
  const approvers = [setup.owner];

  for (let i = 0; i < 2; i += 1) {
    const coOwner = await member(setup.environmentId, setup.admin);
    await addCoOwner(setup.owner, setup.objectId, coOwner);
    approvers.push(coOwner);
  }

  return { ...setup, approvers };
}

/** Another member's open request for days `from`–`to`. */
async function requestFrom(
  setup: Awaited<ReturnType<typeof published>>,
  from: number,
  to: number,
) {
  const borrower = await member(setup.environmentId, setup.admin);
  const { requestId } = await ask(
    borrower,
    setup.objectId,
    environmentOrigin(setup.environmentId),
    dated(from, to),
  );

  return { borrower, requestId, from, to };
}

/** A loan for days `from`–`to`, approved by the owner. */
async function reservedLoan(from: number, to: number) {
  const setup = await published();
  const { requestId } = await ask(
    setup.borrower,
    setup.objectId,
    environmentOrigin(setup.environmentId),
    dated(from, to),
  );
  const { loanId } = await run(approveLoanRequest, setup.owner, { requestId });

  return { ...setup, requestId, loanId };
}

const say = (
  actor: UserActor,
  loanId: string,
  outcome: ReturnOutcome,
  agreementVersion = 1,
  key?: string,
) =>
  press(
    reportReturn,
    actor,
    { loanId, agreementVersion, outcome, immediately: true },
    key,
  );

describe("parallel approvals (PS-NFR-004, Port B and D)", () => {
  it("never double-books, never refuses a free period, and makes one loan per approved request", async () => {
    for (let round = 0; round < 3; round += 1) {
      const setup = await coOwned();
      const random = seeded(round + 7);
      const requests = [];

      for (let i = 0; i < 8; i += 1) {
        const from = 1 + random(20);
        requests.push(await requestFrom(setup, from, from + random(4)));
      }

      // Every request is approved by two of the three owners at once.
      const calls = requests.flatMap((request, i) =>
        [i, i + 1].map((n) => ({
          request,
          approver: setup.approvers[n % setup.approvers.length]!,
        })),
      );
      const results = await burst(
        calls.map(
          ({ request, approver }) =>
            () =>
              press(approveLoanRequest, approver, {
                requestId: request.requestId,
              }),
        ),
      );

      expectRefusedOnlyWith(results, ["conflict"]);
      const approved: typeof requests = [];

      for (const request of requests) {
        const loans = await loansFor(request.requestId);
        const won = results.flatMap((result, i) =>
          calls[i]!.request === request && result.status === "fulfilled"
            ? [
                {
                  approver: calls[i]!.approver,
                  loanId: result.value.output.loanId,
                },
              ]
            : [],
        );

        // One loan, and one approver told so: the one responsible for it.
        expect(loans.length).toBeLessThanOrEqual(1);
        expect(won).toHaveLength(loans.length);

        if (loans[0]) {
          expect(won[0]).toEqual({
            approver: expect.objectContaining({
              userId: loans[0].responsible_lender_id,
            }),
            loanId: loans[0].id,
          });
          expect(await stored(request.requestId)).toMatchObject({
            status: "approved",
          });
          expect(await reservedPeriod(loans[0].id)).toBe(
            range(request.from, request.to),
          );
          expect(
            countOf(
              await typesOf("loan_request", request.requestId),
              "loan_request.approved",
            ),
          ).toBe(1);
          expect(
            countOf(await typesOf("loan", loans[0].id), "loan.reserved"),
          ).toBe(1);
          approved.push(request);
        }
      }

      // The approved periods never share a day, and a request was refused
      // only because a period it overlaps was approved: as if the approvals
      // had come one after another.
      for (const [i, a] of approved.entries()) {
        for (const b of approved.slice(i + 1)) {
          expect(overlaps(a, b)).toBe(false);
        }
      }

      for (const request of requests.filter((r) => !approved.includes(r))) {
        expect(approved.some((other) => overlaps(other, request))).toBe(true);
        expect(await stored(request.requestId)).toMatchObject({
          status: "ended",
        });
      }

      await expectNoDoubleBooking(setup.objectId);
    }
  });
});

describe("retries with the same key (PS-NFR-005, Port A and D)", () => {
  /** Sends the same request `times` at once, as a client retrying. */
  async function retried<I, R, C, O>(
    command: CommandDefinition<I, R, C, O>,
    actor: UserActor,
    input: object,
    times = 6,
  ) {
    const key = randomUUID();
    const results = await burst(
      Array.from(
        { length: times },
        () => () => press(command, actor, input, key),
      ),
    );

    const output = oneAnswer(results);
    // One of them did the work; the others replayed its stored result.
    expect(values(results).filter((result) => !result.replayed)).toHaveLength(
      1,
    );

    return { output, key };
  }

  it("does every step of a loan once, whatever arrives at the same time", async () => {
    const setup = await published();
    const origin = environmentOrigin(setup.environmentId);
    const terms = await kit.versionOf(setup.objectId);
    const asked = {
      objectId: setup.objectId,
      origin,
      start: { kind: "date", date: day(0) },
      end: { kind: "date", date: day(2) },
      message: "Kan jeg låne den?",
      termsVersion: terms,
    };

    const { output: request, key: askKey } = await retried(
      createLoanRequest,
      setup.borrower,
      asked,
    );
    const requests = await db
      .selectFrom("app.loan_requests")
      .select("id")
      .where("object_id", "=", setup.objectId)
      .execute();
    expect(requests).toEqual([{ id: request.requestId }]);

    const { output: approval } = await retried(
      approveLoanRequest,
      setup.owner,
      { requestId: request.requestId },
    );
    const { loanId } = approval;

    const { output: proposal } = await retried(
      proposeLoanAmendment,
      setup.borrower,
      { loanId, agreementVersion: 1, period: { start: day(0), end: day(4) } },
    );
    await retried(acceptLoanAmendment, setup.owner, {
      loanId,
      amendmentId: proposal.amendmentId,
    });
    await retried(reportHandover, setup.owner, {
      loanId,
      agreementVersion: 2,
      outcome: "handed_over",
    });
    const returned = await retried(reportReturn, setup.owner, {
      loanId,
      agreementVersion: 2,
      outcome: "received",
      immediately: true,
    });
    expect(returned.output.status).toBe("ended");
    const reopened = await retried(reportReturn, setup.owner, {
      loanId,
      agreementVersion: 2,
      outcome: "not_received",
      immediately: true,
    });
    expect(reopened.output.status).toBe("disputed");

    expect(await typesOf("loan_request", request.requestId)).toEqual([
      "loan_request.created",
      "loan_request.approved",
    ]);
    expect(await typesOf("loan", loanId)).toEqual([
      "loan.reserved",
      "loan.amendment_proposed",
      "loan.amendment_accepted",
      "loan.handover_reported",
      "loan.handed_over",
      "loan.return_reported",
      "loan.returned",
      "loan.return_reported",
      "loan.return_disputed",
    ]);
    expect(await amendmentsOf(loanId)).toEqual([
      { id: proposal.amendmentId, status: "accepted" },
    ]);
    expect(await statementsOf(loanId)).toHaveLength(2);

    // The same key for something else is refused, never replayed as it.
    await expect(
      press(
        createLoanRequest,
        setup.borrower,
        { ...asked, message: "Noe annet" },
        askKey,
      ),
    ).rejects.toMatchObject({ code: "idempotency_key_reused" });
  });
});

describe("double presses with new keys (UX-P05, PS-NFR-005)", () => {
  /** The same press `times` at once, each with its own key. */
  const pressed = <I, R, C, O>(
    command: CommandDefinition<I, R, C, O>,
    actor: UserActor,
    input: object,
    times = 4,
  ) =>
    burst(
      Array.from({ length: times }, () => () => press(command, actor, input)),
    );

  it("gives every press the same answer and does it once", async () => {
    const setup = await published();
    const { requestId } = await ask(
      setup.borrower,
      setup.objectId,
      environmentOrigin(setup.environmentId),
      dated(0, 2),
    );

    const { loanId } = oneAnswer(
      await pressed(approveLoanRequest, setup.owner, { requestId }),
    );
    const { amendmentId } = oneAnswer(
      await pressed(proposeLoanAmendment, setup.borrower, {
        loanId,
        agreementVersion: 1,
        period: { start: day(0), end: day(3) },
      }),
    );
    oneAnswer(
      await pressed(acceptLoanAmendment, setup.owner, { loanId, amendmentId }),
    );
    oneAnswer(
      await pressed(reportHandover, setup.owner, {
        loanId,
        agreementVersion: 2,
        outcome: "handed_over",
      }),
    );
    // A confirmation that waits for its undo buffer, pressed again and again.
    const waiting = oneAnswer(
      await pressed(reportReturn, setup.borrower, {
        loanId,
        agreementVersion: 2,
        outcome: "returned",
      }),
    );
    expect(waiting.pending).toMatchObject({ outcome: "returned" });
    oneAnswer(await pressed(undoReturn, setup.borrower, { loanId }));
    oneAnswer(
      await pressed(reportReturn, setup.owner, {
        loanId,
        agreementVersion: 2,
        outcome: "received",
        immediately: true,
      }),
    );

    expect(await typesOf("loan", loanId)).toEqual([
      "loan.reserved",
      "loan.amendment_proposed",
      "loan.amendment_accepted",
      "loan.handover_reported",
      "loan.handed_over",
      "loan.return_reported",
      "loan.returned",
    ]);
    expect(await statementsOf(loanId)).toEqual([
      { reporter_role: "lender", outcome: "received" },
    ]);
    const confirmations = await db
      .selectFrom("app.loan_return_confirmations")
      .select("status")
      .where("loan_id", "=", loanId)
      .execute();
    expect(confirmations).toEqual([{ status: "withdrawn" }]);
  });

  it("cancels once when both parties press cancel again and again", async () => {
    const { owner, borrower, loanId } = await reservedLoan(2, 4);

    const results = await burst(
      [owner, borrower, owner, borrower, owner, borrower].map(
        (actor) => () => press(cancelLoan, actor, { loanId }),
      ),
    );

    // Everyone hears the same: it is cancelled, by whoever was first.
    const answer = oneAnswer(results);
    expect(answer).toMatchObject({ status: "ended", endReason: "cancelled" });
    expect(countOf(await typesOf("loan", loanId), "loan.cancelled")).toBe(1);
    expect(await reservedPeriod(loanId)).toBeNull();
  });
});

describe("agreement changes from every side (PS-LOAN-010, scenario 26)", () => {
  it("lets one proposal wait, and settles it one way only", async () => {
    for (let round = 0; round < 3; round += 1) {
      const setup = await reservedLoan(2, 4);
      const { owner, borrower, loanId, objectId } = setup;
      const propose = (actor: UserActor, from: number, to: number) => () =>
        press(proposeLoanAmendment, actor, {
          loanId,
          agreementVersion: 1,
          period: { start: day(from), end: day(to) },
        });

      // Both parties propose different periods, each pressing twice.
      const proposals = await burst([
        propose(borrower, 2, 7),
        propose(owner, 1, 4),
        propose(borrower, 2, 7),
        propose(owner, 1, 4),
      ]);
      expectRefusedOnlyWith(proposals, ["conflict"]);
      const ids = new Set(
        values(proposals).map((result) => result.output.amendmentId),
      );
      expect(ids.size).toBe(1);
      const [amendmentId] = [...ids] as [string];
      const borrowerProposed = proposals[0]!.status === "fulfilled";
      const proposer = borrowerProposed ? borrower : owner;
      const answerer = borrowerProposed ? owner : borrower;
      const proposed = borrowerProposed
        ? { from: 2, to: 7 }
        : { from: 1, to: 4 };

      // Others ask for the days the change would add.
      const colliding = [
        await requestFrom(setup, 5, 6),
        await requestFrom(setup, 1, 1),
      ];

      const amendment = { loanId, amendmentId };
      const results = await burst<unknown>([
        () => press(acceptLoanAmendment, answerer, amendment),
        () => press(acceptLoanAmendment, answerer, amendment),
        () => press(declineLoanAmendment, answerer, amendment),
        () => press(withdrawLoanAmendment, proposer, amendment),
        () => press(cancelLoan, round === 0 ? proposer : answerer, { loanId }),
        ...colliding.map(
          ({ requestId }) =>
            () =>
              press(approveLoanRequest, owner, { requestId }),
        ),
      ]);

      expectRefusedOnlyWith(results, ["conflict"]);
      const { status } = (await amendmentsOf(loanId))[0]!;
      const types = await typesOf("loan", loanId);
      const answered = [
        "loan.amendment_accepted",
        "loan.amendment_declined",
        "loan.amendment_withdrawn",
      ].map((type) => countOf(types, type));

      // At most one answer, and the proposal says which.
      expect(answered.reduce((sum, n) => sum + n, 0)).toBeLessThanOrEqual(1);
      expect(countOf(types, "loan.amendment_accepted")).toBe(
        status === "accepted" ? 1 : 0,
      );
      expect(countOf(types, "loan.amendment_declined")).toBe(
        status === "declined" ? 1 : 0,
      );
      expect(countOf(types, "loan.amendment_withdrawn")).toBe(
        status === "withdrawn" ? 1 : 0,
      );

      const cancelled = countOf(types, "loan.cancelled");
      expect(cancelled).toBeLessThanOrEqual(1);
      expect(await loanStatus(loanId)).toBe(cancelled ? "ended" : "reserved");
      expect(await reservedPeriod(loanId)).toBe(
        cancelled
          ? null
          : status === "accepted"
            ? range(proposed.from, proposed.to)
            : range(2, 4),
      );
      // A cancelled loan takes its waiting proposal with it.
      if (cancelled && status !== "accepted") {
        expect(["lapsed", "declined", "withdrawn"]).toContain(status);
      }

      await expectNoDoubleBooking(objectId);
    }
  });
});

describe("a reopened return while others act on the object (PS-LOAN-017, scenario 58)", () => {
  it("reopens once, keeps the ending as history, and lets no new loan into the uncertain days", async () => {
    for (let round = 0; round < 3; round += 1) {
      const setup = await reservedLoan(0, 4);
      const { owner, borrower, loanId, objectId } = setup;
      await press(reportHandover, owner, {
        loanId,
        agreementVersion: 1,
        outcome: "handed_over",
      });
      await say(owner, loanId, "received");
      const colliding = [
        await requestFrom(setup, 2, 3),
        await requestFrom(setup, 3, 5),
        await requestFrom(setup, 6, 7),
      ];

      const results = await burst<unknown>([
        () => say(owner, loanId, "not_received"),
        () => say(owner, loanId, "not_received"),
        () => say(borrower, loanId, "still_has"),
        () => say(borrower, loanId, "still_has"),
        ...colliding.map(
          ({ requestId }) =>
            () =>
              press(approveLoanRequest, owner, { requestId }),
        ),
      ]);

      expectRefusedOnlyWith(results, ["conflict"]);
      expect(await loanStatus(loanId)).toBe("return_disputed");
      const types = await typesOf("loan", loanId);
      // The ending stays in the history, and the loan reopened once.
      expect(countOf(types, "loan.returned")).toBe(1);
      expect(countOf(types, "loan.return_disputed")).toBe(1);
      expect(types.indexOf("loan.returned")).toBeLessThan(
        types.indexOf("loan.return_disputed"),
      );
      const said = await statementsOf(loanId);
      expect(said[0]).toEqual({ reporter_role: "lender", outcome: "received" });

      // Loans approved before the reopening stay, and the dispute names
      // them; none was approved into the uncertain days after it.
      const disputed = await eventOf(loanId, "loan.return_disputed");
      const others = (disputed.payload as { otherLoanIds: string[] })
        .otherLoanIds;

      for (const request of colliding) {
        const [loan] = await loansFor(request.requestId);

        if (!loan) {
          continue;
        }

        const reserved = await eventOf(loan.id, "loan.reserved");
        expect(others.includes(loan.id)).toBe(
          reserved.position < disputed.position,
        );
        expect(
          reserved.position < disputed.position ||
            !overlaps(request, { from: 0, to: 4 }),
        ).toBe(true);
      }

      await expectNoDoubleBooking(objectId);
    }
  });
});
