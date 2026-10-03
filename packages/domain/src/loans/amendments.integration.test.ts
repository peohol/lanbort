import { randomUUID } from "node:crypto";
import { responsibilityDeclarationVersion } from "@lanbort/contracts";
import { sql } from "kysely";
import { afterAll, describe, expect, it } from "vitest";
import type { UserActor } from "../actor";
import { executeQuery } from "../commands/query";
import { leaveEnvironment } from "../environment/membership-commands";
import { calendarDate } from "../objects/availability";
import { setObjectRestriction } from "../objects/restrictions";
import { blockUser } from "../social/commands";
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
import { acceptResponsibility } from "./commands";
import { readLoan } from "./queries";
import { loadDerivedAvailability } from "./store";

/**
 * WP-32: agreement changes need the other party's consent (PS-LOAN-010) and
 * never push aside another approved loan (scenario 26), and the parts of
 * quality gate B they cover.
 */
const db = connectTestDatabase();
afterAll(() => db.destroy());

const kit = loanTestKit(db);
const {
  run,
  tick,
  user,
  member,
  create,
  addCoOwner,
  friends,
  environmentOrigin,
  ask,
  day,
  dated,
  reservedLoan,
  stored,
  eventsFor,
} = kit;

const notFound = { code: "not_found" };
const forbidden = { code: "forbidden" };
const conflict = { code: "conflict" };
const invalidInput = { code: "invalid_input" };
const oneDay = 24 * 60 * 60 * 1000;

/** Proposes days `from`–`to` (inclusive) on top of `version`. */
const propose = (
  actor: UserActor,
  loanId: string,
  from: number,
  to: number,
  version = 1,
  key?: string,
) =>
  run(
    proposeLoanAmendment,
    actor,
    {
      loanId,
      agreementVersion: version,
      period: { start: day(from), end: day(to) },
    },
    key,
  );

const answer =
  (
    command:
      | typeof acceptLoanAmendment
      | typeof declineLoanAmendment
      | typeof withdrawLoanAmendment,
  ) =>
  (actor: UserActor, loanId: string, amendmentId: string, key?: string) =>
    run(command, actor, { loanId, amendmentId }, key);

const accept = answer(acceptLoanAmendment);
const decline = answer(declineLoanAmendment);
const withdraw = answer(withdrawLoanAmendment);

const loanOf = (actor: UserActor, loanId: string) =>
  executeQuery(tick(), readLoan, { actor, input: { loanId } });

const agreements = (loanId: string) =>
  db
    .selectFrom("app.loan_agreements")
    .selectAll()
    .where("loan_id", "=", loanId)
    .orderBy("version")
    .execute();

const reservation = async (loanId: string) =>
  (
    await db
      .selectFrom("app.loan_reservations")
      .select(sql<string>`period::text`.as("period"))
      .where("loan_id", "=", loanId)
      .executeTakeFirst()
  )?.period ?? null;

const range = (from: number, to: number) => `[${day(from)},${day(to + 1)})`;

const amendmentStatus = async (amendmentId: string) =>
  (
    await db
      .selectFrom("app.loan_amendments")
      .select("status")
      .where("id", "=", amendmentId)
      .executeTakeFirstOrThrow()
  ).status;

/**
 * Scenario 26: Anne has the trailer on days 2–4, and Kari has it on days
 * 7–9. Both loans were approved by the same owner.
 */
async function twoLoans() {
  const anne = await reservedLoan(2, 4);
  const kari = await member(anne.environmentId, anne.admin);
  const { requestId } = await ask(
    kari,
    anne.objectId,
    environmentOrigin(anne.environmentId),
    dated(7, 9),
  );
  const karisLoan = await run(approveLoanRequest, anne.owner, { requestId });

  return { ...anne, kari, karisLoanId: karisLoan.loanId };
}

describe("proposing a change (PS-LOAN-010)", () => {
  it("changes nothing until the other party answers", async () => {
    const { owner, borrower, objectId, loanId } = await reservedLoan(2, 4);
    const before = await agreements(loanId);
    const availability = await loadDerivedAvailability(
      db,
      objectId,
      calendarDate(kit.now()),
    );

    const proposed = await propose(borrower, loanId, 2, 6);
    expect(proposed).toEqual({
      loanId,
      amendmentId: expect.any(String),
      status: "proposed",
      agreementVersion: 1,
    });

    expect(await agreements(loanId)).toEqual(before);
    expect(await reservation(loanId)).toBe(range(2, 4));
    expect(
      await loadDerivedAvailability(db, objectId, calendarDate(kit.now())),
    ).toEqual(availability);

    // Both see it, and which side proposed it, so the other side answers.
    for (const party of [borrower, owner]) {
      expect(await loanOf(party, loanId)).toMatchObject({
        status: "reserved",
        period: { start: day(2), end: day(4) },
        agreement: { version: 1 },
        amendment: {
          id: proposed.amendmentId,
          period: { start: day(2), end: day(6) },
          proposedBy: "borrower",
        },
      });
    }
    expect(await eventsFor("loan", loanId)).toEqual([
      expect.objectContaining({ event_type: "loan.reserved" }),
      {
        event_type: "loan.amendment_proposed",
        payload: {
          objectId,
          amendmentId: proposed.amendmentId,
          baseVersion: 1,
        },
      },
    ]);
  });

  it("refuses a change on an agreement the proposer has not seen, or that changes nothing", async () => {
    const { borrower, owner, loanId } = await reservedLoan(2, 4);

    await expect(propose(borrower, loanId, 2, 5, 2)).rejects.toMatchObject({
      ...conflict,
      fields: ["agreementVersion"],
    });
    await expect(propose(borrower, loanId, 2, 4)).rejects.toMatchObject({
      ...invalidInput,
      fields: ["period"],
    });
    await expect(propose(owner, loanId, -1, 4)).rejects.toMatchObject({
      ...invalidInput,
      fields: ["period.start"],
    });
    await expect(
      run(proposeLoanAmendment, owner, {
        loanId,
        agreementVersion: 1,
        period: { start: day(4), end: day(3) },
      }),
    ).rejects.toMatchObject({ ...invalidInput, fields: ["period.end"] });
  });

  it("lets one proposal wait at a time, and a retry return the same one", async () => {
    const { owner, borrower, loanId } = await reservedLoan(2, 4);
    const key = randomUUID();

    const first = await propose(borrower, loanId, 2, 6, 1, key);
    expect(await propose(borrower, loanId, 2, 6, 1, key)).toEqual(first);
    expect(await propose(borrower, loanId, 2, 6)).toEqual(first);

    await expect(propose(borrower, loanId, 2, 5)).rejects.toMatchObject({
      ...conflict,
      fields: ["amendment"],
    });
    await expect(propose(owner, loanId, 2, 6)).rejects.toMatchObject(conflict);

    // Once it is answered, a new one can be made.
    await decline(owner, loanId, first.amendmentId);
    expect(await propose(owner, loanId, 3, 4)).toMatchObject({
      status: "proposed",
    });
  });

  it("is only for the parties, not other co-owners or anyone else", async () => {
    const setup = await reservedLoan(2, 4);
    const coOwner = await member(setup.environmentId, setup.admin);
    await addCoOwner(setup.owner, setup.objectId, coOwner);

    for (const outsider of [coOwner, setup.admin, await user()]) {
      await expect(propose(outsider, setup.loanId, 2, 6)).rejects.toMatchObject(
        notFound,
      );
    }
  });
});

describe("answering a proposal (PS-LOAN-010)", () => {
  it("makes an accepted change the agreement's next version and moves the reservation", async () => {
    const { owner, borrower, objectId, loanId } = await reservedLoan(2, 4);
    const [v1] = await agreements(loanId);
    const { amendmentId } = await propose(owner, loanId, 3, 6);

    expect(await accept(borrower, loanId, amendmentId)).toEqual({
      loanId,
      amendmentId,
      status: "accepted",
      agreementVersion: 2,
    });

    const [kept, v2] = await agreements(loanId);
    // Version 1 is never rewritten; version 2 differs only in its period.
    expect(kept).toEqual(v1);
    expect(v2).toMatchObject({
      ...v1,
      version: 2,
      period: range(3, 6),
      recorded_at: expect.any(Date),
    });
    expect(await reservation(loanId)).toBe(range(3, 6));
    expect(
      (await loadDerivedAvailability(db, objectId, calendarDate(kit.now())))
        .effective,
    ).toEqual([
      { from: calendarDate(kit.now()), until: day(3) },
      { from: day(7), until: null },
    ]);
    expect(await loanOf(owner, loanId)).toMatchObject({
      period: { start: day(3), end: day(6) },
      agreement: { version: 2, loanTerms: "Må vaskes etter bruk." },
      amendment: null,
    });
    expect((await eventsFor("loan", loanId)).at(-1)).toEqual({
      event_type: "loan.amendment_accepted",
      payload: { objectId, amendmentId, agreementVersion: 2 },
    });
  });

  it("leaves the agreement as it was when declined or withdrawn", async () => {
    const { owner, borrower, loanId } = await reservedLoan(2, 4);
    const before = await agreements(loanId);

    const declined = await propose(borrower, loanId, 2, 6);
    expect(await decline(owner, loanId, declined.amendmentId)).toMatchObject({
      status: "declined",
      agreementVersion: 1,
    });
    const withdrawn = await propose(borrower, loanId, 2, 5);
    expect(
      await withdraw(borrower, loanId, withdrawn.amendmentId),
    ).toMatchObject({ status: "withdrawn", agreementVersion: 1 });

    expect(await agreements(loanId)).toEqual(before);
    expect(await reservation(loanId)).toBe(range(2, 4));
    // An answered proposal stays answered.
    await expect(
      accept(owner, loanId, declined.amendmentId),
    ).rejects.toMatchObject(conflict);
    await expect(
      accept(owner, loanId, withdrawn.amendmentId),
    ).rejects.toMatchObject(conflict);
    expect(await amendmentStatus(declined.amendmentId)).toBe("declined");
  });

  it("is never one-sided: only the other party answers, only the proposer withdraws", async () => {
    const setup = await reservedLoan(2, 4);
    const { owner, borrower, loanId } = setup;
    const coOwner = await member(setup.environmentId, setup.admin);
    await addCoOwner(owner, setup.objectId, coOwner);
    const { amendmentId } = await propose(owner, loanId, 2, 6);

    await expect(accept(owner, loanId, amendmentId)).rejects.toMatchObject(
      forbidden,
    );
    await expect(decline(owner, loanId, amendmentId)).rejects.toMatchObject(
      forbidden,
    );
    await expect(withdraw(borrower, loanId, amendmentId)).rejects.toMatchObject(
      forbidden,
    );
    for (const outsider of [coOwner, await user()]) {
      await expect(accept(outsider, loanId, amendmentId)).rejects.toMatchObject(
        notFound,
      );
    }
    // A proposal of another loan is not found on this one.
    const other = await reservedLoan(2, 4);
    await expect(
      accept(other.borrower, other.loanId, amendmentId),
    ).rejects.toMatchObject(notFound);

    expect(await amendmentStatus(amendmentId)).toBe("proposed");
    expect(await agreements(loanId)).toHaveLength(1);
  });

  it("is retry-safe: one new version, whatever the key", async () => {
    const { owner, borrower, loanId } = await reservedLoan(2, 4);
    const { amendmentId } = await propose(borrower, loanId, 2, 6);
    const key = randomUUID();

    const first = await accept(owner, loanId, amendmentId, key);
    expect(await accept(owner, loanId, amendmentId, key)).toEqual(first);
    expect(await accept(owner, loanId, amendmentId)).toEqual(first);
    expect(await agreements(loanId)).toHaveLength(2);
    expect(
      (await eventsFor("loan", loanId)).filter(
        (event) => event.event_type === "loan.amendment_accepted",
      ),
    ).toHaveLength(1);

    const declined = await propose(owner, loanId, 2, 5, 2);
    const answered = await decline(borrower, loanId, declined.amendmentId);
    expect(await decline(borrower, loanId, declined.amendmentId)).toEqual(
      answered,
    );
  });

  it("is refused once the handover day is over", async () => {
    const { owner, borrower, loanId } = await reservedLoan(1, 3);
    const { amendmentId } = await propose(borrower, loanId, 1, 5);

    kit.advance(2 * oneDay);
    await expect(accept(owner, loanId, amendmentId)).rejects.toMatchObject({
      ...conflict,
      fields: ["handover"],
    });
    await expect(propose(owner, loanId, 3, 5)).rejects.toMatchObject(conflict);
    expect(await reservation(loanId)).toBe(range(-1, 1));
  });
});

describe("a change never pushes aside another loan (scenario 26)", () => {
  it("refuses an extension into a period reserved for someone else, while that lasts", async () => {
    const { owner, borrower, kari, loanId, karisLoanId } = await twoLoans();

    // Anne cannot propose days that are Kari's.
    await expect(propose(borrower, loanId, 2, 8)).rejects.toMatchObject({
      ...conflict,
      fields: ["period"],
    });
    // Up to the day before Kari's loan, it works.
    const { amendmentId } = await propose(borrower, loanId, 2, 6);
    await accept(owner, loanId, amendmentId);
    expect(await reservation(loanId)).toBe(range(2, 6));

    // Kari freely moves her own loan first; then Anne's extension can
    // follow through the same consent.
    const moved = await propose(kari, karisLoanId, 9, 11);
    await accept(owner, karisLoanId, moved.amendmentId);
    const extended = await propose(borrower, loanId, 2, 8, 2);
    await accept(owner, loanId, extended.amendmentId);

    expect(await reservation(loanId)).toBe(range(2, 8));
    expect(await reservation(karisLoanId)).toBe(range(9, 11));
  });

  it("refuses an acceptance once another loan took the days, and keeps the proposal open", async () => {
    const { admin, environmentId, owner, borrower, objectId, loanId } =
      await reservedLoan(2, 4);
    const { amendmentId } = await propose(borrower, loanId, 2, 8);

    // The proposal holds nothing, so Kari's request can still be approved.
    const kari = await member(environmentId, admin);
    const { requestId } = await ask(
      kari,
      objectId,
      environmentOrigin(environmentId),
      dated(7, 9),
    );
    const karis = await run(approveLoanRequest, owner, { requestId });

    await expect(accept(owner, loanId, amendmentId)).rejects.toMatchObject({
      ...conflict,
      fields: ["period"],
    });
    expect(await amendmentStatus(amendmentId)).toBe("proposed");
    expect(await reservation(loanId)).toBe(range(2, 4));
    expect(await reservation(karis.loanId)).toBe(range(7, 9));

    // When Kari's loan is cancelled, the same proposal can be accepted.
    await run(cancelLoan, kari, { loanId: karis.loanId });
    await accept(owner, loanId, amendmentId);
    expect(await reservation(loanId)).toBe(range(2, 8));
  });

  it("respects a co-owner's restriction like new loans do", async () => {
    const setup = await reservedLoan(2, 4);
    const coOwner = await member(setup.environmentId, setup.admin);
    await addCoOwner(setup.owner, setup.objectId, coOwner);
    await run(setObjectRestriction, coOwner, {
      objectId: setup.objectId,
      period: { start: day(6), end: day(6) },
    });

    await expect(
      propose(setup.borrower, setup.loanId, 2, 6),
    ).rejects.toMatchObject({ ...conflict, fields: ["period"] });
    // Shortening needs no free days.
    const { amendmentId } = await propose(setup.borrower, setup.loanId, 2, 3);
    await accept(setup.owner, setup.loanId, amendmentId);
    expect(await reservation(setup.loanId)).toBe(range(2, 3));
  });

  it("ends the open requests the new period collides with, neutrally", async () => {
    const { admin, environmentId, owner, borrower, objectId, loanId } =
      await reservedLoan(2, 4);
    const origin = environmentOrigin(environmentId);
    const colliding = await ask(
      await member(environmentId, admin),
      objectId,
      origin,
      dated(5, 6),
    );
    const later = await ask(
      await member(environmentId, admin),
      objectId,
      origin,
      dated(9, 10),
    );
    const { amendmentId } = await propose(borrower, loanId, 2, 6);

    // Proposing alone ends nothing.
    expect(await stored(colliding.requestId)).toMatchObject({
      status: "requested",
    });
    await accept(owner, loanId, amendmentId);

    expect(await stored(colliding.requestId)).toMatchObject({
      status: "ended",
      end_reason: "period_unavailable",
    });
    expect(await stored(later.requestId)).toMatchObject({
      status: "requested",
    });
  });

  it("is refused by the database even without the domain's checks", async () => {
    const { borrower, loanId, karisLoanId } = await twoLoans();
    const { amendmentId } = await propose(borrower, loanId, 2, 6);

    // Accepting by moving the reservation into Kari's days.
    await expect(
      db.transaction().execute(async (tx) => {
        await tx
          .updateTable("app.loan_amendments")
          .set({
            status: "accepted",
            resolved_at: kit.now(),
            resolved_by_user_id: (
              await tx
                .selectFrom("app.loans")
                .select("responsible_lender_id")
                .where("id", "=", loanId)
                .executeTakeFirstOrThrow()
            ).responsible_lender_id,
          })
          .where("id", "=", amendmentId)
          .execute();
        await tx
          .updateTable("app.loan_reservations")
          .set({ period: sql`${range(2, 8)}::daterange` })
          .where("loan_id", "=", loanId)
          .execute();
      }),
    ).rejects.toMatchObject({ code: "23P01" });

    // A reservation that does not match the agreement fails at commit.
    await expect(
      db
        .updateTable("app.loan_reservations")
        .set({ period: sql`${range(2, 5)}::daterange` })
        .where("loan_id", "=", loanId)
        .execute(),
    ).rejects.toMatchObject({ code: "23001" });
    // An agreement version nobody agreed is refused.
    await expect(
      sql`
        insert into app.loan_agreements (loan_id, version, object_version,
          terms_version, title, category_id, description, loan_terms, period,
          lender_user_id)
        select loan_id, 2, object_version, terms_version, title, category_id,
          description, loan_terms, ${range(2, 5)}::daterange, lender_user_id
        from app.loan_agreements where loan_id = ${loanId}
      `.execute(db),
    ).rejects.toMatchObject({ code: "23001" });
    expect(await reservation(karisLoanId)).toBe(range(7, 9));
  });
});

describe("concurrent changes (PS-NFR-004, Port B)", () => {
  it("never gives two truths: accepting a change and cancelling at once", async () => {
    for (let round = 0; round < 5; round += 1) {
      const { owner, borrower, loanId } = await reservedLoan(2, 4);
      const { amendmentId } = await propose(borrower, loanId, 2, 6);

      await Promise.allSettled([
        accept(owner, loanId, amendmentId),
        run(cancelLoan, borrower, { loanId }),
      ]);

      // The cancellation always stands; the change made it first or lapsed.
      const loan = await loanOf(borrower, loanId);
      expect(loan.status).toBe("ended");
      expect(await reservation(loanId)).toBeNull();
      const status = await amendmentStatus(amendmentId);
      expect(["accepted", "lapsed"]).toContain(status);
      expect(loan.agreement.version).toBe(status === "accepted" ? 2 : 1);
    }
  });

  it("lets only one of two crossing proposals wait", async () => {
    for (let round = 0; round < 5; round += 1) {
      const { owner, borrower, loanId } = await reservedLoan(2, 4);

      const results = await Promise.allSettled([
        propose(borrower, loanId, 2, 6),
        propose(owner, loanId, 3, 4),
      ]);

      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      expect(results.find((result) => result.status === "rejected")).toEqual(
        expect.objectContaining({ reason: expect.objectContaining(conflict) }),
      );
    }
  });

  it("never double-books: an extension and a new approval of the same days at once", async () => {
    for (let round = 0; round < 5; round += 1) {
      const { admin, environmentId, owner, borrower, objectId, loanId } =
        await reservedLoan(2, 4);
      const { amendmentId } = await propose(borrower, loanId, 2, 8);
      const { requestId } = await ask(
        await member(environmentId, admin),
        objectId,
        environmentOrigin(environmentId),
        dated(7, 9),
      );

      const results = await Promise.allSettled([
        accept(owner, loanId, amendmentId),
        run(approveLoanRequest, owner, { requestId }),
      ]);

      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      const extended = (await reservation(loanId)) === range(2, 8);
      expect((await stored(requestId)).status).toBe(
        extended ? "ended" : "approved",
      );
      expect(await amendmentStatus(amendmentId)).toBe(
        extended ? "accepted" : "proposed",
      );
    }
  });

  it("accepts once when the same consent is sent twice at once", async () => {
    const { owner, borrower, loanId } = await reservedLoan(2, 4);
    const { amendmentId } = await propose(borrower, loanId, 2, 6);

    const results = await Promise.all([
      accept(owner, loanId, amendmentId),
      accept(owner, loanId, amendmentId),
    ]);

    expect(results[0]).toEqual(results[1]);
    expect(await agreements(loanId)).toHaveLength(2);
  });
});

describe("access that is gone after approval (PS-LOAN-002, scenario 28)", () => {
  it("keeps proposing and answering possible after leaving or blocking", async () => {
    const { environmentId, owner, borrower, loanId } = await reservedLoan(2, 4);
    const { amendmentId } = await propose(owner, loanId, 2, 5);
    await run(leaveEnvironment, borrower, { environmentId });
    await accept(borrower, loanId, amendmentId);
    expect(await reservation(loanId)).toBe(range(2, 5));

    const friendOwner = await user();
    const friend = await user();
    await friends(friend, friendOwner);
    const objectId = await create(friendOwner);
    const { requestId } = await ask(
      friend,
      objectId,
      { kind: "direct" },
      dated(2, 4),
    );
    await run(acceptResponsibility, friendOwner, {
      requestId,
      declarationVersion: responsibilityDeclarationVersion,
    });
    const direct = await run(approveLoanRequest, friendOwner, { requestId });
    const waiting = await propose(friend, direct.loanId, 2, 6);
    await run(blockUser, friendOwner, { userId: friend.userId });

    // Blocking is no way to stop the other party's answer, or to make one.
    await decline(friendOwner, direct.loanId, waiting.amendmentId);
    const again = await propose(friend, direct.loanId, 3, 4);
    await accept(friendOwner, direct.loanId, again.amendmentId);
    expect(await reservation(direct.loanId)).toBe(range(3, 4));
  });
});
