import { randomUUID } from "node:crypto";
import type { Notification } from "@lanbort/contracts";
import { afterAll, describe, expect, it } from "vitest";
import { systemActor, type UserActor } from "../actor";
import { executeQuery } from "../commands/query";
import { updateRequirements } from "../environment/environment-commands";
import {
  inviteMember,
  joinEnvironment,
  withdrawInvitation,
} from "../environment/membership-commands";
import { inviteAdministrator } from "../environment/role-commands";
import {
  changeEnvironmentType,
  withdrawTypeChange,
} from "../environment/type-change-commands";
import { acceptLoanAmendment, proposeLoanAmendment } from "../loans/amendments";
import { approveLoanRequest } from "../loans/approval";
import { cancelLoan } from "../loans/cancellation";
import { confirmLoanTerms, declineLoanRequest } from "../loans/commands";
import { reportHandover } from "../loans/handover";
import {
  acceptResponsibilityTransfer,
  offerResponsibility,
} from "../loans/responsibility";
import { reportReturn } from "../loans/return";
import { inviteCoOwner, withdrawCoOwnerInvitation } from "../objects/co-owners";
import { updateObject } from "../objects/commands";
import { ConsumerRegistry, type StoredEvent } from "../outbox/consumer";
import { processOutboxBatch } from "../outbox/worker";
import { acceptFriendRequest, sendFriendRequest } from "../social/commands";
import { connectTestDatabase } from "../testing/database";
import { loanTestKit } from "../testing/loans";
import {
  markAllNotificationsRead,
  markNotificationsRead,
  setNotificationPreference,
} from "./commands";
import { notifyLoanDeadlines } from "./deadlines";
import { notificationGenerator } from "./generator";
import { notificationDeadlineProcess } from "./policies";
import { listNotifications, readNotificationPreferences } from "./queries";

/**
 * WP-40: the notification centre and preferences (PS-COM-001–003). Events
 * go through the real outbox to the notification generator; each test
 * checks who is told, and just as much who is not.
 */
const db = connectTestDatabase();
afterAll(() => db.destroy());

const generator = notificationGenerator({ db: () => db });
const consumers = new ConsumerRegistry([generator]);
const kit = loanTestKit(db, { consumers });
const {
  run,
  tick,
  user,
  environment,
  member,
  create,
  addCoOwner,
  published,
  environmentOrigin,
  ask,
  day,
  dated,
  reservedLoan,
  versionOf,
} = kit;

const oneDay = 24 * 60 * 60 * 1000;
const notFound = { code: "not_found" };
const invalidInput = { code: "invalid_input" };

/** Runs the outbox until nothing for the generator is due. */
async function deliver() {
  while ((await processOutboxBatch(db, consumers, { batchSize: 100 })).claimed);
}

const centre = (actor: UserActor, cursor?: string) =>
  executeQuery(tick(), listNotifications, {
    actor,
    input: cursor === undefined ? {} : { cursor },
  });

/** What the actor was told, oldest first, without ids and times. */
async function told(actor: UserActor) {
  await deliver();
  const { notifications } = await centre(actor);

  return [...notifications]
    .reverse()
    .map(({ kind, level, detail, target }: Notification) => ({
      kind,
      level,
      detail,
      target,
    }));
}

const loan = (id: string) => ({ type: "loan", id });
const request = (id: string) => ({ type: "loan_request", id });

describe("the notification centre (PS-COM-001)", () => {
  it("tells the addressee of a friend request, and the requester of the answer", async () => {
    const anna = await user();
    const bo = await user();

    await run(sendFriendRequest, anna, { userId: bo.userId });
    expect(await told(bo)).toEqual([
      {
        kind: "social.friend_request",
        level: "action",
        detail: null,
        target: { type: "user", id: anna.userId },
      },
    ]);
    expect(await told(anna)).toEqual([]);

    await run(acceptFriendRequest, bo, { userId: anna.userId });
    expect(await told(anna)).toEqual([
      {
        kind: "social.friend_request_accepted",
        level: "information",
        detail: null,
        target: { type: "user", id: bo.userId },
      },
    ]);
    expect(await told(bo)).toHaveLength(1);
  });

  it("makes each notification once, however often and concurrently its event is delivered", async () => {
    const anna = await user();
    const bo = await user();
    await run(sendFriendRequest, anna, { userId: bo.userId });
    await deliver();

    const row = await db
      .selectFrom("app.audit_events")
      .selectAll()
      .where("event_type", "=", "friendship.requested")
      .where("actor_user_id", "=", anna.userId)
      .executeTakeFirstOrThrow();
    const event: StoredEvent = {
      id: row.id,
      type: row.event_type,
      version: row.event_version,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      actorUserId: row.actor_user_id,
      correlationId: row.correlation_id,
      occurredAt: row.occurred_at,
      payload: row.payload,
    };
    const delivery = { messageId: randomUUID(), attempt: 2, event };

    await Promise.all([generator.handle(delivery), generator.handle(delivery)]);
    await generator.handle(delivery);

    expect(await told(bo)).toHaveLength(1);
  });

  it("pages newest first and marks only the caller's own notifications as read", async () => {
    const bo = await user();
    const senders = [await user(), await user(), await user()];

    for (const sender of senders) {
      await run(sendFriendRequest, sender, { userId: bo.userId });
    }
    await deliver();

    const { notifications, unreadCount, nextCursor } = await centre(bo);
    expect(notifications.map((item) => item.target.id)).toEqual(
      senders.map((sender) => sender.userId).reverse(),
    );
    expect(unreadCount).toBe(3);
    expect(nextCursor).toBeNull();
    const [newest, middle, oldest] = notifications as [
      Notification,
      Notification,
      Notification,
    ];

    // A cursor is one of the caller's own: anyone else's gives nothing.
    expect(
      (await centre(bo, middle.id)).notifications.map((item) => item.id),
    ).toEqual([oldest.id]);
    const stranger = await user();
    expect((await centre(stranger, middle.id)).notifications).toEqual([]);

    // Someone else's notification looks like one that does not exist, also
    // mixed in with the caller's own, and nothing is marked.
    await expect(
      run(markNotificationsRead, stranger, { notificationIds: [newest.id] }),
    ).rejects.toMatchObject(notFound);
    await expect(
      run(markNotificationsRead, bo, {
        notificationIds: [newest.id, randomUUID()],
      }),
    ).rejects.toMatchObject(notFound);
    await expect(
      run(markAllNotificationsRead, stranger, { through: newest.id }),
    ).rejects.toMatchObject(notFound);
    expect((await centre(bo)).unreadCount).toBe(3);

    expect(
      await run(markNotificationsRead, bo, { notificationIds: [newest.id] }),
    ).toEqual({ unreadCount: 2 });
    // Repeating it is harmless, and read stays read.
    expect(
      await run(markNotificationsRead, bo, { notificationIds: [newest.id] }),
    ).toEqual({ unreadCount: 2 });

    // «Mark all» covers what the caller saw, not what came after.
    const late = await user();
    await run(sendFriendRequest, late, { userId: bo.userId });
    await deliver();
    expect(
      await run(markAllNotificationsRead, bo, { through: newest.id }),
    ).toEqual({ unreadCount: 1 });
    const after = await centre(bo);
    expect(after.notifications[0]).toMatchObject({
      target: { id: late.userId },
      readAt: null,
    });
    expect(after.notifications.slice(1).every((item) => item.readAt)).toBe(
      true,
    );
  });
});

describe("preferences (PS-COM-002–003)", () => {
  it("start from the pilot standard", async () => {
    const anna = await user();

    expect(
      await executeQuery(tick(), readNotificationPreferences, {
        actor: anna,
        input: {},
      }),
    ).toEqual({
      levels: [
        {
          level: "required",
          channels: [{ channel: "in_app", enabled: true, configurable: false }],
        },
        {
          level: "action",
          channels: [
            { channel: "in_app", enabled: true, configurable: false },
            { channel: "email", enabled: false, configurable: true },
          ],
        },
        {
          level: "information",
          channels: [
            { channel: "in_app", enabled: true, configurable: true },
            { channel: "email", enabled: false, configurable: true },
          ],
        },
      ],
    });
  });

  it("turn information off entirely, never required or action notifications, and never the domain", async () => {
    const anna = await user();
    const bo = await user();

    for (const level of ["required", "action"]) {
      await expect(
        run(setNotificationPreference, anna, {
          level,
          channel: "in_app",
          enabled: false,
        }),
      ).rejects.toMatchObject({ ...invalidInput, fields: ["channel"] });
    }
    const off = await run(setNotificationPreference, anna, {
      level: "information",
      channel: "in_app",
      enabled: false,
    });
    expect(off.levels[2]?.channels[0]).toEqual({
      channel: "in_app",
      enabled: false,
      configurable: true,
    });
    // Choosing the same again changes nothing.
    expect(
      await run(setNotificationPreference, anna, {
        level: "information",
        channel: "in_app",
        enabled: false,
      }),
    ).toEqual(off);

    await run(sendFriendRequest, anna, { userId: bo.userId });
    await run(acceptFriendRequest, bo, { userId: anna.userId });

    // The friendship is what it is; Anna is just not told.
    const friendship = await db
      .selectFrom("app.friendships")
      .select("status")
      .where("requester_id", "=", anna.userId)
      .where("addressee_id", "=", bo.userId)
      .executeTakeFirstOrThrow();
    expect(friendship.status).toBe("active");
    expect(await told(anna)).toEqual([]);

    // Action notifications still reach her.
    const cia = await user();
    await run(sendFriendRequest, cia, { userId: anna.userId });
    expect(await told(anna)).toMatchObject([{ kind: "social.friend_request" }]);
  });
});

describe("loan requests", () => {
  it("tell only the owners who see the request as a lender, and the borrower of the answer", async () => {
    const setup = await published();
    // A co-owner who is not a member of the environment does not see the
    // request there, so is not told about it either.
    const coOwner = await user();
    await addCoOwner(setup.owner, setup.objectId, coOwner);
    const { requestId } = await ask(
      setup.borrower,
      setup.objectId,
      environmentOrigin(setup.environmentId),
    );

    expect(await told(setup.owner)).toEqual([
      {
        kind: "loan_request.received",
        level: "action",
        detail: null,
        target: request(requestId),
      },
    ]);
    // Nor about the invitation, accepted before it was delivered.
    expect(await told(coOwner)).toEqual([]);
    expect(await told(setup.borrower)).toEqual([]);

    await run(declineLoanRequest, setup.owner, { requestId });
    expect(await told(setup.borrower)).toEqual([
      {
        kind: "loan_request.declined",
        level: "action",
        detail: null,
        target: request(requestId),
      },
    ]);
  });

  it("ask the borrower to confirm changed terms only when the terms changed", async () => {
    const setup = await published();
    const { requestId } = await ask(
      setup.borrower,
      setup.objectId,
      environmentOrigin(setup.environmentId),
    );

    await run(updateObject, setup.owner, {
      objectId: setup.objectId,
      expectedVersion: await versionOf(setup.objectId),
      title: "Stor tilhenger",
    });
    expect(await told(setup.borrower)).toEqual([]);

    await run(updateObject, setup.owner, {
      objectId: setup.objectId,
      expectedVersion: await versionOf(setup.objectId),
      loanTerms: "Nye vilkår.",
    });
    expect(await told(setup.borrower)).toEqual([
      {
        kind: "loan_request.terms_changed",
        level: "action",
        detail: null,
        target: request(requestId),
      },
    ]);

    await run(confirmLoanTerms, setup.borrower, {
      requestId,
      termsVersion: await versionOf(setup.objectId),
    });
    expect((await told(setup.owner)).map((item) => item.kind)).toEqual([
      "loan_request.received",
      "loan_request.terms_confirmed",
    ]);
  });

  it("tell the borrower whose period another approval took", async () => {
    const setup = await published();
    const origin = environmentOrigin(setup.environmentId);
    const other = await member(setup.environmentId, setup.admin);
    const first = await ask(
      setup.borrower,
      setup.objectId,
      origin,
      dated(2, 4),
    );
    const second = await ask(other, setup.objectId, origin, dated(3, 5));
    const { loanId } = await run(approveLoanRequest, setup.owner, {
      requestId: first.requestId,
    });

    expect(await told(setup.borrower)).toEqual([
      {
        kind: "loan.approved",
        level: "required",
        detail: null,
        target: loan(loanId),
      },
    ]);
    expect(await told(other)).toEqual([
      {
        kind: "loan_request.ended",
        level: "action",
        detail: "period_unavailable",
        target: request(second.requestId),
      },
    ]);
  });
});

describe("loans", () => {
  it("tell the other party of agreement changes and of a cancellation", async () => {
    const { owner, borrower, loanId } = await reservedLoan(2, 4);

    const { amendmentId } = await run(proposeLoanAmendment, borrower, {
      loanId,
      agreementVersion: 1,
      period: { start: day(2), end: day(5) },
    });
    await run(acceptLoanAmendment, owner, { loanId, amendmentId });
    await run(cancelLoan, borrower, { loanId });

    expect(
      (await told(owner)).filter((item) => item.target.type === "loan"),
    ).toEqual(
      ["loan.amendment_proposed", "loan.cancelled"].map((kind) => ({
        kind,
        level: "required",
        detail: null,
        target: loan(loanId),
      })),
    );
    expect((await told(borrower)).map((item) => item.kind)).toEqual([
      "loan.approved",
      "loan.amendment_accepted",
    ]);
  });

  it("tell what the other party said about the handover, and the parties of other loans that possession is uncertain", async () => {
    const anne = await reservedLoan(1, 3);
    const kari = await member(anne.environmentId, anne.admin);
    const karis = await ask(
      kari,
      anne.objectId,
      environmentOrigin(anne.environmentId),
      dated(7, 9),
    );
    const { loanId: karisLoanId } = await run(approveLoanRequest, anne.owner, {
      requestId: karis.requestId,
    });
    kit.advance(2 * oneDay);
    await deliver();
    const before = {
      owner: (await told(anne.owner)).length,
      borrower: (await told(anne.borrower)).length,
      kari: (await told(kari)).length,
    };

    const say = (actor: UserActor, outcome: string) =>
      run(reportHandover, actor, {
        loanId: anne.loanId,
        agreementVersion: 1,
        outcome,
      });
    await say(anne.owner, "handed_over");
    await say(anne.borrower, "not_handed_over");

    expect((await told(anne.borrower)).slice(before.borrower)).toEqual([
      {
        kind: "loan.handover_reported",
        level: "required",
        detail: "handed_over",
        target: loan(anne.loanId),
      },
    ]);
    // The owner is the lender of both loans, so learns both; Kari learns
    // only that her own loan may be at risk, nothing about Anne's.
    expect((await told(anne.owner)).slice(before.owner)).toEqual([
      {
        kind: "loan.handover_reported",
        level: "required",
        detail: "not_handed_over",
        target: loan(anne.loanId),
      },
      {
        kind: "loan.possession_uncertain",
        level: "required",
        detail: null,
        target: loan(karisLoanId),
      },
    ]);
    expect((await told(kari)).slice(before.kari)).toEqual([
      {
        kind: "loan.possession_uncertain",
        level: "required",
        detail: null,
        target: loan(karisLoanId),
      },
    ]);
  });

  it("tell the lender what the borrower said about the return", async () => {
    const { owner, borrower, loanId } = await reservedLoan(0, 2);
    await run(reportHandover, owner, {
      loanId,
      agreementVersion: 1,
      outcome: "handed_over",
    });
    await run(reportReturn, borrower, {
      loanId,
      agreementVersion: 1,
      outcome: "returned",
      immediately: true,
    });

    expect((await told(owner)).at(-1)).toEqual({
      kind: "loan.return_reported",
      level: "required",
      detail: "returned",
      target: loan(loanId),
    });
    expect((await told(borrower)).map((item) => item.kind)).toEqual([
      "loan.approved",
      "loan.handover_reported",
    ]);
  });

  it("tell the co-owner of an offered role, and the borrower clearly when it moved", async () => {
    const setup = await published();
    const coOwner = await user();
    await addCoOwner(setup.owner, setup.objectId, coOwner);
    const { requestId } = await ask(
      setup.borrower,
      setup.objectId,
      environmentOrigin(setup.environmentId),
      dated(2, 4),
    );
    const { loanId } = await run(approveLoanRequest, setup.owner, {
      requestId,
    });

    const { transferId } = await run(offerResponsibility, setup.owner, {
      loanId,
      toUserId: coOwner.userId,
    });
    const aboutLoan = async (actor: UserActor) =>
      (await told(actor)).filter((item) => item.target.id === loanId);
    expect(await aboutLoan(coOwner)).toEqual([
      {
        kind: "loan.responsibility_offered",
        level: "action",
        detail: null,
        target: loan(loanId),
      },
    ]);

    await run(acceptResponsibilityTransfer, coOwner, { loanId, transferId });
    const transferred = {
      kind: "loan.responsibility_transferred",
      level: "required",
      detail: null,
      target: loan(loanId),
    };
    expect((await told(setup.borrower)).at(-1)).toEqual(transferred);
    expect((await told(setup.owner)).at(-1)).toEqual(transferred);
    expect(await aboutLoan(coOwner)).toHaveLength(1);
  });
});

describe("loan deadlines", () => {
  const deadlines = () =>
    run(notifyLoanDeadlines, systemActor(notificationDeadlineProcess), {});

  it("tell both parties once when the handover day is over and when the return is due and overdue", async () => {
    const { owner, borrower, loanId } = await reservedLoan(2, 4);
    const about = async (actor: UserActor) =>
      (await told(actor))
        .filter((item) => item.target.id === loanId)
        .map((item) => item.kind);

    await deadlines();
    expect(await about(owner)).toEqual([]);

    // Day 3: the handover day (2) is over without a handover.
    kit.advance(3 * oneDay);
    await deadlines();
    await deadlines();
    expect(await about(owner)).toEqual(["loan.handover_day_passed"]);
    expect(await about(borrower)).toEqual([
      "loan.approved",
      "loan.handover_day_passed",
    ]);

    await run(reportHandover, owner, {
      loanId,
      agreementVersion: 1,
      outcome: "handed_over",
    });
    await deliver();
    // Day 4 is the last day; day 5 it is over.
    kit.advance(oneDay);
    await deadlines();
    kit.advance(oneDay);
    await deadlines();
    await deadlines();
    expect(await about(owner)).toEqual([
      "loan.handover_day_passed",
      "loan.return_due",
      "loan.return_day_passed",
    ]);
    expect((await about(borrower)).slice(2)).toEqual([
      "loan.handover_reported",
      "loan.return_due",
      "loan.return_day_passed",
    ]);
  });

  it("only runs as the deadline job", async () => {
    await expect(
      run(notifyLoanDeadlines, await user(), {}),
    ).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("environments and co-ownership", () => {
  it("tell the invited, and the administrators who review an application, without revealing a hidden environment to anyone else", async () => {
    const admin = await user();
    const hidden = await environment(admin, { type: "hidden" });
    const invited = await user();
    const stranger = await user();

    await run(inviteMember, admin, {
      environmentId: hidden,
      userId: invited.userId,
    });
    expect(await told(invited)).toEqual([
      {
        kind: "environment.membership_invited",
        level: "action",
        detail: null,
        target: { type: "environment", id: hidden },
      },
    ]);
    expect(await told(stranger)).toEqual([]);

    const closed = await environment(admin, { type: "closed" });
    const applicant = await user();
    await run(joinEnvironment, applicant, {
      environmentId: closed,
      answers: [],
    });
    expect(await told(admin)).toEqual([
      {
        kind: "environment.membership_review_requested",
        level: "action",
        detail: null,
        target: { type: "environment", id: closed },
      },
    ]);
    expect(await told(applicant)).toEqual([]);
  });

  it("tell a member invited to a role, and a user invited to co-own an object", async () => {
    const admin = await user();
    const environmentId = await environment(admin);
    const colleague = await member(environmentId, admin);

    await run(inviteAdministrator, admin, {
      environmentId,
      userId: colleague.userId,
    });
    expect(await told(colleague)).toEqual([
      {
        kind: "environment.role_invited",
        level: "action",
        detail: "administrator",
        target: { type: "environment", id: environmentId },
      },
    ]);

    const objectId = await create(admin);
    const { invitationId } = await run(inviteCoOwner, admin, {
      objectId,
      userId: colleague.userId,
    });
    expect((await told(colleague)).at(-1)).toEqual({
      kind: "object.co_owner_invited",
      level: "action",
      detail: null,
      target: { type: "object_invitation", id: invitationId },
    });
  });

  it("tell nobody of an invitation or a proposal withdrawn before it was delivered", async () => {
    const admin = await user();
    const hidden = await environment(admin, { type: "hidden" });
    const invited = await user();
    const { membershipId } = await run(inviteMember, admin, {
      environmentId: hidden,
      userId: invited.userId,
    });
    await run(withdrawInvitation, admin, {
      environmentId: hidden,
      membershipId,
    });

    const objectId = await create(admin);
    const { invitationId } = await run(inviteCoOwner, admin, {
      objectId,
      userId: invited.userId,
    });
    await run(withdrawCoOwnerInvitation, admin, { objectId, invitationId });

    const closed = await environment(admin, { type: "closed" });
    const colleague = await member(closed, admin);
    await deliver();
    const { proposal } = await run(changeEnvironmentType, admin, {
      environmentId: closed,
      expectedType: "closed",
      type: "open",
    });
    await run(withdrawTypeChange, admin, {
      environmentId: closed,
      proposalId: proposal!.id,
    });

    expect(await told(invited)).toEqual([]);
    expect(
      (await told(colleague)).filter(
        ({ kind }) => kind === "environment.type_change_proposed",
      ),
    ).toEqual([]);
  });

  it("tell the actor too when what they did leaves them something to do", async () => {
    const admin = await user();
    const environmentId = await environment(admin, { type: "closed" });
    const colleague = await member(environmentId, admin);
    const requirementsChanged = {
      kind: "environment.requirements_changed",
      level: "action",
      detail: null,
      target: { type: "environment", id: environmentId },
    };

    // The administrator is held to the new requirement as well.
    await run(updateRequirements, admin, {
      environmentId,
      requirements: [{ kind: "information", text: "Hvilken leilighet?" }],
      expectedRevision: 0,
    });
    expect(await told(admin)).toEqual([requirementsChanged]);
    expect((await told(colleague)).at(-1)).toEqual(requirementsChanged);

    // The one who proposes a weaker type answers like everyone else.
    await run(changeEnvironmentType, admin, {
      environmentId,
      expectedType: "closed",
      type: "open",
    });
    const proposed = {
      kind: "environment.type_change_proposed",
      level: "action",
      detail: "open",
      target: { type: "environment", id: environmentId },
    };
    expect((await told(admin)).at(-1)).toEqual(proposed);
    expect((await told(colleague)).at(-1)).toEqual(proposed);
  });
});
