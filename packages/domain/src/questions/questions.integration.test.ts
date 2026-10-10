import { randomUUID } from "node:crypto";
import type { Notification } from "@lanbort/contracts";
import { afterAll, describe, expect, it } from "vitest";
import type { UserActor } from "../actor";
import { executeQuery } from "../commands/query";
import { leaveEnvironment } from "../environment/membership-commands";
import { stillConcerns } from "../notifications/concerns";
import { notificationGenerator } from "../notifications/generator";
import { listNotifications } from "../notifications/queries";
import { consentToObjectDeletion } from "../objects/deletion";
import { ConsumerRegistry } from "../outbox/consumer";
import { publishObject, withdrawPublication } from "../publications/commands";
import { blockUser } from "../social/commands";
import { connectTestDatabase } from "../testing/database";
import { loanTestKit } from "../testing/loans";
import { deliverAll } from "../testing/outbox";
import {
  commitWhileRacing,
  endMembership,
  notifiedSince,
  storedEvent,
} from "../testing/races";
import { askObjectQuestion, replyToObjectQuestion } from "./commands";
import { listObjectQuestions, readObjectQuestion } from "./queries";

/**
 * WP-63: environment-specific object questions (PS-OBJ-015). Each test
 * checks who sees and is told, and just as much who is not.
 */
const db = connectTestDatabase();
afterAll(() => db.destroy());

const generator = notificationGenerator({ db: () => db });
const consumers = new ConsumerRegistry([generator]);
const kit = loanTestKit(db, { consumers });
const { run, tick, user, environment, join, member, addCoOwner, published } =
  kit;

const notFound = { code: "not_found" };

async function deliver() {
  await deliverAll(db, consumers);
}

/** What the actor was told about questions, oldest first. */
async function told(actor: UserActor) {
  await deliver();
  const { notifications } = await executeQuery(tick(), listNotifications, {
    actor,
    input: {},
  });

  return [...notifications]
    .reverse()
    .filter(({ kind }) => kind.startsWith("object.question"))
    .map(({ kind, level, target }: Notification) => ({ kind, level, target }));
}

const ask = (
  actor: UserActor,
  environmentId: string,
  objectId: string,
  body = "Er den lang nok til taket?",
  idempotencyKey?: string,
) =>
  run(
    askObjectQuestion,
    actor,
    { environmentId, objectId, body },
    idempotencyKey,
  );

const reply = (
  actor: UserActor,
  questionId: string,
  body = "Ja, fire meter.",
) => run(replyToObjectQuestion, actor, { questionId, body });

const list = (actor: UserActor, environmentId: string, objectId: string) =>
  executeQuery(tick(), listObjectQuestions, {
    actor,
    input: { environmentId, objectId },
  });

const read = (actor: UserActor, questionId: string) =>
  executeQuery(tick(), readObjectQuestion, {
    actor,
    input: { questionId },
  });

const question = (id: string) => ({ type: "object_question", id });

describe("asking and answering (PS-OBJ-015)", () => {
  it("lets a member ask, tells the owner, and tells the asker the answer", async () => {
    const { environmentId, owner, borrower, objectId, publicationId } =
      await published();

    const { questionId } = await ask(borrower, environmentId, objectId);
    expect(await told(owner)).toEqual([
      {
        kind: "object.question_asked",
        level: "action",
        target: question(questionId),
      },
    ]);
    expect(await told(borrower)).toEqual([]);

    await reply(owner, questionId);
    expect(await told(borrower)).toEqual([
      {
        kind: "object.question_replied",
        level: "information",
        target: question(questionId),
      },
    ]);
    expect(await told(owner)).toHaveLength(1);

    const { questions, nextCursor } = await list(
      borrower,
      environmentId,
      objectId,
    );
    expect(nextCursor).toBeNull();
    expect(questions).toEqual([
      {
        id: questionId,
        publicationId,
        environmentId,
        objectId,
        askedByUserId: borrower.userId,
        createdAt: expect.any(String),
        posts: [
          expect.objectContaining({
            authorUserId: borrower.userId,
            byOwner: false,
            body: "Er den lang nok til taket?",
          }),
          expect.objectContaining({
            authorUserId: owner.userId,
            byOwner: true,
            body: "Ja, fire meter.",
          }),
        ],
      },
    ]);
    expect(await read(owner, questionId)).toEqual(questions[0]);
  });

  it("lets other members join the discussion, and tells those already in it", async () => {
    const { admin, environmentId, owner, borrower, objectId } =
      await published();
    const third = await member(environmentId, admin);
    const { questionId } = await ask(borrower, environmentId, objectId);
    await reply(owner, questionId);
    await told(borrower);

    await reply(third, questionId, "Jeg lånte den i fjor, den holder.");
    expect(await told(borrower)).toHaveLength(2);
    expect(await told(owner)).toEqual([
      expect.objectContaining({ kind: "object.question_asked" }),
      expect.objectContaining({ kind: "object.question_replied" }),
    ]);
    // A member who only reads is told nothing.
    expect(await told(admin)).toEqual([]);
  });

  it("makes one question however often the same request is sent", async () => {
    const { environmentId, borrower, objectId } = await published();
    const key = randomUUID();

    const first = await ask(borrower, environmentId, objectId, "Hei?", key);
    const again = await ask(borrower, environmentId, objectId, "Hei?", key);

    expect(again).toEqual(first);
    expect(
      (await list(borrower, environmentId, objectId)).questions,
    ).toHaveLength(1);
  });

  it("refuses empty or overlong text", async () => {
    const { environmentId, borrower, objectId } = await published();

    for (const body of ["   ", "x".repeat(2001)]) {
      await expect(
        ask(borrower, environmentId, objectId, body),
      ).rejects.toMatchObject({ code: "invalid_input", fields: ["body"] });
    }
  });
});

describe("questions stay in their environment (PS-OBJ-015, PS-DOM-007)", () => {
  it("are not seen from another environment where the object is published", async () => {
    const { environmentId, owner, borrower, objectId } = await published();
    const otherAdmin = await user();
    const other = await environment(otherAdmin, { name: "Hagelaget" });
    await join(other, otherAdmin, owner);
    await run(publishObject, owner, { objectId, environmentId: other });
    const outsider = await member(other, otherAdmin);
    const { questionId } = await ask(borrower, environmentId, objectId);

    // The outsider finds the object in their own environment, with its own
    // questions: none.
    expect((await list(outsider, other, objectId)).questions).toEqual([]);
    expect((await list(owner, other, objectId)).questions).toEqual([]);
    await expect(read(outsider, questionId)).rejects.toMatchObject(notFound);
    await expect(reply(outsider, questionId)).rejects.toMatchObject(notFound);
    // Nor through the environment they are not a member of.
    await expect(list(outsider, environmentId, objectId)).rejects.toMatchObject(
      notFound,
    );
    await expect(ask(outsider, environmentId, objectId)).rejects.toMatchObject(
      notFound,
    );
  });

  it("tell only the owners who find the object in that environment", async () => {
    const { environmentId, owner, borrower, objectId } = await published();
    const coOwner = await user();
    await addCoOwner(owner, objectId, coOwner);

    const { questionId } = await ask(borrower, environmentId, objectId);

    expect(await told(owner)).toHaveLength(1);
    expect(await told(coOwner)).toEqual([]);
    await expect(read(coOwner, questionId)).rejects.toMatchObject(notFound);
  });

  it("stay hidden in a hidden environment", async () => {
    const admin = await user();
    const hidden = await environment(admin, {
      name: "Skjult",
      type: "hidden",
    });
    const owner = await member(hidden, admin);
    const asker = await member(hidden, admin);
    const objectId = await kit.create(owner);
    await run(publishObject, owner, { objectId, environmentId: hidden });
    const stranger = await user();
    const { questionId } = await ask(asker, hidden, objectId);

    await expect(list(stranger, hidden, objectId)).rejects.toMatchObject(
      notFound,
    );
    await expect(read(stranger, questionId)).rejects.toMatchObject(notFound);
    expect(await told(owner)).toHaveLength(1);
  });
});

describe("when the publication or access ends (PS-OBJ-015)", () => {
  it("disappear with the publication, and do not come back with a new one", async () => {
    const { environmentId, owner, borrower, objectId, publicationId } =
      await published();
    const { questionId } = await ask(borrower, environmentId, objectId);
    await reply(owner, questionId);

    await run(withdrawPublication, owner, { objectId, publicationId });
    await expect(list(borrower, environmentId, objectId)).rejects.toMatchObject(
      notFound,
    );
    await expect(read(borrower, questionId)).rejects.toMatchObject(notFound);
    await expect(read(owner, questionId)).rejects.toMatchObject(notFound);
    await expect(reply(borrower, questionId)).rejects.toMatchObject(notFound);

    // Published again: a fresh start, the old thread stays out of sight.
    await run(publishObject, owner, { objectId, environmentId });
    expect((await list(borrower, environmentId, objectId)).questions).toEqual(
      [],
    );
    await expect(read(borrower, questionId)).rejects.toMatchObject(notFound);
    // The rows are kept, not deleted (vision 04, «Offentlige spørsmål»).
    expect(
      await db
        .selectFrom("app.object_question_posts")
        .select("id")
        .where("question_id", "=", questionId)
        .execute(),
    ).toHaveLength(2);
  });

  it("are closed to a member who left, and do not tell them", async () => {
    const { admin, environmentId, owner, borrower, objectId } =
      await published();
    const third = await member(environmentId, admin);
    const { questionId } = await ask(borrower, environmentId, objectId);
    await reply(third, questionId, "Lurer på det samme.");
    await told(borrower);

    await run(leaveEnvironment, borrower, { environmentId });
    await expect(read(borrower, questionId)).rejects.toMatchObject(notFound);
    await expect(reply(borrower, questionId)).rejects.toMatchObject(notFound);

    await reply(owner, questionId);
    expect(await told(borrower)).toHaveLength(1);
    expect(await told(third)).toHaveLength(1);
    // What they asked stays for the others in the environment.
    expect((await read(third, questionId)).posts).toHaveLength(3);
  });

  it("go with the object when it is deleted", async () => {
    const { environmentId, owner, borrower, objectId } = await published();
    const { questionId } = await ask(borrower, environmentId, objectId);
    await reply(owner, questionId);

    await run(consentToObjectDeletion, owner, { objectId });

    expect(
      await db
        .selectFrom("app.object_questions")
        .select("id")
        .where("object_id", "=", objectId)
        .execute(),
    ).toEqual([]);
  });

  it("refuse a post that loses the race to the publication ending", async () => {
    const { environmentId, owner, borrower, objectId, publicationId } =
      await published();
    const { questionId } = await ask(borrower, environmentId, objectId);

    const [posted, withdrawn] = await Promise.allSettled([
      reply(owner, questionId),
      run(withdrawPublication, owner, { objectId, publicationId }),
    ]);
    const posts = await db
      .selectFrom("app.object_question_posts")
      .select("id")
      .where("question_id", "=", questionId)
      .execute();

    // Either the answer came first, or it was refused as if the question
    // were gone: never a post through an ended publication.
    expect(withdrawn.status).toBe("fulfilled");
    if (posted.status === "fulfilled") {
      expect(posts).toHaveLength(2);
    } else {
      expect(posted.reason).toMatchObject(notFound);
      expect(posts).toHaveLength(1);
    }
  });
});

describe("blocking (PS-USR-006)", () => {
  it("hides questions and posts between users who blocked each other, and tells nothing across", async () => {
    const { admin, environmentId, owner, borrower, objectId } =
      await published();
    const blocker = await member(environmentId, admin);
    const { questionId } = await ask(borrower, environmentId, objectId);
    await reply(blocker, questionId, "Samme spørsmål her.");
    await told(borrower);

    await run(blockUser, blocker, { userId: borrower.userId });

    // Neither sees the other's thread or posts.
    expect((await list(blocker, environmentId, objectId)).questions).toEqual(
      [],
    );
    await expect(read(blocker, questionId)).rejects.toMatchObject(notFound);
    await expect(reply(blocker, questionId)).rejects.toMatchObject(notFound);
    expect(
      (await read(borrower, questionId)).posts.map((post) => post.authorUserId),
    ).toEqual([borrower.userId]);

    // The owner's answer tells the asker, not the blocker who no longer
    // sees the thread.
    await reply(owner, questionId);
    expect(await told(borrower)).toHaveLength(2);
    expect(await told(blocker)).toEqual([]);
    // Others still see everything.
    expect((await read(admin, questionId)).posts).toHaveLength(3);
  });
});

describe("racing the end of access (PS-OBJ-015)", () => {
  it("tells nothing to an asker who loses access while the answer is told", async () => {
    const { environmentId, owner, borrower, objectId } = await published();
    const { questionId } = await ask(borrower, environmentId, objectId);
    await reply(owner, questionId);
    expect(await told(borrower)).toHaveLength(1);
    // The same answer told again under a new event: the generator itself,
    // not an outbox run, whose batch would hold other test files' events
    // while it waits.
    const event = {
      ...(await storedEvent(db, "object_question.replied", questionId)),
      id: randomUUID(),
    };

    const { changedAt } = await commitWhileRacing(
      db,
      endMembership(environmentId, borrower.userId, kit.now()),
      () => generator.handle({ messageId: randomUUID(), attempt: 1, event }),
    );

    expect(await notifiedSince(db, borrower.userId, changedAt)).toEqual([]);
  });

  it("leaves nothing to deliver once the recipient no longer sees the question", async () => {
    const { environmentId, owner, borrower, objectId } = await published();
    const { questionId } = await ask(borrower, environmentId, objectId);
    await reply(owner, questionId);
    const [answered] = await told(borrower);
    const concerns = () =>
      stillConcerns(
        db,
        { recipientId: borrower.userId, target: answered!.target },
        kit.now(),
      );
    expect(await concerns()).toBe(true);

    await run(leaveEnvironment, borrower, { environmentId });

    expect(await concerns()).toBe(false);
  });
});
