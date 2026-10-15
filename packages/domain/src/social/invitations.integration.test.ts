import { randomUUID } from "node:crypto";
import { MemoryEmailSender } from "@lanbort/email/testing";
import { afterAll, describe, expect, it } from "vitest";
import type { UserActor } from "../actor";
import { systemActor } from "../actor";
import { type DomainContext, executeCommand } from "../commands/command";
import { executeQuery } from "../commands/query";
import type { StoredEvent } from "../outbox/consumer";
import { ConsumerRegistry } from "../outbox/consumer";
import { readPerson } from "../people/queries";
import { connectTestDatabase } from "../testing/database";
import { registerTestUser, testIdentity } from "../testing/identities";
import { createFriendCode, readFriendCode, requestFriendByCode } from "./codes";
import {
  acceptFriendRequest,
  blockUser,
  declineFriendRequest,
  sendFriendRequest,
} from "./commands";
import {
  friendInvitationDelivery,
  friendInvitationIdentityRemoval,
} from "./invitation-delivery";
import {
  expireFriendInvitations,
  listFriendInvitations,
  sendFriendInvitation,
  withdrawFriendInvitation,
} from "./invitations";
import { friendInvitationExpiryProcess } from "./policies";
import { getSocialOverview, getSocialRelation } from "./queries";

const db = connectTestDatabase();
afterAll(() => db.destroy());

const day = 24 * 60 * 60 * 1000;

/** A domain whose clock is `offsetMs` from now, and who may invite. */
function domainAt(
  offsetMs = 0,
  inviters: readonly string[] = [],
): DomainContext {
  return {
    db,
    consumers: new ConsumerRegistry(),
    clock: () => new Date(Date.now() + offsetMs),
    accountInviters: new Set(inviters),
  };
}

const domain = domainAt();

const address = () => `${randomUUID()}@example.test`;

async function user(email = address()): Promise<UserActor> {
  return (await registerTestUser(domain, testIdentity({ email }))).actor;
}

const invite = (
  actor: UserActor,
  email: string,
  befriend = true,
  at: DomainContext = domain,
) =>
  executeCommand(at, sendFriendInvitation, {
    actor,
    input: { email, befriend },
    idempotencyKey: randomUUID(),
  });

const invitations = async (actor: UserActor) =>
  (await executeQuery(domain, listFriendInvitations, { actor, input: {} }))
    .invitations;

const overview = (actor: UserActor) =>
  executeQuery(domain, getSocialOverview, { actor, input: {} });

const relation = (actor: UserActor, other: UserActor) =>
  executeQuery(domain, getSocialRelation, {
    actor,
    input: { userId: other.userId },
  });

const pair = (
  command: typeof sendFriendRequest,
  actor: UserActor,
  other: UserActor,
) =>
  executeCommand(domain, command, {
    actor,
    input: { userId: other.userId },
    idempotencyKey: randomUUID(),
  });

const incoming = async (actor: UserActor) =>
  (await overview(actor)).incomingRequests.map((contact) => contact.userId);

/** The `friend_invitation.sent` event, as the outbox delivers it. */
function sentEvent(invitationId: string, type = "friend_invitation.sent") {
  return {
    messageId: randomUUID(),
    attempt: 1,
    event: {
      id: randomUUID(),
      type,
      version: 1,
      resourceType: "friend_invitation",
      resourceId: invitationId,
      actorUserId: null,
      correlationId: null,
      occurredAt: new Date(),
      payload: {},
    } satisfies StoredEvent,
  };
}

/** A provider that records what it is asked, as the auth adapter would. */
function fakeProvider(existing: readonly string[] = []) {
  const created = new Map<string, string>();
  const deleted: string[] = [];

  return {
    created,
    deleted,
    admin: {
      inviteIdentity: async (email: string) => {
        if (existing.includes(email) || created.has(email)) return null;
        const subject = randomUUID();
        created.set(email, subject);
        return subject;
      },
      deleteIdentity: async (subject: string) => {
        deleted.push(subject);
      },
    },
  };
}

describe("friend requests by e-mail address (PS-USR-013)", () => {
  it("asks an existing account at once, hidden from the sender until accepted", async () => {
    const [anna, boEmail] = [await user(), address()];
    const bo = await user(boEmail);

    const { output } = await invite(anna, boEmail.toUpperCase());

    expect(output).toEqual({
      id: expect.any(String),
      email: boEmail,
      befriend: true,
      sentAt: expect.any(String),
      expiresAt: expect.any(String),
    });
    expect(await incoming(bo)).toEqual([anna.userId]);
    // The sender sees the invitation, never the account behind it.
    expect(await invitations(anna)).toEqual([output]);
    expect((await overview(anna)).outgoingRequests).toEqual([]);
    expect(await relation(anna, bo)).toMatchObject({
      friendship: "none",
      canRequest: true,
    });
    // Nor does the request open the recipient's page to the sender.
    await expect(
      executeQuery(domain, readPerson, {
        actor: anna,
        input: { userId: bo.userId },
      }),
    ).rejects.toMatchObject({ code: "not_found" });

    await pair(acceptFriendRequest, bo, anna);

    expect(await invitations(anna)).toEqual([]);
    expect((await overview(anna)).friends.map((f) => f.userId)).toEqual([
      bo.userId,
    ]);
  });

  it("answers the same whether the address has an account or not", async () => {
    const anna = await user();
    const known = address();
    await user(known);

    const toAccount = (await invite(anna, known)).output;
    const toNobody = (await invite(anna, address())).output;
    const shape = (invitation: typeof toAccount) =>
      Object.keys(invitation).sort();

    expect(shape(toAccount)).toEqual(shape(toNobody));
    expect(await invitations(anna)).toHaveLength(2);
  });

  it("shows the hidden request when the sender asks again in the app", async () => {
    const boEmail = address();
    const [anna, bo] = [await user(), await user(boEmail)];

    await invite(anna, boEmail);
    expect((await pair(sendFriendRequest, anna, bo)).output).toMatchObject({
      friendship: "outgoing_pending",
    });
    expect(await incoming(bo)).toEqual([anna.userId]);
  });

  it("keeps a declined or blocked invitation looking the same to its sender", async () => {
    const [boEmail, coEmail] = [address(), address()];
    const [anna, bo, co] = [
      await user(),
      await user(boEmail),
      await user(coEmail),
    ];

    const declined = (await invite(anna, boEmail)).output;
    await pair(declineFriendRequest, bo, anna);
    await pair(blockUser, co, anna);
    const blocked = (await invite(anna, coEmail)).output;

    expect(await incoming(co)).toEqual([]);
    expect(await invitations(anna)).toEqual([blocked, declined]);
    // PS-USR-012 holds whichever way the request was sent.
    await expect(pair(sendFriendRequest, anna, bo)).rejects.toMatchObject({
      code: "forbidden",
    });
    await executeCommand(domain, withdrawFriendInvitation, {
      actor: anna,
      input: { invitationId: declined.id },
      idempotencyKey: randomUUID(),
    });
    await invite(anna, boEmail);
    expect(await incoming(bo)).toEqual([]);
  });

  it("does not repeat an open invitation, and replaces one that changes", async () => {
    const boEmail = address();
    const [anna, bo] = [await user(), await user(boEmail)];

    const first = (await invite(anna, boEmail, false)).output;
    expect((await invite(anna, boEmail, false)).output).toEqual(first);
    expect(await incoming(bo)).toEqual([]);

    const second = (await invite(anna, boEmail, true)).output;
    expect(second.id).not.toBe(first.id);
    expect(await invitations(anna)).toEqual([second]);
    expect(await incoming(bo)).toEqual([anna.userId]);
  });

  it("lets only the sender withdraw, which ends a request that still waits", async () => {
    const boEmail = address();
    const [anna, bo, eve] = [await user(), await user(boEmail), await user()];
    const { output } = await invite(anna, boEmail);
    const withdraw = (actor: UserActor) =>
      executeCommand(domain, withdrawFriendInvitation, {
        actor,
        input: { invitationId: output.id },
        idempotencyKey: randomUUID(),
      });

    await expect(withdraw(eve)).rejects.toMatchObject({ code: "not_found" });
    await withdraw(anna);
    await withdraw(anna);

    expect(await invitations(anna)).toEqual([]);
    expect(await incoming(bo)).toEqual([]);
    // A withdrawn request holds nothing back.
    expect((await pair(sendFriendRequest, anna, bo)).output).toMatchObject({
      friendship: "outgoing_pending",
    });
  });

  it("asks a new participant once they have registered with the address", async () => {
    const [anna, coEmail] = [await user(), address()];

    await invite(anna, coEmail);
    await invite(await user(), coEmail, false);
    const co = await user(coEmail);

    expect(await incoming(co)).toEqual([anna.userId]);
    expect(await invitations(anna)).toHaveLength(1);
  });

  it("ends expired invitations with the requests that still wait", async () => {
    const boEmail = address();
    const [anna, bo] = [await user(), await user(boEmail)];
    const past = domainAt(-20 * day);
    const { output } = await invite(anna, boEmail, true, past);
    const later = address();
    await invite(anna, later, true, past);

    // Expired ones are gone from the list before the job has run.
    expect(await invitations(anna)).toEqual([]);
    await expect(
      executeCommand(domain, expireFriendInvitations, {
        actor: anna,
        input: {},
      }),
    ).rejects.toMatchObject({ code: "forbidden" });

    const run = () =>
      executeCommand(domain, expireFriendInvitations, {
        actor: systemActor(friendInvitationExpiryProcess),
        input: {},
      });
    expect((await run()).output.invitations).toBeGreaterThanOrEqual(2);
    expect(await incoming(bo)).toEqual([]);

    // Registering after the invitation expired asks nothing.
    expect(await incoming(await user(later))).toEqual([]);
    const ended = await db
      .selectFrom("app.friend_invitations")
      .select("end_reason")
      .where("id", "=", output.id)
      .executeTakeFirstOrThrow();
    expect(ended.end_reason).toBe("expired");
  });
});

describe("inviting new participants (PS-USR-015)", () => {
  it("lets in and tells only addresses without an account, and only from an inviter", async () => {
    const anna = await user();
    const known = address();
    await user(known);
    const sender = new MemoryEmailSender();
    const provider = fakeProvider();
    const deliver = (inviters: readonly string[]) =>
      friendInvitationDelivery({
        domain: () => domainAt(0, inviters),
        identities: () => provider.admin,
        emails: () => ({ sender, appUrl: "https://lanbort.test" }),
      });
    const fresh = address();

    const newcomer = (await invite(anna, fresh)).output;
    const existing = (await invite(anna, known)).output;

    // Anyone else may ask existing accounts, but invites nobody.
    await deliver([]).handle(sentEvent(newcomer.id));
    expect(provider.created.size).toBe(0);

    const delivery = sentEvent(newcomer.id);
    await deliver([anna.userId]).handle(delivery);
    await deliver([anna.userId]).handle({ ...delivery, attempt: 2 });
    await deliver([anna.userId]).handle(sentEvent(existing.id));

    expect([...provider.created.keys()]).toEqual([fresh]);
    expect(sender.sent).toHaveLength(1);
    expect(sender.to(fresh)[0]).toMatchObject({
      subject: "Test Testesen inviterer deg til Lånbort",
      idempotencyKey: delivery.messageId,
    });
    expect(sender.to(fresh)[0]!.text).toContain(
      "https://lanbort.test/logg-inn",
    );
    expect(sender.to(fresh)[0]!.text).toContain("vil også bli venner");
  });

  it("removes the sign-in identity of an invitation that ends unused", async () => {
    const anna = await user();
    const sender = new MemoryEmailSender();
    const provider = fakeProvider();
    const services = {
      domain: () => domainAt(0, [anna.userId]),
      identities: () => provider.admin,
      emails: () => ({ sender, appUrl: "https://lanbort.test" }),
    };
    const unused = address();
    const used = address();

    const withdraw = async (email: string) => {
      const { output } = await invite(anna, email);
      await friendInvitationDelivery(services).handle(sentEvent(output.id));
      return output;
    };
    const first = await withdraw(unused);
    const second = await withdraw(used);
    // The second address signs in with the identity it was given.
    await registerTestUser(
      domain,
      testIdentity({ email: used, subject: provider.created.get(used)! }),
    );

    for (const invitation of [first, second]) {
      await executeCommand(domain, withdrawFriendInvitation, {
        actor: anna,
        input: { invitationId: invitation.id },
        idempotencyKey: randomUUID(),
      });
      await friendInvitationIdentityRemoval(services).handle(
        sentEvent(invitation.id, "friend_invitation.withdrawn"),
      );
    }

    expect(provider.deleted).toEqual([provider.created.get(unused)]);
  });
});

describe("friend codes (PS-USR-014)", () => {
  const code = (actor: UserActor) =>
    executeCommand(domain, createFriendCode, { actor, input: {} });

  it("shows the name and sends an ordinary request, never an id", async () => {
    const [anna, bo] = [await user(), await user()];
    const { output } = await code(anna);

    expect(output.code).toMatch(/^[0-9A-HJKMNP-TV-Z]{10}$/);
    const typed = `${output.code.slice(0, 5).toLowerCase()}-${output.code.slice(5)}`;
    expect(
      await executeQuery(domain, readFriendCode, {
        actor: bo,
        input: { code: typed },
      }),
    ).toEqual({
      realName: "Test Testesen",
      friendship: "none",
      blockedByMe: false,
      canRequest: true,
    });

    const request = await executeCommand(domain, requestFriendByCode, {
      actor: bo,
      input: { code: output.code },
      idempotencyKey: randomUUID(),
    });
    expect(request.output).toMatchObject({ friendship: "outgoing_pending" });
    expect(await incoming(anna)).toEqual([bo.userId]);
  });

  it("knows nothing of a replaced, expired, own or blocking person's code", async () => {
    const [anna, bo, co] = [await user(), await user(), await user()];
    const read = (actor: UserActor, value: string, at = domain) =>
      executeQuery(at, readFriendCode, { actor, input: { code: value } });

    const replaced = (await code(anna)).output.code;
    const current = (await code(anna)).output.code;
    await pair(blockUser, anna, co);

    for (const [actor, value, at] of [
      [bo, replaced, domain],
      [bo, current, domainAt(6 * 60 * 1000)],
      [anna, current, domain],
      [co, current, domain],
    ] as const) {
      await expect(read(actor, value, at)).rejects.toMatchObject({
        code: "not_found",
      });
    }
    await expect(
      executeCommand(domain, requestFriendByCode, {
        actor: co,
        input: { code: current },
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});
