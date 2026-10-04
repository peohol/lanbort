import { randomUUID } from "node:crypto";
import {
  type PrivateMessageCopy,
  privateMessageCopyLimit,
  privateMessagesPerCaseLimit,
} from "@lanbort/contracts";
import { sql } from "kysely";
import { afterAll, describe, expect, it } from "vitest";
import type { UserActor } from "../actor";
import { executeQuery } from "../commands/query";
import { reportHandover } from "../loans/handover";
import { escalateReport, reportInEnvironment } from "../moderation/commands";
import { connectTestDatabase } from "../testing/database";
import { loanTestKit } from "../testing/loans";
import {
  claimCase,
  openCaseRound,
  openEnvironmentContact,
  requestLoanMediation,
  shareCaseStatements,
  writeCaseEntry,
} from "./commands";
import { readCase } from "./queries";

/**
 * WP-46 (PS-COM-013, ADR-0010): a party submits a readable copy of private
 * messages they chose in their own history, decrypted on their device. The
 * copy is case data from then on and follows what the party wrote; nothing
 * else of the conversation reaches the case, and only a participant can
 * submit one.
 */
const db = connectTestDatabase();
afterAll(() => db.destroy());

const kit = loanTestKit(db);
const { run, tick, user, published, reservedLoan } = kit;

const notFound = { code: "not_found" };
const oneDay = 24 * 60 * 60 * 1000;
const invalidCopy = { code: "invalid_input", fields: ["privateMessages"] };

const read = (actor: UserActor, caseId: string) =>
  executeQuery(tick(), readCase, { actor, input: { caseId } });

const copiesIn = async (actor: UserActor, caseId: string) =>
  (await read(actor, caseId)).entries.flatMap((entry) => entry.privateMessages);

/** A message as the party's device has it, sent `minutesAgo` before now. */
function message(
  sender: UserActor,
  body: string,
  minutesAgo: number,
  conversationId = randomUUID(),
): PrivateMessageCopy {
  return {
    conversationId,
    messageId: randomUUID(),
    senderUserId: sender.userId,
    sentAt: new Date(kit.now().getTime() - minutesAgo * 60_000).toISOString(),
    body,
  };
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

describe("private messages as case documentation (PS-COM-013)", () => {
  it("follow the statement they were submitted with, in the order they were sent", async () => {
    const { loanId, owner, borrower, admin } = await disputedLoan();
    const conversation = randomUUID();
    const later = message(owner, "Jeg kommer ikke i dag.", 30, conversation);
    const earlier = message(borrower, "Er du hjemme kl. 18?", 90, conversation);

    const { caseId, entryId } = await run(requestLoanMediation, borrower, {
      loanId,
      body: "Utlåner avlyste selv overleveringen, se meldingene.",
      privateMessages: [later, earlier],
    });

    // The handler reads exactly what was submitted, marked as the party's.
    const asHandler = await read(admin, caseId);
    expect(asHandler.entries).toEqual([
      expect.objectContaining({
        id: entryId,
        capacity: "party",
        authorUserId: borrower.userId,
        privateMessages: [earlier, later],
      }),
    ]);

    // In a mediation the copy is part of the statement, so the other party
    // sees it only once the statements are shared (PS-COM-012).
    await run(requestLoanMediation, owner, {
      loanId,
      body: "Jeg sa fra i god tid.",
    });
    expect(await copiesIn(owner, caseId)).toEqual([]);
    await run(shareCaseStatements, admin, { caseId });
    expect(await copiesIn(owner, caseId)).toEqual([earlier, later]);

    // An entry without a copy has none.
    expect(
      (await read(owner, caseId)).entries.map(
        (entry) => entry.privateMessages.length,
      ),
    ).toEqual([2, 0]);
  });

  it("are submitted only by a participant, never by a handler or an outsider", async () => {
    const { loanId, owner, borrower, admin } = await disputedLoan();
    const { caseId } = await run(requestLoanMediation, borrower, {
      loanId,
      body: "Jeg fikk aldri tingen.",
    });
    await run(claimCase, admin, { caseId });

    await expect(
      run(writeCaseEntry, admin, {
        caseId,
        body: "Her er det de skrev.",
        audience: "parties",
        privateMessages: [message(owner, "Hei", 10)],
      }),
    ).rejects.toMatchObject(invalidCopy);
    await expect(
      run(writeCaseEntry, await user(), {
        caseId,
        body: "Se her.",
        privateMessages: [message(owner, "Hei", 10)],
      }),
    ).rejects.toMatchObject(notFound);

    // A round later, the party submits more with what they write then.
    await run(openCaseRound, admin, { caseId, userId: borrower.userId });
    await run(writeCaseEntry, borrower, {
      caseId,
      body: "Dette skrev hun etterpå.",
      privateMessages: [message(owner, "Den er levert.", 5)],
    });
    expect(await copiesIn(admin, caseId)).toEqual([
      expect.objectContaining({ body: "Den er levert." }),
    ]);
  });

  it("are refused as a whole when a message cannot be what it claims", async () => {
    const { loanId, owner, borrower } = await disputedLoan();
    const attempt = (privateMessages: PrivateMessageCopy[]) =>
      run(requestLoanMediation, borrower, {
        loanId,
        body: "Se meldingene.",
        privateMessages,
      });

    // Sent in the future, by nobody, or the same message twice.
    await expect(attempt([message(owner, "Snart", -60)])).rejects.toMatchObject(
      invalidCopy,
    );
    await expect(
      attempt([{ ...message(owner, "Hei", 10), senderUserId: randomUUID() }]),
    ).rejects.toMatchObject(invalidCopy);
    const twice = message(owner, "Hei", 10);
    await expect(attempt([twice, twice])).rejects.toMatchObject({
      code: "invalid_input",
    });
    await expect(attempt([])).rejects.toMatchObject({ code: "invalid_input" });

    // Nothing was written, so the party still has their first statement.
    const { caseId } = await attempt([message(owner, "Hei", 10)]);
    expect(await copiesIn(borrower, caseId)).toHaveLength(1);
  });

  it("are bounded per participant and case", async () => {
    const { environmentId, owner, borrower } = await published();
    const batch = () =>
      Array.from({ length: privateMessageCopyLimit }, (_, index) =>
        message(owner, `Melding ${index}`, 60),
      );
    const { caseId } = await run(openEnvironmentContact, borrower, {
      environmentId,
      body: "Se meldingene.",
      privateMessages: batch(),
    });
    const rounds = privateMessagesPerCaseLimit / privateMessageCopyLimit - 1;

    for (let round = 0; round < rounds; round += 1) {
      await run(writeCaseEntry, borrower, {
        caseId,
        body: "Flere meldinger.",
        privateMessages: batch(),
      });
    }

    await expect(
      run(writeCaseEntry, borrower, {
        caseId,
        body: "Og en til.",
        privateMessages: [message(owner, "Hei", 10)],
      }),
    ).rejects.toMatchObject(invalidCopy);
    // Writing without a copy goes on as before.
    await run(writeCaseEntry, borrower, { caseId, body: "Takk." });
  });

  it("go with a report, and stay behind when an administrator escalates it", async () => {
    const { environmentId, admin, owner, borrower } = await published();
    const threat = message(owner, "Du skal få angre på dette.", 60);

    const { caseId } = await run(reportInEnvironment, borrower, {
      environmentId,
      target: { kind: "user", userId: owner.userId },
      body: "Han truer meg i chatten.",
      privateMessages: [threat],
    });
    expect(await copiesIn(admin, caseId)).toEqual([threat]);
    // The user reported never sees the report, nor the copy.
    await expect(read(owner, caseId)).rejects.toMatchObject(notFound);

    // An escalation is the administrator's own report; they cannot attach
    // the party's messages to it.
    await run(claimCase, admin, { caseId });
    await expect(
      run(escalateReport, admin, {
        caseId,
        body: "Alvorlig trussel.",
        privateMessages: [threat],
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("cannot be changed, removed or added to an entry afterwards in the database", async () => {
    const { loanId, owner, borrower, admin } = await disputedLoan();
    const { caseId, entryId } = await run(requestLoanMediation, borrower, {
      loanId,
      body: "Se meldingen.",
      privateMessages: [message(owner, "Hei", 10)],
    });

    await expect(
      sql`update app.case_entry_private_messages set body = 'Endret'
        where entry_id = ${entryId}`.execute(db),
    ).rejects.toThrow();
    await expect(
      sql`delete from app.case_entry_private_messages
        where entry_id = ${entryId}`.execute(db),
    ).rejects.toThrow();

    const add = (entry: string, sentAt: Date) =>
      sql`insert into app.case_entry_private_messages
        (entry_id, ordinal, conversation_id, message_id, sender_user_id, sent_at, body)
        values (${entry}, 9, ${randomUUID()}, ${randomUUID()}, ${owner.userId}, ${sentAt}, 'Lagt til')`.execute(
        db,
      );
    const entryTime = (await read(admin, caseId)).entries[0]?.createdAt ?? "";

    // Not sent after the entry, and not once the case has gone on.
    await expect(
      add(entryId, new Date(Date.parse(entryTime) + 60_000)),
    ).rejects.toThrow(/cannot get this copy/);
    await run(claimCase, admin, { caseId });
    await expect(
      add(entryId, new Date(Date.parse(entryTime) - 60_000)),
    ).rejects.toThrow(/cannot get this copy/);

    // A handler's entry never carries one.
    const { entryId: note } = await run(writeCaseEntry, admin, {
      caseId,
      body: "Internt notat.",
      audience: "handlers",
    });
    await expect(add(note, new Date(Date.parse(entryTime)))).rejects.toThrow(
      /cannot get this copy/,
    );
  });
});
