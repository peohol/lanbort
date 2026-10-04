import { chatLimits, type ReturnOutcome } from "@lanbort/contracts";
import { sql } from "kysely";
import { afterAll, describe, expect, it } from "vitest";
import { systemActor, type UserActor } from "../actor";
import {
  listChatConversations,
  readChatConversation,
  sendChatMessage,
  startChatConversation,
  submitChatCommit,
} from "../chat/conversations";
import { registerChatAccount } from "../chat/devices";
import { startLoanLogisticsChat } from "../chat/loan-logistics";
import { groupIdOf } from "../chat/model";
import { executeQuery } from "../commands/query";
import { blockUser, liftUserBlock } from "../social/commands";
import { connectTestDatabase } from "../testing/database";
import {
  encodePrivateMessage,
  encodeWelcome,
  testChatAccount,
  testChatDevice,
} from "../testing/chat";
import { commitWhileRacing } from "../testing/races";
import { loanTestKit } from "../testing/loans";
import { approveLoanRequest } from "./approval";
import { cancelLoan } from "./cancellation";
import { reportHandover } from "./handover";
import {
  closeLoanLogisticsForSafety,
  loanLogisticsGate,
  readLoanLogistics,
} from "./logistics";
import { logisticsSafetyProcess } from "./policies";
import {
  acceptResponsibilityTransfer,
  offerResponsibility,
} from "./responsibility";
import { reportReturn } from "./return";

/**
 * WP-44 (PS-COM-007): a block between the parties of a loan in progress
 * opens a narrow logistics channel for them, which closes when the loan
 * ends, when its parties change, or early as a safety measure (OD-0020).
 * The messages themselves are the private chat's (WP-43); these tests show
 * when the channel accepts them and for whom.
 */
const db = connectTestDatabase();
afterAll(() => db.destroy());

// Like the other loan files that wait on return confirmations, this file's
// clock starts far ahead of the files that run the scheduled return job.
const kit = loanTestKit(db, { startInDays: 400 });
const {
  run,
  tick,
  user,
  addCoOwner,
  environmentOrigin,
  ask,
  dated,
  published,
  eventsFor,
} = kit;

const notFound = { code: "not_found" };
const forbidden = { code: "forbidden" };
const conflict = { code: "conflict" };
const safety = systemActor(logisticsSafetyProcess);

const block = (actor: UserActor, other: UserActor) =>
  run(blockUser, actor, { userId: other.userId });

const unblock = (actor: UserActor, other: UserActor) =>
  run(liftUserBlock, actor, { userId: other.userId });

const logistics = async (actor: UserActor, loanId: string) =>
  (
    await executeQuery(tick(), readLoanLogistics, {
      actor,
      input: { loanId },
    })
  ).channels;

/** The id of the loan's newest channel that joined `actor`. */
const channelId = async (actor: UserActor, loanId: string) => {
  const [newest] = await logistics(actor, loanId);
  return newest!.id;
};

const closeForSafety = (channelId: string) =>
  run(closeLoanLogisticsForSafety, safety, { channelId });

const sayReturn = (actor: UserActor, loanId: string, outcome: ReturnOutcome) =>
  run(reportReturn, actor, {
    loanId,
    agreementVersion: 1,
    outcome,
    immediately: true,
  });

const channelsOf = (loanId: string) =>
  db
    .selectFrom("app.loan_logistics_channels")
    .select(["borrower_user_id", "lender_user_id", "close_reason"])
    .where("loan_id", "=", loanId)
    .orderBy("opened_at")
    .orderBy("id")
    .execute();

const open = { closedAt: null, closeReason: null, conversationId: null };

/**
 * An object owned by `owner` and `coOwner` and published in an environment;
 * the owner approves the borrower's loan for days `from`–`to`.
 */
async function reservedLoan(from = 2, to = 4) {
  const setup = await published();
  const coOwner = await user();
  await addCoOwner(setup.owner, setup.objectId, coOwner);
  const { requestId } = await ask(
    setup.borrower,
    setup.objectId,
    environmentOrigin(setup.environmentId),
    dated(from, to),
  );
  const { loanId } = await run(approveLoanRequest, setup.owner, { requestId });

  return { ...setup, coOwner, loanId };
}

/** The same, handed over today. */
async function activeLoan() {
  const loan = await reservedLoan(0, 2);
  await run(reportHandover, loan.owner, {
    loanId: loan.loanId,
    agreementVersion: 1,
    outcome: "handed_over",
  });

  return loan;
}

describe("opening (PS-COM-007)", () => {
  it("opens a channel for the parties when a block comes between them", async () => {
    const { owner, borrower, coOwner, admin, loanId } = await reservedLoan();
    expect(await logistics(borrower, loanId)).toEqual([]);

    await block(borrower, owner);
    const blockedAt = kit.now().toISOString();

    const [channel] = await logistics(owner, loanId);
    expect(channel).toEqual({
      id: expect.any(String),
      loanId,
      openedAt: blockedAt,
      ...open,
    });
    // Both parties see the same channel, whoever blocked whom.
    expect(await logistics(borrower, loanId)).toEqual([channel]);

    for (const party of [owner, borrower]) {
      expect(await loanLogisticsGate(db, channel!.id, party.userId)).toBe(
        "open",
      );
    }

    // Nobody else learns of it: not the co-owner, the administrator or a
    // stranger, and for them the channel is like one that does not exist.
    for (const outsider of [coOwner, admin, await user()]) {
      await expect(logistics(outsider, loanId)).rejects.toMatchObject(notFound);
      expect(await loanLogisticsGate(db, channel!.id, outsider.userId)).toBe(
        null,
      );
    }
    expect(
      await loanLogisticsGate(db, crypto.randomUUID(), owner.userId),
    ).toBeNull();
  });

  it("opens one for an active loan, and only one per loan", async () => {
    const { owner, borrower, loanId } = await activeLoan();

    await block(owner, borrower);
    await block(borrower, owner);

    expect(await channelsOf(loanId)).toEqual([
      {
        borrower_user_id: borrower.userId,
        lender_user_id: owner.userId,
        close_reason: null,
      },
    ]);
  });

  it("keeps it open when the block is lifted, and adds none when it comes back", async () => {
    const { owner, borrower, loanId } = await reservedLoan();
    await block(borrower, owner);
    const [channel] = await logistics(borrower, loanId);

    await unblock(borrower, owner);
    expect(await logistics(owner, loanId)).toEqual([channel]);

    await block(owner, borrower);
    expect(await logistics(owner, loanId)).toEqual([channel]);
  });

  it("opens none for a block with someone who is not a party", async () => {
    const { owner, borrower, coOwner, loanId } = await reservedLoan();

    // A co-owner is not a party of the loan; a block with them is a freeze
    // of the object (WP-26), not a channel.
    await block(borrower, coOwner);
    await block(owner, await user());

    expect(await channelsOf(loanId)).toEqual([]);
  });

  it("opens none for a loan that has ended", async () => {
    const { owner, borrower, loanId } = await reservedLoan();
    await run(cancelLoan, borrower, { loanId });

    await block(owner, borrower);

    expect(await logistics(borrower, loanId)).toEqual([]);
  });
});

describe("closing with the loan (PS-COM-007)", () => {
  it("closes for good when the loan is cancelled", async () => {
    const { owner, borrower, loanId } = await reservedLoan();
    await block(owner, borrower);
    const id = await channelId(owner, loanId);

    await run(cancelLoan, owner, { loanId });
    const cancelledAt = kit.now().toISOString();

    expect(await logistics(borrower, loanId)).toEqual([
      expect.objectContaining({
        id,
        closedAt: cancelledAt,
        closeReason: "loan_ended",
      }),
    ]);
    expect(await loanLogisticsGate(db, id, borrower.userId)).toBe("closed");
  });

  it("closes when the object is returned, and opens a new one if the return is reopened", async () => {
    const { owner, borrower, loanId } = await activeLoan();
    await block(borrower, owner);

    await sayReturn(owner, loanId, "received");
    expect(await channelsOf(loanId)).toEqual([
      expect.objectContaining({ close_reason: "loan_ended" }),
    ]);

    // The borrower says it was not returned after all: the loan needs
    // logistics again, and the parties are still blocked.
    await sayReturn(borrower, loanId, "still_has");
    const [reopened, ended] = await logistics(borrower, loanId);
    expect(reopened).toMatchObject(open);
    expect(ended).toMatchObject({ closeReason: "loan_ended" });
  });

  it("closes when the responsible lender changes, and the new lender never sees it", async () => {
    const { owner, borrower, coOwner, loanId } = await activeLoan();
    await block(owner, borrower);
    const [channel] = await logistics(owner, loanId);

    const { transferId } = await run(offerResponsibility, owner, {
      loanId,
      toUserId: coOwner.userId,
    });
    await run(acceptResponsibilityTransfer, coOwner, { loanId, transferId });

    const closed = { ...channel, closeReason: "parties_changed" };
    expect(await logistics(borrower, loanId)).toEqual([
      { ...closed, closedAt: expect.any(String) },
    ]);
    expect(await loanLogisticsGate(db, channel!.id, owner.userId)).toBe(
      "closed",
    );
    // The new lender is a party now, but the channel was between others.
    expect(await logistics(coOwner, loanId)).toEqual([]);
    expect(await loanLogisticsGate(db, channel!.id, coOwner.userId)).toBe(null);

    // A block between the borrower and the new lender opens their own.
    await block(coOwner, borrower);
    const [own] = await logistics(coOwner, loanId);
    expect(own).toMatchObject(open);
    expect(own!.id).not.toBe(channel!.id);
  });
});

describe("closing as a safety measure (PS-COM-007, OD-0020)", () => {
  it("is only for its process until OD-0020 is decided", async () => {
    const { owner, borrower, loanId } = await reservedLoan();
    await block(borrower, owner);
    const id = await channelId(owner, loanId);

    for (const actor of [owner, borrower, await kit.steward()]) {
      await expect(
        run(closeLoanLogisticsForSafety, actor, { channelId: id }),
      ).rejects.toMatchObject(forbidden);
    }
    expect(await loanLogisticsGate(db, id, owner.userId)).toBe("open");
  });

  it("closes the channel for good, also after a new block", async () => {
    const { owner, borrower, loanId } = await activeLoan();
    await block(borrower, owner);
    const [channel] = await logistics(owner, loanId);
    const id = channel!.id;

    const closed = await closeForSafety(id);
    expect(closed).toEqual({
      ...channel,
      closedAt: kit.now().toISOString(),
      closeReason: "safety",
    });
    expect(await logistics(borrower, loanId)).toEqual([closed]);
    expect(await loanLogisticsGate(db, id, borrower.userId)).toBe("closed");
    // Again: the same answer, and nothing more happens.
    expect(await closeForSafety(id)).toEqual(closed);
    expect(await eventsFor("loan_logistics_channel", id)).toEqual([
      {
        event_type: "loan_logistics.closed_for_safety",
        payload: { loanId },
      },
    ]);

    // Lifting and placing the block again opens nothing between them.
    await unblock(borrower, owner);
    await block(owner, borrower);
    expect(await logistics(owner, loanId)).toEqual([closed]);

    // The loan goes on with its structured actions.
    expect((await sayReturn(owner, loanId, "received")).status).toBe("ended");
  });

  it("cannot close a channel that has closed already", async () => {
    const { owner, borrower, loanId } = await reservedLoan();
    await block(borrower, owner);
    const id = await channelId(owner, loanId);
    await run(cancelLoan, borrower, { loanId });

    await expect(closeForSafety(id)).rejects.toMatchObject(conflict);
    await expect(closeForSafety(crypto.randomUUID())).rejects.toMatchObject(
      notFound,
    );
  });
});

describe("messages (ADR-0010, WP-43)", () => {
  const invalid = { code: "invalid_input" };
  /** One padding block, and the AEAD tag the server sees on top of it. */
  const oneBlock = chatLimits.paddedMessageBytes + 16;

  /** Registers a chat device for `actor`'s session; returns its id. */
  async function chatDevice(actor: UserActor) {
    const account = testChatAccount(actor.userId);
    const device = testChatDevice(account);
    await run(registerChatAccount, actor, {
      accountKey: account.accountKey,
      certificate: device.certificate,
    });

    return device.deviceId;
  }

  const startChat = (actor: UserActor, channelId: string) =>
    run(startLoanLogisticsChat, actor, { channelId });

  const conversationOf = (actor: UserActor, conversationId: string) =>
    executeQuery(tick(), readChatConversation, {
      actor,
      input: { conversationId },
    });

  /** `by` starts the group and adds `other`'s device. */
  const startGroup = (
    by: UserActor,
    conversationId: string,
    otherDeviceId: string,
  ) =>
    run(submitChatCommit, by, {
      conversationId,
      generation: 1,
      commit: encodePrivateMessage(
        groupIdOf(conversationId, 1),
        0,
        "commit",
      ),
      welcome: encodeWelcome(),
      addedDeviceIds: [otherDeviceId],
      removedDeviceIds: [],
    });

  const say = (by: UserActor, conversationId: string, ciphertextBytes = 64) =>
    run(sendChatMessage, by, {
      conversationId,
      generation: 1,
      ciphertext: encodePrivateMessage(
        groupIdOf(conversationId, 1),
        1,
        "application",
        ciphertextBytes,
      ),
    });

  /** A loan whose parties are blocked, each with a chat device. */
  async function blockedLoan(make: () => ReturnType<typeof reservedLoan>) {
    const loan = await make();
    await block(loan.borrower, loan.owner);

    return {
      ...loan,
      lenderDevice: await chatDevice(loan.owner),
      borrowerDevice: await chatDevice(loan.borrower),
      channelId: await channelId(loan.owner, loan.loanId),
    };
  }

  /** The blocked loan's conversation, with both devices in its group. */
  async function chattingLoan(make = () => reservedLoan()) {
    const loan = await blockedLoan(make);
    const { conversationId } = await startChat(loan.owner, loan.channelId);
    await startGroup(loan.owner, conversationId, loan.borrowerDevice);

    return { ...loan, conversationId };
  }

  it("gives the channel's two people one conversation of its own, open despite the block", async () => {
    const { owner, borrower, coOwner, loanId, channelId } = await blockedLoan(
      () => reservedLoan(),
    );

    const { conversationId } = await startChat(borrower, channelId);
    expect(await startChat(owner, channelId)).toEqual({ conversationId });
    expect(await logistics(owner, loanId)).toEqual([
      expect.objectContaining({ id: channelId, conversationId }),
    ]);

    for (const party of [owner, borrower]) {
      expect(await conversationOf(party, conversationId)).toMatchObject({
        kind: "loan_logistics",
        loanId,
        open: true,
      });
      const { conversations } = await executeQuery(
        tick(),
        listChatConversations,
        { actor: party, input: {} },
      );
      expect(conversations.map((c) => c.conversationId)).toContain(
        conversationId,
      );
    }

    // Ordinary chat between them stays closed.
    await expect(
      run(startChatConversation, owner, { userId: borrower.userId }),
    ).rejects.toMatchObject(notFound);

    // Nobody else gets in, or learns there is anything to get into.
    for (const outsider of [coOwner, await user()]) {
      await expect(startChat(outsider, channelId)).rejects.toMatchObject(
        notFound,
      );
      await expect(
        conversationOf(outsider, conversationId),
      ).rejects.toMatchObject(notFound);
    }
    await expect(startChat(owner, crypto.randomUUID())).rejects.toMatchObject(
      notFound,
    );
  });

  it("takes short messages only: one padding block", async () => {
    const { owner, borrower, conversationId } = await chattingLoan();

    expect(await say(borrower, conversationId, oneBlock)).toMatchObject({
      position: expect.any(String),
    });
    await expect(
      say(owner, conversationId, oneBlock + 1),
    ).rejects.toMatchObject(invalid);
  });

  it("takes nothing more once the loan ends, and stays the parties' to read", async () => {
    const { owner, borrower, loanId, channelId, conversationId } =
      await chattingLoan();

    await run(cancelLoan, borrower, { loanId });

    expect(await conversationOf(borrower, conversationId)).toMatchObject({
      open: false,
    });
    await expect(say(owner, conversationId)).rejects.toMatchObject(forbidden);
    // Asking for it again gives it back, but it stays closed.
    expect(await startChat(borrower, channelId)).toEqual({ conversationId });
  });

  it("takes nothing more after a safety closure", async () => {
    const { borrower, channelId, conversationId } = await chattingLoan();

    await closeForSafety(channelId);

    await expect(say(borrower, conversationId)).rejects.toMatchObject(
      forbidden,
    );
  });

  it("accepts nothing after the loan ends while a message is on its way", async () => {
    const { owner, borrower, loanId, conversationId } = await chattingLoan();
    const at = kit.now();

    // The loan ends in a transaction still open when the message comes:
    // the message waits for the channel and then finds it closed.
    const { value } = await commitWhileRacing(
      db,
      async (tx) => {
        await sql`
          update app.loans set status = 'ended', status_changed_at = ${at},
            end_reason = 'cancelled', ended_at = ${at},
            ended_by_user_id = ${borrower.userId}
          where id = ${loanId}
        `.execute(tx);
        await sql`delete from app.loan_reservations where loan_id = ${loanId}`.execute(
          tx,
        );
      },
      () => say(owner, conversationId).catch((error: unknown) => error),
    );

    expect(value).toMatchObject(forbidden);
  });

  it("cannot be started once the channel has closed without one", async () => {
    const { owner, channelId } = await blockedLoan(() => reservedLoan());
    await closeForSafety(channelId);

    await expect(startChat(owner, channelId)).rejects.toMatchObject(forbidden);
  });

  it("closes when the responsible lender changes, and leaves the new lender out", async () => {
    const { owner, borrower, coOwner, loanId, conversationId } =
      await chattingLoan(activeLoan);

    const { transferId } = await run(offerResponsibility, owner, {
      loanId,
      toUserId: coOwner.userId,
    });
    await run(acceptResponsibilityTransfer, coOwner, { loanId, transferId });

    expect(await conversationOf(borrower, conversationId)).toMatchObject({
      open: false,
    });
    await expect(
      conversationOf(coOwner, conversationId),
    ).rejects.toMatchObject(notFound);
  });
});

describe("concurrency (docs/architecture/05)", () => {
  it("leaves no open channel when a block races the loan's end", async () => {
    const { owner, borrower, loanId } = await reservedLoan();

    // The loan ends in a transaction that is still open when the block
    // comes: the block waits for it and then sees the loan has ended. It
    // ends on this file's clock, so the review window it opens is not due
    // for other files' publication jobs.
    const at = kit.now();
    await commitWhileRacing(
      db,
      async (tx) => {
        await sql`
          update app.loans set status = 'ended', status_changed_at = ${at},
            end_reason = 'cancelled', ended_at = ${at},
            ended_by_user_id = ${borrower.userId}
          where id = ${loanId}
        `.execute(tx);
        await sql`delete from app.loan_reservations where loan_id = ${loanId}`.execute(
          tx,
        );
      },
      () => block(borrower, owner),
    );

    expect(await channelsOf(loanId)).toEqual([]);
  });
});
