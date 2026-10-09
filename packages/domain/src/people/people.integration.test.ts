import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import type { UserActor } from "../actor";
import { executeQuery } from "../commands/query";
import { leaveEnvironment } from "../environment/membership-commands";
import { approveLoanRequest } from "../loans/approval";
import { readLoan } from "../loans/queries";
import { deactivateAccount } from "../account/lifecycle";
import {
  blockUser,
  declineFriendRequest,
  liftUserBlock,
  sendFriendRequest,
} from "../social/commands";
import { getSocialOverview } from "../social/queries";
import { connectTestDatabase } from "../testing/database";
import { loanTestKit } from "../testing/loans";
import { readPerson } from "./queries";

/**
 * WP-86: a person's page, and the links to it from the places that name
 * people. Who may open it follows the relation now: friends, a shared
 * environment, a pending request or one's own block. Anyone else, and
 * anyone who blocks the reader, looks like nobody (PS-USR-006, UX-PRIV-007).
 */
const db = connectTestDatabase();
afterAll(() => db.destroy());

const kit = loanTestKit(db);
const { run, tick, user, published, friends } = kit;

const notFound = { code: "not_found" };
const name = "Test Testesen";

const personOf = (reader: UserActor, subject: { userId: string }) =>
  executeQuery(tick(), readPerson, {
    actor: reader,
    input: { userId: subject.userId },
  });

const relation = (
  subject: UserActor,
  friendship: string,
  blockedByMe = false,
  canRequest = friendship === "none" && !blockedByMe,
) => ({ userId: subject.userId, friendship, blockedByMe, canRequest });

describe("a person's page (WP-86)", () => {
  it("shows the reader themselves, with their trust profile", async () => {
    const me = await user();

    expect(await personOf(me, me)).toEqual({
      userId: me.userId,
      realName: name,
      pictureId: null,
      relation: null,
      trustProfile: true,
    });
  });

  it("shows friends and fellow members with their trust profile", async () => {
    const { admin, owner, borrower } = await published();
    const friend = await user();
    await friends(owner, friend);

    expect(await personOf(owner, friend)).toEqual({
      userId: friend.userId,
      realName: name,
      pictureId: null,
      relation: relation(friend, "friends"),
      trustProfile: true,
    });
    expect(await personOf(borrower, admin)).toMatchObject({
      relation: relation(admin, "none"),
      trustProfile: true,
    });
  });

  it("shows both sides of a pending request, without the trust profile", async () => {
    const [anna, bo] = [await user(), await user()];
    await run(sendFriendRequest, anna, { userId: bo.userId });

    expect(await personOf(bo, anna)).toMatchObject({
      realName: name,
      pictureId: null,
      relation: relation(anna, "incoming_pending"),
      trustProfile: false,
    });
    expect(await personOf(anna, bo)).toMatchObject({
      relation: relation(bo, "outgoing_pending"),
      trustProfile: false,
    });
  });

  it("says only that a declined sender cannot ask now (PS-USR-012)", async () => {
    const { admin, borrower } = await published();
    await run(sendFriendRequest, borrower, { userId: admin.userId });
    await run(declineFriendRequest, admin, { userId: borrower.userId });

    expect(await personOf(borrower, admin)).toMatchObject({
      relation: relation(admin, "none", false, false),
    });
    expect(await personOf(admin, borrower)).toMatchObject({
      relation: relation(borrower, "none", false, true),
    });
  });

  it("is nobody to a stranger, and to a former fellow member", async () => {
    const { environmentId, owner, borrower } = await published();
    const stranger = await user();

    await expect(personOf(stranger, owner)).rejects.toMatchObject(notFound);
    await expect(
      personOf(stranger, { userId: randomUUID() }),
    ).rejects.toMatchObject(notFound);

    await run(leaveEnvironment, borrower, { environmentId });
    await expect(personOf(owner, borrower)).rejects.toMatchObject(notFound);
  });

  it("keeps someone the reader blocks, and hides a reader's blocker", async () => {
    const { owner, borrower } = await published();
    await run(blockUser, owner, { userId: borrower.userId });

    expect(await personOf(owner, borrower)).toMatchObject({
      relation: relation(borrower, "none", true),
      trustProfile: false,
    });
    await expect(personOf(borrower, owner)).rejects.toMatchObject(notFound);

    // Lifting it leaves them fellow members again.
    await run(liftUserBlock, owner, { userId: borrower.userId });
    expect(await personOf(borrower, owner)).toMatchObject({
      trustProfile: true,
    });
  });

  it("is nobody once the account is deactivated or deleted (UX-PRIV-010)", async () => {
    const [anna, bo, cleo] = [await user(), await user(), await user()];
    await friends(anna, bo);
    await friends(anna, cleo);
    await run(blockUser, anna, { userId: cleo.userId });

    await run(deactivateAccount, bo, {});
    await expect(personOf(anna, bo)).rejects.toMatchObject(notFound);

    await db
      .deleteFrom("app.profiles")
      .where("user_id", "=", cleo.userId)
      .execute();
    await expect(personOf(anna, cleo)).rejects.toMatchObject(notFound);
  });
});

describe("links to a person's page (UX-PRIV-007)", () => {
  it("links the friends, requests and blocks the reader may open", async () => {
    const [anna, bo, cleo, dan] = [
      await user(),
      await user(),
      await user(),
      await user(),
    ];
    await friends(anna, bo);
    await friends(anna, dan);
    await run(sendFriendRequest, cleo, { userId: anna.userId });
    await run(deactivateAccount, dan, {});

    const overview = await executeQuery(tick(), getSocialOverview, {
      actor: anna,
      input: {},
    });
    const links = Object.fromEntries(
      [...overview.friends, ...overview.incomingRequests].map((contact) => [
        contact.userId,
        contact.profileId,
      ]),
    );

    expect(links).toEqual({
      [bo.userId]: bo.userId,
      [cleo.userId]: cleo.userId,
      [dan.userId]: null,
    });
  });

  it("links the other party of a loan only while the relation allows it", async () => {
    const { environmentId, owner, borrower, objectId } = await published();
    const { requestId } = await kit.ask(
      borrower,
      objectId,
      kit.environmentOrigin(environmentId),
      kit.dated(1, 2),
    );
    const { loanId } = await run(approveLoanRequest, owner, { requestId });
    const parties = async (reader: UserActor) =>
      (
        await executeQuery(tick(), readLoan, {
          actor: reader,
          input: { loanId },
        })
      ).parties;

    expect(await parties(borrower)).toEqual({
      borrower: { realName: name, profileId: borrower.userId, pictureId: null },
      lender: { realName: name, profileId: owner.userId, pictureId: null },
    });

    // Without a shared environment or friendship, the loan stays but the
    // way to the profile goes.
    await run(leaveEnvironment, borrower, { environmentId });
    expect((await parties(borrower)).lender).toEqual({
      realName: name,
      profileId: null,
      pictureId: null,
    });
  });
});
