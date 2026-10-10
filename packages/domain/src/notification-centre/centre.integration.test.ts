import type {
  DescribedNotification,
  NotificationKind,
} from "@lanbort/contracts";
import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { UserActor } from "../actor";
import { executeQuery } from "../commands/query";
import {
  acceptInvitation,
  inviteMember,
  joinEnvironment,
  rejectMembership,
  requestInformation,
  submitAnswers,
  withdrawInvitation,
} from "../environment/membership-commands";
import {
  declineRoleInvitation,
  inviteAdministrator,
} from "../environment/role-commands";
import { approveLoanRequest } from "../loans/approval";
import { declineLoanRequest, withdrawLoanRequest } from "../loans/commands";
import { inviteCoOwner, withdrawCoOwnerInvitation } from "../objects/co-owners";
import { attachObjectImage } from "../objects/images";
import { notificationGenerator } from "../notifications/generator";
import { ConsumerRegistry } from "../outbox/consumer";
import {
  acceptFriendRequest,
  sendFriendRequest,
  withdrawFriendRequest,
} from "../social/commands";
import { connectTestDatabase } from "../testing/database";
import { loanTestKit } from "../testing/loans";
import { deliverAll } from "../testing/outbox";
import { readNotificationCentre } from "./queries";

/**
 * The notification centre names what a notification is about only as the
 * reader may see it now, and says whether one that asks for an answer
 * still does (UX-IA-019, PS-USR-011).
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
  environment,
  member,
  create,
  published,
  environmentOrigin,
  ask,
} = kit;

/** The reader's notifications of `kind`, newest first, as the centre describes them. */
async function every(
  actor: UserActor,
  kind: NotificationKind,
): Promise<DescribedNotification[]> {
  await deliverAll(db, consumers);
  const { notifications } = await executeQuery(tick(), readNotificationCentre, {
    actor,
    input: {},
  });

  return notifications.filter((notification) => notification.kind === kind);
}

/** The reader's latest notification of `kind`, as the centre describes it. */
async function latest(
  actor: UserActor,
  kind: NotificationKind,
): Promise<DescribedNotification> {
  const [found] = await every(actor, kind);

  if (!found) throw new Error(`No ${kind}`);

  return found;
}

describe("a loan request", () => {
  it("names the thing, the borrower and the environment, and follows the answer", async () => {
    const { owner, borrower, objectId, environmentId } = await published();
    const asked = () =>
      ask(borrower, objectId, environmentOrigin(environmentId));

    const { requestId } = await asked();
    expect(await latest(owner, "loan_request.received")).toMatchObject({
      target: { id: requestId },
      about: {
        thing: "Tilhenger",
        person: expect.any(String),
        place: "Borettslaget",
      },
      standing: "open",
    });

    await run(approveLoanRequest, owner, { requestId });
    expect(await latest(owner, "loan_request.received")).toMatchObject({
      standing: "accepted",
    }); // The loan it became names the same, from the borrower's side.
    expect(await latest(borrower, "loan.approved")).toMatchObject({
      about: {
        thing: "Tilhenger",
        person: expect.any(String),
        place: "Borettslaget",
      },
      standing: null,
    });
  });

  it("shows the thing's picture through the request and the loan (PS-OBJ-021)", async () => {
    const { owner, borrower, objectId, environmentId } = await published();
    const imageId = randomUUID();
    await run(attachObjectImage, owner, {
      objectId,
      imageId,
      byteSize: 1,
      width: 4,
      height: 3,
    });

    const { requestId } = await ask(
      borrower,
      objectId,
      environmentOrigin(environmentId),
    );
    expect(
      (await latest(owner, "loan_request.received")).about.picture,
    ).toEqual({ through: "loan_request", requestId, imageId });

    const { loanId } = await run(approveLoanRequest, owner, { requestId });
    expect((await latest(borrower, "loan.approved")).about.picture).toEqual({
      through: "loan",
      loanId,
      imageId,
    });
  });

  it("says when it was declined, and when it no longer applies", async () => {
    const { owner, borrower, objectId, environmentId } = await published();
    const origin = environmentOrigin(environmentId);

    const declined = await ask(borrower, objectId, origin);
    await run(declineLoanRequest, owner, { requestId: declined.requestId });
    expect(await latest(owner, "loan_request.received")).toMatchObject({
      standing: "declined",
    });

    const withdrawn = await ask(borrower, objectId, origin);
    await run(withdrawLoanRequest, borrower, {
      requestId: withdrawn.requestId,
    });
    expect(await latest(owner, "loan_request.received")).toMatchObject({
      target: { id: withdrawn.requestId },
      standing: "lapsed",
    });
  });
});

describe("a friend request", () => {
  it("names the person while it waits, and says once they are friends", async () => {
    const [anna, bo] = [await user(), await user()];

    await run(sendFriendRequest, anna, { userId: bo.userId });
    expect(await latest(bo, "social.friend_request")).toMatchObject({
      about: { person: expect.any(String) },
      standing: "open",
    });

    await run(acceptFriendRequest, bo, { userId: anna.userId });
    expect(await latest(bo, "social.friend_request")).toMatchObject({
      standing: "accepted",
    });
  });

  it("stays when withdrawn, saying it no longer applies, without the name", async () => {
    const [anna, bo] = [await user(), await user()];

    await run(sendFriendRequest, anna, { userId: bo.userId });
    await deliverAll(db, consumers);
    await run(withdrawFriendRequest, anna, { userId: bo.userId });

    // Nothing relates the two any more, so Anna is nobody Bo may see.
    expect(await latest(bo, "social.friend_request")).toMatchObject({
      about: { person: null },
      standing: "lapsed",
    });
  });
});

describe("a request for more information (PS-ENV-019)", () => {
  it("waits on the applicant until the answers are sent again", async () => {
    const admin = await user();
    const closed = await environment(admin, { type: "closed" });
    const applicant = await user();
    const { membershipId } = await run(joinEnvironment, applicant, {
      environmentId: closed,
      answers: [],
    });

    await run(requestInformation, admin, {
      environmentId: closed,
      membershipId,
    });
    expect(
      await latest(applicant, "environment.membership_information_requested"),
    ).toMatchObject({ about: { place: expect.any(String) }, standing: "open" });

    await run(submitAnswers, applicant, { environmentId: closed, answers: [] });
    expect(
      await latest(applicant, "environment.membership_information_requested"),
    ).toMatchObject({ standing: "accepted" });
  });

  it("keeps each request's own outcome when the administrators ask again or decide", async () => {
    const admin = await user();
    const closed = await environment(admin, { type: "closed" });
    const applicant = await user();
    const { membershipId } = await run(joinEnvironment, applicant, {
      environmentId: closed,
      answers: [],
    });
    const standings = async () =>
      (
        await every(applicant, "environment.membership_information_requested")
      ).map(({ standing }) => standing);
    const requestMore = () =>
      run(requestInformation, admin, { environmentId: closed, membershipId });

    await requestMore();
    await run(submitAnswers, applicant, { environmentId: closed, answers: [] });
    await requestMore();
    expect(await standings()).toEqual(["open", "accepted"]);

    await run(rejectMembership, admin, { environmentId: closed, membershipId });
    expect(await standings()).toEqual(["lapsed", "accepted"]);
  });
});

describe("invitations", () => {
  it("never name a hidden environment the reader can no longer see", async () => {
    const admin = await user();
    const hidden = await environment(admin, { type: "hidden" });
    const invited = await user();
    const { membershipId } = await run(inviteMember, admin, {
      environmentId: hidden,
      userId: invited.userId,
    });

    expect(
      await latest(invited, "environment.membership_invited"),
    ).toMatchObject({ about: { place: expect.any(String) }, standing: "open" });

    await run(withdrawInvitation, admin, {
      environmentId: hidden,
      membershipId,
    });
    expect(await latest(invited, "environment.membership_invited")).toEqual(
      expect.objectContaining({
        about: { thing: null, picture: null, person: null, place: null },
        standing: "lapsed",
      }),
    );
  });

  it("follow the invited member's own answer", async () => {
    const admin = await user();
    const closed = await environment(admin, { type: "closed" });
    const invited = await user();
    await run(inviteMember, admin, {
      environmentId: closed,
      userId: invited.userId,
    });
    await deliverAll(db, consumers);
    await run(acceptInvitation, invited, {
      environmentId: closed,
      answers: [],
    });

    expect(
      await latest(invited, "environment.membership_invited"),
    ).toMatchObject({ standing: "accepted" });

    const colleague = await member(closed, admin);
    const { invitationId } = await run(inviteAdministrator, admin, {
      environmentId: closed,
      userId: colleague.userId,
    });
    expect(await latest(colleague, "environment.role_invited")).toMatchObject({
      standing: "open",
    });
    await run(declineRoleInvitation, colleague, {
      environmentId: closed,
      invitationId,
    });
    expect(await latest(colleague, "environment.role_invited")).toMatchObject({
      standing: "declined",
    });
  });

  it("to co-own an object name and show it only while it is offered (PS-OBJ-021)", async () => {
    const admin = await user();
    const invited = await user();
    const objectId = await create(admin);
    const imageId = randomUUID();
    await run(attachObjectImage, admin, {
      objectId,
      imageId,
      byteSize: 1,
      width: 4,
      height: 3,
    });
    const { invitationId } = await run(inviteCoOwner, admin, {
      objectId,
      userId: invited.userId,
    });

    expect(await latest(invited, "object.co_owner_invited")).toMatchObject({
      about: {
        thing: expect.any(String),
        picture: { through: "object_invitation", invitationId, imageId },
      },
      standing: "open",
    });

    await run(withdrawCoOwnerInvitation, admin, { objectId, invitationId });
    expect(await latest(invited, "object.co_owner_invited")).toMatchObject({
      about: { thing: null, picture: null },
      standing: "lapsed",
    });
  });
});

describe("the reader's own notifications only", () => {
  it("are described, and others' stay theirs", async () => {
    const [anna, bo, cleo] = [await user(), await user(), await user()];

    await run(sendFriendRequest, anna, { userId: bo.userId });
    await deliverAll(db, consumers);
    const { notifications } = await executeQuery(
      tick(),
      readNotificationCentre,
      { actor: cleo, input: {} },
    );

    expect(notifications).toEqual([]);
  });
});
