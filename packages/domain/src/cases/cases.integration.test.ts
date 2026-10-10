import { randomUUID } from "node:crypto";
import { responsibilityDeclarationVersion } from "@lanbort/contracts";
import { sql } from "kysely";
import { afterAll, describe, expect, it } from "vitest";
import { systemActor, type UserActor } from "../actor";
import { resolveUserActor } from "../account/identity";
import { executeQuery } from "../commands/query";
import {
  acceptRoleInvitation,
  inviteAdministrator,
  removeAdministrator,
} from "../environment/role-commands";
import { approveLoanRequest } from "../loans/approval";
import { acceptResponsibility } from "../loans/commands";
import { reportHandover } from "../loans/handover";
import { reportReturn } from "../loans/return";
import { readLoan } from "../loans/queries";
import { grantPlatformRole, revokePlatformRole } from "../platform/commands";
import { platformRoleOpsProcess } from "../platform/policies";
import { blockUser } from "../social/commands";
import { platformQueueIds } from "../testing/cases";
import { connectTestDatabase } from "../testing/database";
import { registerTestUser } from "../testing/identities";
import { loanTestKit } from "../testing/loans";
import {
  claimCase,
  closeCase,
  openCaseRound,
  openEnvironmentContact,
  recuseFromCase,
  releaseCase,
  reportUnavailability,
  requestLoanMediation,
  shareCaseStatements,
  transferCase,
  writeCaseEntry,
} from "./commands";
import {
  listEnvironmentCaseQueue,
  listOwnCases,
  listPlatformCaseQueue,
  readCase,
  readUnavailabilityTarget,
} from "./queries";
import { listCases } from "./store";

/**
 * WP-45: administrative cases and their queue (PS-COM-010–015). A case
 * belongs to its function: administrators find it in their queue, one may
 * take it, and it goes back to the queue when they can no longer handle it.
 * Nobody involved handles it, the parties of a mediation write their first
 * statements apart, what is written is never rewritten, and a report about
 * a user is for platform stewards only and changes nothing by itself.
 */
const db = connectTestDatabase();
afterAll(() => db.destroy());

const kit = loanTestKit(db);
const {
  run,
  tick,
  user,
  member,
  friends,
  showToFriends,
  published,
  ask,
  dated,
  reservedLoan,
  eventsFor,
} = kit;

const notFound = { code: "not_found" };
const forbidden = { code: "forbidden" };
const conflict = { code: "conflict" };
const conflictOfInterest = { code: "conflict_of_interest" };
const oneDay = 24 * 60 * 60 * 1000;

const read = (actor: UserActor, caseId: string) =>
  executeQuery(tick(), readCase, { actor, input: { caseId } });

const environmentQueue = (actor: UserActor, environmentId: string) =>
  executeQuery(tick(), listEnvironmentCaseQueue, {
    actor,
    input: { environmentId },
  });

const write = (actor: UserActor, caseId: string, body: string, extra = {}) =>
  run(writeCaseEntry, actor, { caseId, body, ...extra });

const bodies = async (actor: UserActor, caseId: string) =>
  (await read(actor, caseId)).entries.map((entry) => entry.body);

/** Makes `actor` an administrator of the environment. */
async function administrator(
  environmentId: string,
  owner: UserActor,
  actor: UserActor,
) {
  const { invitationId } = await run(inviteAdministrator, owner, {
    environmentId,
    userId: actor.userId,
  });
  await run(acceptRoleInvitation, actor, { environmentId, invitationId });

  return actor;
}

/** An environment with its owner, a second administrator and a member. */
async function environmentWithAdministrators() {
  const setup = await published();
  const second = await administrator(
    setup.environmentId,
    setup.admin,
    await member(setup.environmentId, setup.admin),
  );

  return { ...setup, second, requester: setup.borrower };
}

/** A loan through an environment whose handover the parties dispute. */
async function disputedLoan() {
  const loan = await reservedLoan(1, 3);
  kit.advance(2 * oneDay);
  await run(reportHandover, loan.owner, {
    loanId: loan.loanId,
    agreementVersion: 1,
    outcome: "handed_over",
  });
  await run(reportHandover, loan.borrower, {
    loanId: loan.loanId,
    agreementVersion: 1,
    outcome: "not_handed_over",
  });

  return loan;
}

const ops = systemActor(platformRoleOpsProcess);

/**
 * A platform steward. Their stronger authentication is simulated: which
 * mechanism provides it is open (OD-0010), so in the product no session has
 * it yet and every steward action stays rejected.
 */
async function steward() {
  const { identity } = await registerTestUser(kit.domain);
  await run(grantPlatformRole, ops, {
    email: identity.email,
    role: "platform_steward",
    reason: "Pilot steward",
  });
  const actor = (await resolveUserActor(kit.domain, identity)) as UserActor;

  return {
    identity,
    weak: actor,
    actor: {
      ...actor,
      authentication: { ...actor.authentication, assurance: "aal2" },
    } satisfies UserActor,
  };
}

const actionsOf = (caseId: string) =>
  db
    .selectFrom("app.case_actions")
    .select(["kind", "actor_user_id", "target_user_id", "reason"])
    .where("case_id", "=", caseId)
    .orderBy("position")
    .execute();

describe("contact with an environment's administrators (PS-COM-010–011)", () => {
  it("belongs to the function: queued for all administrators, taken by one, history for handlers only", async () => {
    const { environmentId, admin, second, requester } =
      await environmentWithAdministrators();

    const opened = await run(openEnvironmentContact, requester, {
      environmentId,
      body: "Hvem har nøkkelen til boden?",
    });
    expect(opened).toMatchObject({ created: true });

    // Writing again continues the same case: nobody starts over.
    const again = await run(openEnvironmentContact, requester, {
      environmentId,
      body: "Jeg trenger den på lørdag.",
    });
    expect(again).toMatchObject({ caseId: opened.caseId, created: false });

    for (const handler of [admin, second]) {
      expect((await environmentQueue(handler, environmentId)).items).toEqual([
        expect.objectContaining({
          id: opened.caseId,
          kind: "environment_contact",
          handling: "queued",
          assigneeUserId: null,
        }),
      ]);
    }

    await run(claimCase, second, { caseId: opened.caseId });
    await expect(
      run(claimCase, admin, { caseId: opened.caseId }),
    ).rejects.toMatchObject(conflict);
    await expect(
      write(admin, opened.caseId, "Jeg tar den.", { audience: "parties" }),
    ).rejects.toMatchObject(conflict);
    await write(second, opened.caseId, "Nøkkelen henger i gangen.", {
      audience: "parties",
    });
    await write(second, opened.caseId, "Intern merknad.", {
      audience: "handlers",
    });
    await write(requester, opened.caseId, "Takk!");

    const asParty = await read(requester, opened.caseId);
    expect(asParty).toMatchObject({
      viewer: "party",
      handling: "assigned",
      assigneeUserId: null,
      mayWrite: true,
      history: [],
    });
    expect(
      asParty.entries.map((entry) => [entry.body, entry.authorUserId]),
    ).toEqual([
      ["Hvem har nøkkelen til boden?", requester.userId],
      ["Jeg trenger den på lørdag.", requester.userId],
      // A handler's entry is the function's, not the person's.
      ["Nøkkelen henger i gangen.", null],
      ["Takk!", requester.userId],
    ]);

    const asHandler = await read(admin, opened.caseId);
    expect(asHandler).toMatchObject({
      viewer: "handler",
      assigneeUserId: second.userId,
      mayWrite: false,
    });
    expect(asHandler.entries).toHaveLength(5);
    expect(asHandler.history).toEqual([
      expect.objectContaining({
        kind: "assigned",
        actorUserId: second.userId,
        targetUserId: second.userId,
      }),
    ]);

    // The member's own list shows it; the administrators' queue is theirs.
    expect(
      (
        await executeQuery(tick(), listOwnCases, {
          actor: requester,
          input: {},
        })
      ).items.map((item) => item.id),
    ).toEqual([opened.caseId]);
    await expect(
      environmentQueue(requester, environmentId),
    ).rejects.toMatchObject(forbidden);
  });

  it("names the people its viewer already sees, and nobody else", async () => {
    const { environmentId, admin, second, requester } =
      await environmentWithAdministrators();
    const { caseId } = await run(openEnvironmentContact, requester, {
      environmentId,
      body: "Hvem har nøkkelen?",
    });
    await run(claimCase, second, { caseId });
    await write(second, caseId, "I gangen.", { audience: "parties" });
    const named = (people: readonly { userId: string }[]) =>
      people.map(({ userId }) => userId).sort();

    // The participant sees the function, not the handler's name.
    const asParty = await read(requester, caseId);
    expect(named(asParty.people)).toEqual([requester.userId]);
    expect(asParty.people[0]?.realName).toEqual(expect.any(String));
    expect(asParty.handlers).toEqual([]);

    // A handler sees who wrote and who has it, and whom to hand it to.
    const asHandler = await read(second, caseId);
    expect(named(asHandler.people)).toEqual(
      [requester.userId, second.userId, admin.userId].sort(),
    );
    expect(asHandler.handlers).toEqual([admin.userId]);
    expect(asHandler).toMatchObject({ loanTitle: null, objectTitle: null });
  });

  it("lets only one of two administrators take it at the same time", async () => {
    const { environmentId, admin, second, requester } =
      await environmentWithAdministrators();
    const { caseId } = await run(openEnvironmentContact, requester, {
      environmentId,
      body: "Kan noen hjelpe meg?",
    });

    const results = await Promise.allSettled([
      run(claimCase, admin, { caseId }),
      run(claimCase, second, { caseId }),
    ]);

    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.find((result) => result.status === "rejected"),
    ).toMatchObject({
      reason: conflict,
    });
    expect(
      (await actionsOf(caseId)).filter((action) => action.kind === "assigned"),
    ).toHaveLength(1);
  });

  it("opens one case when the member writes twice at the same time", async () => {
    const { environmentId, requester } = await environmentWithAdministrators();

    const results = await Promise.all([
      run(openEnvironmentContact, requester, { environmentId, body: "En" }),
      run(openEnvironmentContact, requester, { environmentId, body: "To" }),
    ]);

    expect(new Set(results.map((result) => result.caseId)).size).toBe(1);
    expect(results.map((result) => result.created).sort()).toEqual([
      false,
      true,
    ]);
  });

  it("goes back to the queue when its handler loses the role, and the former handler loses access", async () => {
    const { environmentId, admin, second, requester } =
      await environmentWithAdministrators();
    const { caseId } = await run(openEnvironmentContact, requester, {
      environmentId,
      body: "Hei",
    });
    await run(claimCase, second, { caseId });

    await run(removeAdministrator, admin, {
      environmentId,
      userId: second.userId,
    });

    expect(await actionsOf(caseId)).toEqual([
      expect.objectContaining({ kind: "assigned" }),
      {
        kind: "returned_to_queue",
        actor_user_id: null,
        target_user_id: second.userId,
        reason: "role_ended",
      },
    ]);
    expect(await read(requester, caseId)).toMatchObject({ handling: "queued" });
    await expect(read(second, caseId)).rejects.toMatchObject(notFound);
    // Another administrator takes it over without the history breaking.
    expect(await run(claimCase, admin, { caseId })).toEqual({
      caseId,
      status: "open",
      assigneeUserId: admin.userId,
    });
  });

  it("is handed on, given back, or stepped aside from", async () => {
    const { environmentId, admin, second, requester } =
      await environmentWithAdministrators();
    const { caseId } = await run(openEnvironmentContact, requester, {
      environmentId,
      body: "Hei",
    });

    await run(claimCase, admin, { caseId });
    await expect(
      run(transferCase, admin, { caseId, toUserId: requester.userId }),
    ).rejects.toMatchObject({ code: "invalid_input", fields: ["toUserId"] });
    await expect(
      run(transferCase, second, { caseId, toUserId: second.userId }),
    ).rejects.toMatchObject(conflict);
    expect(
      await run(transferCase, admin, { caseId, toUserId: second.userId }),
    ).toMatchObject({ assigneeUserId: second.userId });
    expect(await run(releaseCase, second, { caseId })).toMatchObject({
      assigneeUserId: null,
    });

    await run(claimCase, second, { caseId });
    expect(await run(recuseFromCase, second, { caseId })).toMatchObject({
      assigneeUserId: null,
    });
    // Once they stepped aside they are involved, and handle it no more.
    await expect(read(second, caseId)).rejects.toMatchObject(
      conflictOfInterest,
    );
    await expect(run(claimCase, second, { caseId })).rejects.toMatchObject(
      conflictOfInterest,
    );
    expect((await actionsOf(caseId)).map((action) => action.kind)).toEqual([
      "assigned",
      "assigned",
      "released",
      "assigned",
      "released",
      "recused",
    ]);
    await expect(run(openCaseRound, admin, { caseId })).rejects.toMatchObject(
      conflict,
    );
  });

  it("is never handled by an administrator involved in it, and says when nobody can", async () => {
    const { environmentId, admin, second } =
      await environmentWithAdministrators();
    const { caseId } = await run(openEnvironmentContact, second, {
      environmentId,
      body: "Jeg vil trekke meg som administrator.",
    });

    // The administrator who wrote it is its participant, not its handler.
    expect(await read(second, caseId)).toMatchObject({ viewer: "party" });
    await expect(run(claimCase, second, { caseId })).rejects.toMatchObject(
      conflictOfInterest,
    );
    expect((await environmentQueue(second, environmentId)).items).toEqual([]);
    expect((await environmentQueue(admin, environmentId)).items).toHaveLength(
      1,
    );

    // The owner alone administers this one, and contacts it themselves.
    const alone = await published();
    const own = await run(openEnvironmentContact, alone.admin, {
      environmentId: alone.environmentId,
      body: "Hei",
    });
    expect(await read(alone.admin, own.caseId)).toMatchObject({
      handling: "unavailable",
    });
  });

  it("is for active members only, and a hidden environment exists only for its members", async () => {
    const open = await published();
    const outsider = await user();
    await expect(
      run(openEnvironmentContact, outsider, {
        environmentId: open.environmentId,
        body: "Hei",
      }),
    ).rejects.toMatchObject(forbidden);

    const hidden = await published({ type: "hidden" });
    await expect(
      run(openEnvironmentContact, outsider, {
        environmentId: hidden.environmentId,
        body: "Hei",
      }),
    ).rejects.toMatchObject(notFound);
  });
});

describe("what is written in a case (PS-COM-013–014)", () => {
  it("is corrected by a new entry, never rewritten, also after the case is closed", async () => {
    const { environmentId, admin, requester } =
      await environmentWithAdministrators();
    const { caseId, entryId } = await run(openEnvironmentContact, requester, {
      environmentId,
      body: "Det skjedde tirsdag.",
    });
    const correction = await write(requester, caseId, "Det var onsdag.", {
      correctsEntryId: entryId,
    });
    const { entryId: answer } = await write(admin, caseId, "Notert.", {
      audience: "parties",
    });

    // Only one's own entry, to the same audience, is corrected.
    await expect(
      write(requester, caseId, "Nei", { correctsEntryId: answer }),
    ).rejects.toMatchObject({
      code: "invalid_input",
      fields: ["correctsEntryId"],
    });
    await expect(
      write(admin, caseId, "Feil", {
        audience: "handlers",
        correctsEntryId: answer,
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    // A participant names no audience.
    await expect(
      write(requester, caseId, "Hei", { audience: "handlers" }),
    ).rejects.toMatchObject({ code: "invalid_input" });

    await expect(
      run(closeCase, admin, { caseId, body: "Ferdig" }),
    ).rejects.toMatchObject({ code: "invalid_input", fields: ["body"] });
    await run(closeCase, admin, { caseId });
    await expect(write(requester, caseId, "Hallo?")).rejects.toMatchObject(
      conflict,
    );
    await expect(
      write(admin, caseId, "Ny melding", { audience: "parties" }),
    ).rejects.toMatchObject(conflict);
    await write(admin, caseId, "Notert, onsdag.", {
      audience: "parties",
      correctsEntryId: answer,
    });
    await expect(run(claimCase, admin, { caseId })).rejects.toMatchObject(
      conflict,
    );

    expect((await read(requester, caseId)).entries).toEqual([
      expect.objectContaining({
        body: "Det skjedde tirsdag.",
        correctsEntryId: null,
      }),
      expect.objectContaining({
        id: correction.entryId,
        body: "Det var onsdag.",
        correctsEntryId: entryId,
      }),
      expect.objectContaining({ body: "Notert.", correctsEntryId: null }),
      expect.objectContaining({
        body: "Notert, onsdag.",
        correctsEntryId: answer,
      }),
    ]);
    await expect(
      sql`update app.case_entries set body = 'Endret' where id = ${entryId}`.execute(
        db,
      ),
    ).rejects.toThrow();
    await expect(
      sql`delete from app.case_actions where case_id = ${caseId}`.execute(db),
    ).rejects.toThrow();

    // Events carry ids and codes, never what was written.
    const events = await eventsFor("case", caseId);
    expect(events.map((event) => event.event_type)).toEqual([
      "case.opened",
      "case.entry_added",
      "case.entry_added",
      "case.entry_added",
      "case.closed",
      "case.entry_added",
    ]);
    expect(JSON.stringify(events)).not.toContain("onsdag");
  });
});

describe("mediation of a loan through an environment (PS-COM-012, vision 05)", () => {
  it("keeps the parties' first statements apart until the administrator shares them", async () => {
    const { loanId, owner, borrower, admin } = await disputedLoan();

    const opened = await run(requestLoanMediation, borrower, {
      loanId,
      body: "Jeg fikk aldri tilhengeren.",
    });
    const { caseId } = opened;
    // One statement per round: the borrower now waits.
    await expect(
      write(borrower, caseId, "Og en ting til"),
    ).rejects.toMatchObject(conflict);
    expect(await bodies(owner, caseId)).toEqual([]);

    const second = await run(requestLoanMediation, owner, {
      loanId,
      body: "Jeg leverte den på fredag.",
    });
    expect(second).toMatchObject({ caseId, created: false });
    expect(await bodies(borrower, caseId)).toEqual([
      "Jeg fikk aldri tilhengeren.",
    ]);
    expect(await bodies(admin, caseId)).toHaveLength(2);

    await run(shareCaseStatements, admin, { caseId });
    expect(await bodies(borrower, caseId)).toEqual([
      "Jeg fikk aldri tilhengeren.",
      "Jeg leverte den på fredag.",
    ]);

    // A new round for the borrower only; what they write next waits for the
    // next sharing.
    await run(openCaseRound, admin, { caseId, userId: borrower.userId });
    await expect(write(owner, caseId, "Hei")).rejects.toMatchObject(conflict);
    await write(borrower, caseId, "Jeg var ikke hjemme på fredag.");
    expect(await bodies(owner, caseId)).toHaveLength(2);
    await write(admin, caseId, "Kan du sende et bilde?", {
      audience: "party",
      toUserId: owner.userId,
    });
    expect(await bodies(owner, caseId)).toContain("Kan du sende et bilde?");
    expect(await bodies(borrower, caseId)).not.toContain(
      "Kan du sende et bilde?",
    );

    // The mediator sees which loan it is about (PS-COM-011).
    const loan = await executeQuery(tick(), readLoan, {
      actor: owner,
      input: { loanId },
    });
    expect((await read(admin, caseId)).loanTitle).toBe(loan.agreement.title);

    // A mediation is closed with a closing message to both parties, its
    // last entry (PS-COM-020); a contact has none.
    await expect(run(closeCase, admin, { caseId })).rejects.toMatchObject({
      code: "invalid_input",
      fields: ["body"],
    });
    await run(closeCase, admin, {
      caseId,
      body: "Saken er avsluttet. Partene ble ikke enige.",
    });
    for (const party of [owner, borrower]) {
      expect((await read(party, caseId)).entries.at(-1)).toMatchObject({
        body: "Saken er avsluttet. Partene ble ikke enige.",
        closing: true,
        authorUserId: null,
      });
    }

    // Closing the mediation decides nothing about the loan.
    expect(
      (
        await executeQuery(tick(), readLoan, {
          actor: owner,
          input: { loanId },
        })
      ).status,
    ).toBe("disputed");
  });

  it("says in the queue what it is about, whose turn it is, and when the parties have clarified the loan (PS-COM-022)", async () => {
    const { loanId, owner, borrower, admin, environmentId } =
      await disputedLoan();
    const { caseId } = await run(requestLoanMediation, borrower, {
      loanId,
      body: "Jeg fikk aldri tilhengeren.",
    });
    const title = (
      await executeQuery(tick(), readLoan, { actor: owner, input: { loanId } })
    ).agreement.title;
    const inQueue = async () =>
      (await environmentQueue(admin, environmentId)).items.find(
        (each) => each.id === caseId,
      )!;
    const own = async (actor: UserActor) =>
      (
        await executeQuery(tick(), listOwnCases, { actor, input: {} })
      ).items.find((each) => each.id === caseId)!;

    expect(await inQueue()).toMatchObject({
      title,
      loanClarified: false,
      yourTurn: false,
    });
    expect((await inQueue()).participantUserIds.sort()).toEqual(
      [owner.userId, borrower.userId].sort(),
    );
    expect((await read(admin, caseId)).loan).toEqual({
      status: "disputed",
      clarified: false,
    });
    // The owner has not written their statement yet; the borrower waits.
    expect(await own(owner)).toMatchObject({ yourTurn: true, title });
    expect(await own(borrower)).toMatchObject({
      yourTurn: false,
      participantUserIds: [],
    });

    // The borrower agrees after all: the loan is clarified, and the case
    // stays open for the administrator to close.
    await run(reportHandover, borrower, {
      loanId,
      agreementVersion: 1,
      outcome: "handed_over",
    });
    expect(await inQueue()).toMatchObject({ loanClarified: true });
    expect((await read(admin, caseId)).loan).toEqual({
      status: "active",
      clarified: true,
    });
    expect((await read(owner, caseId)).status).toBe("open");
  });

  it("counts as clarified only what the parties themselves settled (PS-COM-022)", async () => {
    const clarified = async (caseId: string, admin: UserActor) =>
      (await read(admin, caseId)).loan?.clarified;

    // Both saying it was never handed over settles it.
    const both = await disputedLoan();
    const settled = await run(requestLoanMediation, both.borrower, {
      loanId: both.loanId,
      body: "Jeg fikk den aldri.",
    });
    expect(await clarified(settled.caseId, both.admin)).toBe(false);
    await run(reportHandover, both.owner, {
      loanId: both.loanId,
      agreementVersion: 1,
      outcome: "not_handed_over",
    });
    expect((await read(both.admin, settled.caseId)).loan).toEqual({
      status: "ended",
      clarified: true,
    });

    // A handover agreed on is clarified until the return day is over; a
    // late return is not, and the lender's confirmation of it is.
    const loan = await disputedLoan();
    const { caseId } = await run(requestLoanMediation, loan.borrower, {
      loanId: loan.loanId,
      body: "Uenige om overleveringen.",
    });
    await run(reportHandover, loan.borrower, {
      loanId: loan.loanId,
      agreementVersion: 1,
      outcome: "handed_over",
    });
    expect(await clarified(caseId, loan.admin)).toBe(true);
    kit.advance(2 * oneDay);
    expect((await read(loan.admin, caseId)).loan).toEqual({
      status: "awaiting_return",
      clarified: false,
    });
    const back = (
      actor: UserActor,
      outcome: "still_has" | "returned" | "received",
    ) =>
      run(reportReturn, actor, {
        loanId: loan.loanId,
        agreementVersion: 1,
        outcome,
        immediately: true,
      });
    await back(loan.borrower, "still_has");
    expect((await read(loan.admin, caseId)).loan).toEqual({
      status: "late",
      clarified: false,
    });
    await back(loan.borrower, "returned");
    await back(loan.owner, "received");
    expect((await read(loan.admin, caseId)).loan).toEqual({
      status: "ended",
      clarified: true,
    });
  });

  it("puts a clarified mediation after every other case in the queue, across pages (PS-COM-022)", async () => {
    const older = await disputedLoan();
    const first = await run(requestLoanMediation, older.borrower, {
      loanId: older.loanId,
      body: "Uenige.",
    });
    kit.advance(1000);
    const newer = await disputedLoan();
    const second = await run(requestLoanMediation, newer.borrower, {
      loanId: newer.loanId,
      body: "Uenige.",
    });
    await run(reportHandover, newer.borrower, {
      loanId: newer.loanId,
      agreementVersion: 1,
      outcome: "handed_over",
    });

    const ids = [first.caseId, second.caseId];
    const page = (cursor?: string) =>
      listCases(db, (query) => query.where("c.id", "in", ids), {
        cursor,
        pageSize: 1,
        now: kit.now(),
        clarifiedLast: true,
      });
    const one = await page();
    const two = await page(one.nextCursor!);
    expect(
      [...one.items, ...two.items].map((item) => [
        item.record.id,
        item.loanClarified,
      ]),
    ).toEqual([
      [first.caseId, false],
      [second.caseId, true],
    ]);
    expect(two.nextCursor).toBeNull();
  });

  it("is never handled by an administrator with a stake in the loan", async () => {
    const { loanId, owner, borrower, admin, objectId } = await disputedLoan();
    const { caseId } = await run(requestLoanMediation, borrower, {
      loanId,
      body: "Uenige om overleveringen.",
    });
    await run(claimCase, admin, { caseId });

    // Becoming an owner of the object makes them involved: the case goes
    // back to the queue at once.
    await kit.addCoOwner(owner, objectId, admin);
    expect((await actionsOf(caseId)).at(-1)).toMatchObject({
      kind: "returned_to_queue",
      reason: "involved",
    });
    await expect(read(admin, caseId)).rejects.toMatchObject(conflictOfInterest);
  });

  it("is for loans through an environment whose handover or return is in question", async () => {
    // A friend loan has no administrators.
    const owner = await user();
    const borrower = await user();
    await friends(borrower, owner);
    const objectId = await kit.create(owner);
    await showToFriends(owner, objectId);
    const { requestId } = await ask(
      borrower,
      objectId,
      { kind: "direct" },
      dated(1, 3),
    );
    await run(acceptResponsibility, owner, {
      requestId,
      declarationVersion: responsibilityDeclarationVersion,
    });
    const { loanId: directId } = await run(approveLoanRequest, owner, {
      requestId,
    });
    await expect(
      run(requestLoanMediation, borrower, { loanId: directId, body: "Hei" }),
    ).rejects.toMatchObject(conflict);

    // Nothing is in question before the handover day.
    const reserved = await reservedLoan(3, 5);
    await expect(
      run(requestLoanMediation, reserved.borrower, {
        loanId: reserved.loanId,
        body: "Hei",
      }),
    ).rejects.toMatchObject(conflict);
    // Only its parties ask.
    await expect(
      run(requestLoanMediation, reserved.admin, {
        loanId: reserved.loanId,
        body: "Hei",
      }),
    ).rejects.toMatchObject(notFound);
  });
});

describe("a report that a user may have died or be permanently unavailable (PS-COM-015)", () => {
  it("is a confidential case for platform stewards that changes nothing by itself", async () => {
    const reporter = await user();
    const subject = await user();
    await friends(reporter, subject);
    const { actor: handler, weak } = await steward();

    const { caseId } = await run(reportUnavailability, reporter, {
      userId: subject.userId,
      body: "Jeg har hørt at hun gikk bort i forrige uke.",
    });

    // The user it is about never learns of it.
    await expect(read(subject, caseId)).rejects.toMatchObject(notFound);
    expect(
      (await executeQuery(tick(), listOwnCases, { actor: subject, input: {} }))
        .items,
    ).toEqual([]);
    // A steward acts only with stronger authentication (closed by OD-0010).
    await expect(read(weak, caseId)).rejects.toMatchObject({
      code: "stronger_authentication_required",
    });
    await expect(
      executeQuery(tick(), listPlatformCaseQueue, { actor: weak, input: {} }),
    ).rejects.toMatchObject({ code: "stronger_authentication_required" });

    expect(await platformQueueIds(tick(), handler)).toContain(caseId);
    expect(await read(handler, caseId)).toMatchObject({
      viewer: "handler",
      subjectUserId: subject.userId,
    });

    // The reporter waits until asked for more.
    await expect(
      run(reportUnavailability, reporter, {
        userId: subject.userId,
        body: "Mer",
      }),
    ).rejects.toMatchObject(conflict);
    await run(claimCase, handler, { caseId });
    await write(handler, caseId, "Har du dokumentasjon?", {
      audience: "parties",
    });
    await run(openCaseRound, handler, { caseId });
    await write(reporter, caseId, "Jeg har en dødsannonse.");
    // Closed, like every report, with a message to the reporter (PS-COM-020).
    await expect(run(closeCase, handler, { caseId })).rejects.toMatchObject({
      code: "invalid_input",
      fields: ["body"],
    });
    await run(closeCase, handler, { caseId, body: "Saken er avsluttet." });

    const status = await db
      .selectFrom("app.users")
      .select("status")
      .where("id", "=", subject.userId)
      .executeTakeFirstOrThrow();
    expect(status.status).toBe("active");
  });

  it("goes back to the queue when the steward's role is revoked", async () => {
    const reporter = await user();
    const subject = await user();
    await friends(reporter, subject);
    const { actor: handler, identity } = await steward();
    const { caseId } = await run(reportUnavailability, reporter, {
      userId: subject.userId,
      body: "Han svarer ikke lenger.",
    });
    await run(claimCase, handler, { caseId });

    await run(revokePlatformRole, ops, {
      email: identity.email,
      role: "platform_steward",
      reason: "Stepped down",
    });

    expect((await actionsOf(caseId)).at(-1)).toMatchObject({
      kind: "returned_to_queue",
      target_user_id: handler.userId,
      reason: "role_ended",
    });
  });

  it("is made only from a concrete relation, never across a block, and never about oneself", async () => {
    const reporter = await user();
    const stranger = await user();
    await expect(
      run(reportUnavailability, reporter, {
        userId: stranger.userId,
        body: "Hei",
      }),
    ).rejects.toMatchObject(notFound);
    await expect(
      run(reportUnavailability, reporter, {
        userId: reporter.userId,
        body: "Hei",
      }),
    ).rejects.toMatchObject(notFound);
    await expect(
      run(reportUnavailability, reporter, {
        userId: randomUUID(),
        body: "Hei",
      }),
    ).rejects.toMatchObject(notFound);

    // Members of the same environment have a relation.
    const { environmentId, admin, borrower } = await published();
    const neighbour = await member(environmentId, admin);
    await run(reportUnavailability, neighbour, {
      userId: borrower.userId,
      body: "Hei",
    });

    await run(blockUser, borrower, { userId: neighbour.userId });
    const other = await member(environmentId, admin);
    await run(blockUser, other, { userId: borrower.userId });
    await expect(
      run(reportUnavailability, other, {
        userId: borrower.userId,
        body: "Hei",
      }),
    ).rejects.toMatchObject(forbidden);
    await expect(
      run(reportUnavailability, admin, { userId: other.userId, body: "Hei" }),
    ).resolves.toMatchObject({ created: true });
    await expect(
      run(reportUnavailability, borrower, {
        userId: other.userId,
        body: "Hei",
      }),
    ).rejects.toMatchObject(notFound);

    // A page asks the same rule before it offers the report.
    const target = (actor: UserActor, userId: string) =>
      executeQuery(tick(), readUnavailabilityTarget, {
        actor,
        input: { userId },
      });
    await expect(target(admin, other.userId)).resolves.toEqual({
      userId: other.userId,
    });
    await expect(target(other, borrower.userId)).rejects.toMatchObject(
      forbidden,
    );
    await expect(target(borrower, other.userId)).rejects.toMatchObject(
      notFound,
    );
    await expect(target(reporter, stranger.userId)).rejects.toMatchObject(
      notFound,
    );
    await expect(target(reporter, reporter.userId)).rejects.toMatchObject(
      notFound,
    );
  });
});
