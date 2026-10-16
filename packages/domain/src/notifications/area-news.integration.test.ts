import { randomUUID } from "node:crypto";
import type { NotificationKind, NotificationTarget } from "@lanbort/contracts";
import { afterAll, describe, expect, it } from "vitest";
import type { UserActor } from "../actor";
import {
  openEnvironmentContact,
  reportUnavailability,
} from "../cases/commands";
import { executeQuery } from "../commands/query";
import { connectTestDatabase } from "../testing/database";
import { loanTestKit } from "../testing/loans";
import { markAreaSeen, markNotificationsRead } from "./commands";
import { readAttention } from "./queries";
import { recordChatMessage, recordNotifications } from "./store";

/**
 * UX-IA-022: what is new in each area of the main navigation since the
 * user last opened its page, counted by what the notifications are about.
 */
const db = connectTestDatabase();
afterAll(() => db.destroy());

const kit = loanTestKit(db);
const { run, tick, user, reservedLoan, environment, member, friends } = kit;

const attention = (actor: UserActor) =>
  executeQuery(tick(), readAttention, { actor, input: {} });

const news = async (actor: UserActor) => (await attention(actor)).news;

const nothingNew = { home: 0, loans: 0, things: 0, conversations: 0 };

/** Tells `actor` of `kind` about `target`, as the generator would. */
async function tell(
  actor: UserActor,
  kind: NotificationKind,
  target: NotificationTarget,
) {
  await recordNotifications(db, randomUUID(), kit.now(), [
    { recipientId: actor.userId, kind, target },
  ]);
}

const message = (actor: UserActor, conversationId: string) =>
  recordChatMessage(db, {
    conversationId,
    messageKey: randomUUID(),
    recipientIds: [actor.userId],
    occurredAt: kit.now(),
  });

const ownNotificationIds = async (actor: UserActor) =>
  (
    await db
      .selectFrom("app.notifications")
      .select("id")
      .where("recipient_id", "=", actor.userId)
      .orderBy("position")
      .execute()
  ).map(({ id }) => id);

describe("news in the main navigation (UX-IA-022)", () => {
  it("has nothing new for a new account", async () => {
    const actor = await user();

    expect(await attention(actor)).toEqual({
      unreadCount: 0,
      news: nothingNew,
    });
  });

  it("counts each loan once, from its request to the loan, where it shows", async () => {
    const { owner, requestId, loanId } = await reservedLoan();
    await run(markAreaSeen, owner, { area: "home" });
    await run(markAreaSeen, owner, { area: "loans" });

    await tell(owner, "loan_request.received", {
      type: "loan_request",
      id: requestId,
    });
    await tell(owner, "loan.return_due", { type: "loan", id: loanId });
    await tell(owner, "loan_review.published", {
      type: "loan_reviews",
      id: loanId,
    });

    // One loan, on Home and in Lån alike; the review only in Lån.
    expect(await news(owner)).toEqual({ ...nothingNew, home: 1, loans: 1 });

    const friend = await user();
    await tell(owner, "social.friend_request", {
      type: "user",
      id: friend.userId,
    });
    expect(await news(owner)).toEqual({ ...nothingNew, home: 2, loans: 1 });
  });

  it("starts an area over when its page is opened, and only that area", async () => {
    const actor = await user();
    const thing = randomUUID();
    await tell(actor, "object.co_owner_invited", {
      type: "object_invitation",
      id: thing,
    });
    expect(await news(actor)).toEqual({ ...nothingNew, home: 1, things: 1 });

    const after = await run(markAreaSeen, actor, { area: "things" });

    expect(after.news).toEqual({ ...nothingNew, home: 1 });
    // The bell keeps its number: opening an area reads nothing.
    expect(after.unreadCount).toBe(1);
    expect(await news(actor)).toEqual(after.news);

    // What happens afterwards is new again.
    await tell(actor, "object.co_owner_invited", {
      type: "object_invitation",
      id: randomUUID(),
    });
    expect(await news(actor)).toEqual({ ...nothingNew, home: 2, things: 1 });
  });

  it("counts conversations with new messages, also after the area was opened", async () => {
    const actor = await user();
    const [first, second] = [randomUUID(), randomUUID()];
    await message(actor, first);
    await message(actor, first);
    await message(actor, second);

    expect((await news(actor)).conversations).toBe(2);

    await run(markAreaSeen, actor, { area: "conversations" });
    expect((await news(actor)).conversations).toBe(0);

    // A new message in a conversation not yet read is news again, even
    // though its notification is the same one, now with a newer place.
    await message(actor, first);
    expect((await news(actor)).conversations).toBe(1);
  });

  it("counts a case waiting in an environment's queue on Home, not the platform's", async () => {
    const admin = await user();
    const environmentId = await environment(admin);
    const requester = await member(environmentId, admin);
    const { caseId } = await run(openEnvironmentContact, requester, {
      environmentId,
      body: "Hvem har nøkkelen til boden?",
    });
    const [reporter, subject] = [await user(), await user()];
    await friends(reporter, subject);
    const platformCase = await run(reportUnavailability, reporter, {
      userId: subject.userId,
      body: "Jeg har hørt at hun gikk bort.",
    });
    await run(markAreaSeen, admin, { area: "home" });

    await tell(admin, "case.waiting", { type: "case", id: caseId });
    await tell(admin, "case.assigned_to_you", { type: "case", id: caseId });
    // As if the administrator also handled the platform's queue.
    await tell(admin, "case.waiting", {
      type: "case",
      id: platformCase.caseId,
    });

    expect(await news(admin)).toEqual({ ...nothingNew, home: 1 });
  });

  it("leaves out what the user has already read in the notification centre", async () => {
    const actor = await user();
    const friend = await user();
    await tell(actor, "social.friend_request", {
      type: "user",
      id: friend.userId,
    });
    expect((await news(actor)).home).toBe(1);

    await run(markNotificationsRead, actor, {
      notificationIds: await ownNotificationIds(actor),
    });

    expect(await news(actor)).toEqual(nothingNew);
  });

  it("is not news for information that leads nowhere on Home", async () => {
    const actor = await user();
    await tell(actor, "object.question_replied", {
      type: "object_question",
      id: randomUUID(),
    });

    expect(await attention(actor)).toEqual({
      unreadCount: 1,
      news: nothingNew,
    });
  });

  it("refuses an area the navigation does not have", async () => {
    const actor = await user();

    await expect(
      run(markAreaSeen, actor, { area: "find" }),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });
});
