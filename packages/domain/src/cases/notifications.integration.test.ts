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
import { platformRoleOpsProcess } from "../platform/policies";
import { connectTestDatabase } from "../testing/database";
import { deliverAll } from "../testing/outbox";
import { registerTestUser } from "../testing/identities";
import { loanTestKit } from "../testing/loans";
import {
  claimCase,
  closeCase,
  openCaseRound,
  openEnvironmentContact,
  reportUnavailability,
  requestLoanMediation,
  shareCaseStatements,
  transferCase,
  writeCaseEntry,
} from "./commands";

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
