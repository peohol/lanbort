import type { Notification } from "@lanbort/contracts";
import { afterAll, describe, expect, it } from "vitest";
import { systemActor, type UserActor } from "../actor";
import { resolveUserActor } from "../account/identity";
import { executeQuery } from "../commands/query";
import {
  acceptRoleInvitation,
  inviteAdministrator,
  removeAdministrator,
} from "../environment/role-commands";
import { reportHandover } from "../loans/handover";
import { unresolvedEndingProcess } from "../loans/policies";
import { endLoanUnresolved } from "../loans/unresolved";
import { notifyCaseQueueReturns } from "../notifications/case-queue";
import { notificationGenerator } from "../notifications/generator";
import { notificationCaseQueueProcess } from "../notifications/policies";
import { listNotifications } from "../notifications/queries";
import { ConsumerRegistry } from "../outbox/consumer";
import { grantPlatformRole } from "../platform/commands";
import {
  reportInEnvironment,
  reportToPlatform,
  takeModerationMeasure,
} from "../moderation/commands";
import { readMeasureNotice } from "../moderation/notice";
import { platformRoleOpsProcess } from "../platform/policies";
import { connectTestDatabase } from "../testing/database";
import { deliverAll } from "../testing/outbox";
import { registerTestUser } from "../testing/identities";
import { loanTestKit } from "../testing/loans";
import {
  claimCase,
  closeCase,
  endContact,
  openCaseRound,
  openEnvironmentContact,
  reportUnavailability,
  requestLoanMediation,
  shareCaseStatements,
  transferCase,
  withdrawReport,
  writeCaseEntry,
} from "./commands";
import { readCase } from "./queries";

/**
 * WP-45 with WP-40: notifications from administrative cases. They lead to
 * the case and say only what happened (PS-COM-001), never what was written
 * or why a handler stopped. Each participant is told only what they can see
 * in the case, the handlers when a case waits for one of them, and the user
 * a report is about nothing at all (PS-COM-015).
 */
const db = connectTestDatabase();
afterAll(() => db.destroy());

const consumers = new ConsumerRegistry([
  notificationGenerator({ db: () => db }),
]);
const kit = loanTestKit(db, { consumers });
const {
  run,
  tick,
  user,
  member,
  friends,
  published,
  reservedLoan,
  addCoOwner,
} = kit;

const oneDay = 24 * 60 * 60 * 1000;

async function deliver() {
  await deliverAll(db, consumers);
}

/**
 * What the actor was told since the last call, in the order it happened.
 * Test files share the outbox, so another file's worker may write one of
 * these notifications after a later one: the list's own order is when each
 * was written, the event's time is when it happened.
 */
const seen = new Set<string>();
async function told(actor: UserActor) {
  await deliver();
  const { notifications } = await executeQuery(tick(), listNotifications, {
    actor,
    input: {},
  });
  const fresh = [...notifications]
    .reverse()
    .filter(({ id }) => !seen.has(id))
    .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
  for (const { id } of fresh) {
    seen.add(id);
  }

  return fresh.map(({ kind, detail, target }: Notification) => ({
    kind,
    detail,
    target,
  }));
}

const onCase = (id: string, ...kinds: string[]) =>
  kinds.map((kind) => ({ kind, detail: null, target: { type: "case", id } }));

const queueReturns = () =>
  run(notifyCaseQueueReturns, systemActor(notificationCaseQueueProcess), {});

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

async function environmentWithAdministrators() {
  const setup = await published();
  const second = await administrator(
    setup.environmentId,
    setup.admin,
    await member(setup.environmentId, setup.admin),
  );
  // What setting it up told them is not what these tests are about.
  for (const actor of [setup.admin, second, setup.borrower]) {
    await told(actor);
  }

  return { ...setup, second, requester: setup.borrower };
}

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
  for (const actor of [loan.admin, loan.owner, loan.borrower]) {
    await told(actor);
  }

  return loan;
}

describe("notifications from administrative cases", () => {
  it("tell the administrators a contact waits, and the member what the handler did", async () => {
    const { environmentId, admin, second, requester } =
      await environmentWithAdministrators();

    const { caseId } = await run(openEnvironmentContact, requester, {
      environmentId,
      body: "Hvem har nøkkelen til boden?",
    });
    expect(await told(admin)).toEqual(onCase(caseId, "case.waiting"));
    expect(await told(second)).toEqual(onCase(caseId, "case.waiting"));
    expect(await told(requester)).toEqual([]);

    // Taking it oneself is not told to oneself; being handed it is.
    await run(claimCase, admin, { caseId });
    await run(transferCase, admin, { caseId, toUserId: second.userId });
    expect(await told(second)).toEqual(onCase(caseId, "case.assigned_to_you"));
    expect(await told(requester)).toEqual(
      onCase(caseId, "case.assigned", "case.assigned"),
    );

    await run(writeCaseEntry, second, {
      caseId,
      body: "Den henger i gangen.",
      audience: "parties",
    });
    // An internal note reaches no participant.
    await run(writeCaseEntry, second, {
      caseId,
      body: "Notat",
      audience: "handlers",
    });
    expect(await told(requester)).toEqual(onCase(caseId, "case.entry_added"));
    await run(writeCaseEntry, requester, { caseId, body: "Takk!" });
    expect(await told(second)).toEqual(onCase(caseId, "case.entry_added"));
    expect(await told(admin)).toEqual([]);

    await run(closeCase, second, { caseId });
    expect(await told(requester)).toEqual(onCase(caseId, "case.closed"));
  });

  it("tell the handlers once when the database returns a case to the queue, without saying why", async () => {
    const { environmentId, admin, second, requester } =
      await environmentWithAdministrators();
    const { caseId } = await run(openEnvironmentContact, requester, {
      environmentId,
      body: "Hei",
    });
    await run(claimCase, second, { caseId });
    await told(admin);
    await told(second);
    await told(requester);

    await run(removeAdministrator, admin, {
      environmentId,
      userId: second.userId,
    });
    // Nothing acted on the case, so only the job tells anyone.
    expect(await told(admin)).toEqual([]);

    // Concurrent runs take each return once.
    await Promise.all([queueReturns(), queueReturns()]);
    expect(await queueReturns()).toEqual({ notified: 0 });
    expect(await told(admin)).toEqual(onCase(caseId, "case.waiting"));
    // The former handler can no longer handle it, and is not told.
    expect(await told(second)).toEqual([]);
    expect(await told(requester)).toEqual([]);
  });

  it("tell each party of a mediation only what they may see", async () => {
    const { loanId, owner, borrower, admin } = await disputedLoan();

    const { caseId } = await run(requestLoanMediation, borrower, {
      loanId,
      body: "Jeg fikk aldri tilhengeren.",
    });
    expect(await told(owner)).toEqual(onCase(caseId, "case.opened"));
    expect(await told(admin)).toEqual(onCase(caseId, "case.waiting"));

    // The other's first statement stays apart until it is shared.
    await run(requestLoanMediation, owner, {
      loanId,
      body: "Jeg leverte den på fredag.",
    });
    expect(await told(borrower)).toEqual([]);

    await run(claimCase, admin, { caseId });
    await run(shareCaseStatements, admin, { caseId });
    await run(openCaseRound, admin, { caseId, userId: borrower.userId });
    expect(await told(borrower)).toEqual(
      onCase(
        caseId,
        "case.assigned",
        "case.statements_shared",
        "case.your_turn",
      ),
    );
    expect(await told(owner)).toEqual(
      onCase(caseId, "case.assigned", "case.statements_shared"),
    );
  });

  it("never tell the user a report is about", async () => {
    const reporter = await user();
    const subject = await user();
    await friends(reporter, subject);
    const { identity } = await registerTestUser(kit.domain);
    await run(grantPlatformRole, systemActor(platformRoleOpsProcess), {
      email: identity.email,
      role: "platform_steward",
      reason: "Pilot steward",
    });
    const steward = (await resolveUserActor(kit.domain, identity)) as UserActor;
    for (const actor of [reporter, subject, steward]) {
      await told(actor);
    }

    const { caseId } = await run(reportUnavailability, reporter, {
      userId: subject.userId,
      body: "Jeg har hørt at hun gikk bort.",
    });
    expect(await told(steward)).toEqual(onCase(caseId, "case.waiting"));
    expect(await told(subject)).toEqual([]);
    expect(await told(reporter)).toEqual([]);
  });

  it("tell the parties and the owners when a loan ends unresolved", async () => {
    const { loanId, owner, borrower, admin, objectId, environmentId } =
      await disputedLoan();
    const coOwner = await member(environmentId, admin);
    await addCoOwner(owner, objectId, coOwner);
    await told(coOwner);

    await run(endLoanUnresolved, systemActor(unresolvedEndingProcess), {
      loanId,
    });
    const ended = [
      {
        kind: "loan.ended_unresolved",
        detail: null,
        target: { type: "loan", id: loanId },
      },
    ];
    for (const actor of [owner, borrower, coOwner]) {
      expect(await told(actor)).toEqual(ended);
    }
    expect(await told(admin)).toEqual([]);
  });
});

describe("ending a case by the one who opened it (PS-COM-021)", () => {
  const forbidden = { code: "forbidden" };
  const conflict = { code: "conflict" };
  const read = (actor: UserActor, caseId: string) =>
    executeQuery(tick(), readCase, { actor, input: { caseId } });

  it("closes a member's own contact, and tells whoever has it", async () => {
    const { environmentId, admin, second, requester } =
      await environmentWithAdministrators();
    const { caseId } = await run(openEnvironmentContact, requester, {
      environmentId,
      body: "Hvem har nøkkelen til boden?",
    });
    await run(claimCase, second, { caseId });
    for (const actor of [admin, second, requester]) {
      await told(actor);
    }

    await expect(run(endContact, second, { caseId })).rejects.toMatchObject(
      forbidden,
    );
    // The member is not told who has it.
    expect(await run(endContact, requester, { caseId })).toEqual({
      caseId,
      status: "closed",
      assigneeUserId: null,
    });
    expect(await told(second)).toEqual(onCase(caseId, "case.contact_ended"));
    expect(await told(admin)).toEqual([]);
    expect(await told(requester)).toEqual([]);

    const asHandler = await read(second, caseId);
    expect(asHandler.history.at(-1)).toMatchObject({
      kind: "closed",
      actorUserId: requester.userId,
    });
    expect(asHandler.entries).toHaveLength(1);
    await expect(
      run(writeCaseEntry, requester, { caseId, body: "En ting til" }),
    ).rejects.toMatchObject(conflict);
    await expect(run(endContact, requester, { caseId })).rejects.toMatchObject(
      conflict,
    );
  });

  it("records a withdrawn report, keeps what was sent and leaves the assessment open", async () => {
    const {
      environmentId,
      admin,
      second,
      requester: reporter,
      objectId,
    } = await environmentWithAdministrators();
    const { caseId } = await run(reportInEnvironment, reporter, {
      environmentId,
      target: { kind: "object", objectId },
      body: "Annonsen ser ut som svindel.",
    });
    for (const actor of [admin, second, reporter]) {
      await told(actor);
    }

    await expect(run(withdrawReport, admin, { caseId })).rejects.toMatchObject(
      forbidden,
    );
    expect(await run(withdrawReport, reporter, { caseId })).toEqual({
      caseId,
      status: "open",
      assigneeUserId: null,
    });
    // Nobody has taken it, so those who may take it are told.
    expect(await told(admin)).toEqual(onCase(caseId, "case.report_withdrawn"));
    expect(await told(second)).toEqual(onCase(caseId, "case.report_withdrawn"));
    await expect(
      run(withdrawReport, reporter, { caseId }),
    ).rejects.toMatchObject(conflict);

    const asReporter = await read(reporter, caseId);
    expect(asReporter).toMatchObject({
      status: "open",
      withdrawnAt: expect.any(String),
    });
    expect(asReporter.entries.map(({ body }) => body)).toEqual([
      "Annonsen ser ut som svindel.",
    ]);

    // A handler still finishes the assessment and closes it.
    await run(claimCase, admin, { caseId });
    await run(closeCase, admin, {
      caseId,
      body: "Vi har vurdert rapporten, og saken er avsluttet.",
    });
    expect(await told(reporter)).toEqual(
      onCase(caseId, "case.assigned", "case.closed"),
    );
  });

  it("never lets a party close a mediation", async () => {
    const { loanId, owner, borrower, admin } = await disputedLoan();
    const { caseId } = await run(requestLoanMediation, borrower, {
      loanId,
      body: "Jeg fikk aldri tilhengeren.",
    });

    for (const party of [borrower, owner]) {
      await expect(
        run(closeCase, party, { caseId, body: "Vi er enige." }),
      ).rejects.toMatchObject(forbidden);
      await expect(run(endContact, party, { caseId })).rejects.toMatchObject(
        conflict,
      );
      await expect(
        run(withdrawReport, party, { caseId }),
      ).rejects.toMatchObject(conflict);
    }
    expect((await read(admin, caseId)).status).toBe("open");
  });
});

describe("the notice to whoever a measure hits (PS-TRUST-018)", () => {
  it("tells the owner what was done, where and why, and nothing of the report", async () => {
    const { environmentId, admin, owner, objectId, requester } =
      await environmentWithAdministrators();
    const { caseId } = await run(reportInEnvironment, requester, {
      environmentId,
      target: { kind: "object", objectId },
      body: "Flasken er fylt med propan.",
    });
    await run(claimCase, admin, { caseId });
    await told(owner);
    await told(requester);

    const { measureId } = await run(takeModerationMeasure, admin, {
      caseId,
      measure: "publication_blocked",
      reason: "Fylt gassflaske står på listen over det som ikke lånes ut.",
    });

    expect(await told(owner)).toEqual([
      {
        kind: "moderation.measure_taken",
        detail: "publication_blocked",
        target: { type: "moderation_measure", id: measureId },
      },
    ]);
    // The reporter is not told which measure was taken (PS-COM-020).
    expect(await told(requester)).toEqual([]);

    const notice = (actor: UserActor) =>
      executeQuery(tick(), readMeasureNotice, {
        actor,
        input: { measureId },
      });
    expect(await notice(owner)).toEqual({
      id: measureId,
      kind: "publication_blocked",
      scope: "environment",
      environmentId,
      environmentName: null,
      objectId,
      objectTitle: expect.any(String),
      loanId: null,
      dimension: null,
      reason: "Fylt gassflaske står på listen over det som ikke lånes ut.",
      decidedAt: expect.any(String),
    });
    // Nobody else learns that it exists.
    for (const other of [requester, admin]) {
      await expect(notice(other)).rejects.toMatchObject({ code: "not_found" });
    }
  });

  it("tells the owners, as information, that a block on their thing is lifted", async () => {
    const { owner, objectId, environmentId, admin } = await reservedLoan(1, 2);
    const handler = await kit.steward();
    const reporter = await member(environmentId, admin);
    const { caseId } = await run(reportToPlatform, reporter, {
      target: { kind: "object", objectId },
      body: "Dette er et ulovlig våpen.",
    });
    await run(claimCase, handler, { caseId });
    await run(takeModerationMeasure, handler, {
      caseId,
      measure: "object_blocked",
      reason: "Ulovlig gjenstand.",
    });
    await told(owner);
    await told(reporter);

    const { measureId } = await run(takeModerationMeasure, handler, {
      caseId,
      measure: "object_unblocked",
      reason: "Avklart: lovlig.",
    });

    expect(await told(owner)).toEqual([
      {
        kind: "moderation.block_lifted",
        detail: "object_unblocked",
        target: { type: "moderation_measure", id: measureId },
      },
    ]);
    expect(await told(reporter)).toEqual([]);
    const notice = (actor: UserActor) =>
      executeQuery(tick(), readMeasureNotice, {
        actor,
        input: { measureId },
      });
    expect(await notice(owner)).toMatchObject({
      kind: "object_unblocked",
      scope: "platform",
      objectId,
      reason: "Avklart: lovlig.",
    });
    await expect(notice(reporter)).rejects.toMatchObject({
      code: "not_found",
    });
  });
});
