import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { type AccountStatus, type UserActor } from "../actor";
import { executeQuery } from "../commands/query";
import { joinEnvironment } from "../environment/membership-commands";
import { approveLoanRequest } from "../loans/approval";
import { cancelLoan } from "../loans/cancellation";
import { inviteCoOwner } from "../objects/co-owners";
import type { StoredEvent } from "../outbox/consumer";
import { blockUser, sendFriendRequest } from "../social/commands";
import { connectTestDatabase } from "../testing/database";
import { registerTestUser, testIdentity } from "../testing/identities";
import { loanTestKit } from "../testing/loans";
import type { AccountBindingSource } from "./bindings";
import {
  accountDeletionSteps,
  accountIdentityRemoval,
  completeAccountClosure,
  defineAccountDeletion,
  deleteOwnAccount,
  getAccountDeletionCheck,
} from "./deletion";
import { resolveUserActor } from "./identity";
import { deactivateAccount, startAccountClosure } from "./lifecycle";

/**
 * WP-53 (PS-ADM-004–006): deletion waits for the account's bindings, then
 * removes its profile, relations and personal data, and keeps shared
 * history with only an internal id behind it.
 */
const db = connectTestDatabase();
afterAll(() => db.destroy());

const kit = loanTestKit(db);
const {
  run,
  user,
  create,
  addCoOwner,
  friends,
  ask,
  environment,
  reservedLoan,
  stored,
  eventsFor,
} = kit;

/** The actor as the next request sees them, just after proving identity. */
async function confirmed(actor: UserActor): Promise<UserActor> {
  const { status } = await db
    .selectFrom("app.users")
    .select("status")
    .where("id", "=", actor.userId)
    .executeTakeFirstOrThrow();

  return {
    ...actor,
    accountStatus: status as AccountStatus,
    authentication: {
      ...actor.authentication,
      methods: [{ method: "otp", at: kit.now() }],
    },
  };
}

const remove = async (actor: UserActor) =>
  run(deleteOwnAccount, await confirmed(actor), {});

const check = async (actor: UserActor) =>
  executeQuery(kit.tick(), getAccountDeletionCheck, {
    actor: await confirmed(actor),
    input: {},
  });

const statusOf = async (userId: string) =>
  (
    await db
      .selectFrom("app.users")
      .select("status")
      .where("id", "=", userId)
      .executeTakeFirstOrThrow()
  ).status;

const rowsOf = (
  table:
    | "app.profiles"
    | "app.verified_contacts"
    | "app.auth_identities"
    | "app.object_owners",
  userId: string,
) =>
  db
    .selectFrom(table)
    .select("user_id")
    .where("user_id", "=", userId)
    .execute();

/**
 * A steward whose session has the stronger authentication the role needs;
 * no real session gets it until OD-0010 is decided.
 */
async function steward(): Promise<UserActor> {
  const actor = await user();
  await db
    .insertInto("app.platform_role_grants")
    .values({
      user_id: actor.userId,
      role: "platform_steward",
      granted_at: new Date(),
      granted_by_process: "ops.platform_roles",
      grant_reason: "Test",
    })
    .execute();

  return {
    ...actor,
    platformRoles: ["platform_steward"],
    authentication: { ...actor.authentication, assurance: "aal2" },
  };
}

describe("bindings (PS-ADM-004)", () => {
  it("refuses deletion while a loan or an environment needs the account", async () => {
    const { owner, borrower, loanId, environmentId, admin } =
      await reservedLoan();

    expect(await check(borrower)).toEqual({
      bindings: [{ kind: "loan", resourceId: loanId }],
    });
    expect(await check(owner)).toEqual({
      bindings: [{ kind: "loan", resourceId: loanId }],
    });
    expect(await check(admin)).toEqual({
      bindings: [{ kind: "environment_ownership", resourceId: environmentId }],
    });
    for (const actor of [borrower, owner, admin]) {
      await expect(remove(actor)).rejects.toMatchObject({ code: "conflict" });
      expect(await statusOf(actor.userId)).toBe("active");
    }

    // An ended loan no longer binds anybody.
    await run(cancelLoan, borrower, { loanId });
    expect(await check(borrower)).toEqual({ bindings: [] });
    await remove(borrower);
    expect(await statusOf(borrower.userId)).toBe("deleted");
  });

  it("lets an owner who deactivated first go: the environment continues without them", async () => {
    const owner = await user();
    const environmentId = await environment(owner);

    await run(deactivateAccount, owner, {});
    expect(await check(owner)).toEqual({ bindings: [] });
    await remove(owner);

    expect(
      await db
        .selectFrom("app.environment_wind_downs")
        .select("reason")
        .where("environment_id", "=", environmentId)
        .executeTakeFirst(),
    ).toEqual({ reason: "ownerless" });
  });

  it("deletes nothing when a binding source cannot answer", async () => {
    const actor = await user();
    const failing: AccountBindingSource = {
      name: "failing",
      load: () => Promise.reject(new Error("unavailable")),
    };
    const { deleteOwnAccount: guarded } = defineAccountDeletion(
      accountDeletionSteps,
      [failing],
    );

    await expect(run(guarded, await confirmed(actor), {})).rejects.toThrow(
      "unavailable",
    );
    expect(await statusOf(actor.userId)).toBe("active");
    expect(await rowsOf("app.profiles", actor.userId)).toHaveLength(1);
  });
});

describe("deleting an account (PS-ADM-005–006)", () => {
  it("removes identity, relations and personal data, and keeps shared history", async () => {
    const { identity, actor: leaving } = await registerTestUser(kit.domain);
    const friend = await user();
    const other = await user();
    const coOwner = await user();
    await friends(leaving, friend);
    await run(sendFriendRequest, leaving, { userId: other.userId });
    await run(blockUser, other, { userId: leaving.userId });

    // Objects: one alone, one shared, and an invitation to share a third.
    const alone = await create(leaving);
    const shared = await create(leaving);
    await addCoOwner(leaving, shared, coOwner);
    const { invitationId } = await run(inviteCoOwner, friend, {
      objectId: await create(friend),
      userId: leaving.userId,
    });

    // A membership with an answer to the environment's question.
    const admin = await user();
    const environmentId = await environment(admin, {
      requirements: [{ kind: "information", text: "Hvilken leilighet?" }],
    });
    const requirement = await db
      .selectFrom("app.environment_requirements")
      .select("id")
      .where("environment_id", "=", environmentId)
      .executeTakeFirstOrThrow();
    await run(joinEnvironment, leaving, {
      environmentId,
      answers: [{ requirementId: requirement.id, answer: "H0101" }],
    });

    // A finished loan as borrower: shared history with the lender.
    const lender = await user();
    await friends(leaving, lender);
    const { requestId } = await ask(leaving, await create(lender), {
      kind: "direct",
    });

    await remove(leaving);

    expect(await statusOf(leaving.userId)).toBe("deleted");
    // Signing in with the identity finds nobody, and creates nobody.
    expect(await resolveUserActor(kit.domain, identity)).toBeNull();
    expect(await rowsOf("app.profiles", leaving.userId)).toEqual([]);
    expect(await rowsOf("app.verified_contacts", leaving.userId)).toEqual([]);
    expect(
      await db
        .selectFrom("app.idempotency_records")
        .select("scope")
        .where("scope", "=", `user:${leaving.userId}`)
        .execute(),
    ).toEqual([]);

    // The object it owned alone is gone; the shared one stays with the
    // other owner.
    expect(
      await db
        .selectFrom("app.objects")
        .select("id")
        .where("id", "in", [alone, shared])
        .execute(),
    ).toEqual([{ id: shared }]);
    expect(await rowsOf("app.object_owners", leaving.userId)).toEqual([]);
    expect(
      await db
        .selectFrom("app.object_co_owner_invitations")
        .select("status")
        .where("id", "=", invitationId)
        .executeTakeFirstOrThrow(),
    ).toEqual({ status: "closed" });

    // Relations end (the request the other user blocked had ended
    // already); their block stays theirs.
    const relations = await db
      .selectFrom("app.friendships")
      .select(["status", "end_reason"])
      .where((eb) =>
        eb.or([
          eb("requester_id", "=", leaving.userId),
          eb("addressee_id", "=", leaving.userId),
        ]),
      )
      .orderBy("end_reason")
      .execute();
    expect(relations).toEqual([
      { status: "ended", end_reason: "account_deleted" },
      { status: "ended", end_reason: "account_deleted" },
      { status: "ended", end_reason: "blocked" },
    ]);
    expect(
      await db
        .selectFrom("app.user_blocks")
        .select("lifted_at")
        .where("blocked_id", "=", leaving.userId)
        .execute(),
    ).toEqual([{ lifted_at: null }]);

    const memberships = await db
      .selectFrom("app.environment_memberships")
      .select(["id", "state", "end_reason"])
      .where("user_id", "=", leaving.userId)
      .execute();
    expect(memberships).toMatchObject([
      { state: "ended", end_reason: "account_deleted" },
    ]);
    expect(
      await db
        .selectFrom("app.environment_membership_answers")
        .select("membership_id")
        .where("membership_id", "=", memberships[0]!.id)
        .execute(),
    ).toEqual([]);

    // Shared history keeps its reference, without a name behind it.
    expect(await stored(requestId)).toMatchObject({
      status: "ended",
      end_reason: "access_lost",
    });
    expect(await eventsFor("user", leaving.userId)).toContainEqual({
      event_type: "account.deleted",
      payload: { from: "active" },
    });
  });

  it("asks for the identity to be proven again just before", async () => {
    const actor = await user();
    const stale = {
      ...actor,
      authentication: {
        ...actor.authentication,
        methods: [
          { method: "otp", at: new Date(kit.now().getTime() - 3_600_000) },
        ],
      },
    };

    await expect(run(deleteOwnAccount, stale, {})).rejects.toMatchObject({
      code: "reauthentication_required",
    });
    expect(await statusOf(actor.userId)).toBe("active");
  });

  it("is a steward's to complete for an account under closure (PS-ADM-014)", async () => {
    const platform = await steward();
    const target = await user();
    const basis = "Kontrollert avslutning etter henvendelse";

    await run(startAccountClosure, platform, { userId: target.userId, basis });
    await expect(remove(target)).rejects.toMatchObject({ code: "forbidden" });
    await run(completeAccountClosure, platform, {
      userId: target.userId,
      basis,
    });

    expect(await statusOf(target.userId)).toBe("deleted");
    expect(
      await db
        .selectFrom("app.account_status_changes")
        .select(["to_status", "reason", "changed_by_user_id"])
        .where("user_id", "=", target.userId)
        .orderBy("position")
        .execute(),
    ).toEqual([
      {
        to_status: "closing",
        reason: "platform",
        changed_by_user_id: platform.userId,
      },
      {
        to_status: "deleted",
        reason: "platform",
        changed_by_user_id: platform.userId,
      },
    ]);
  });

  it("refuses a second deletion", async () => {
    const actor = await user();
    await remove(actor);

    // A session that still got through (resolving it finds nobody).
    await expect(remove(actor)).rejects.toMatchObject({
      code: "account_inactive",
    });
  });
});

describe("removing the sign-in identity (PS-ADM-006)", () => {
  const deletedEvent = async (userId: string): Promise<StoredEvent> => {
    const row = await db
      .selectFrom("app.audit_events")
      .selectAll()
      .where("resource_id", "=", userId)
      .where("event_type", "=", "account.deleted")
      .executeTakeFirstOrThrow();

    return {
      id: row.id,
      type: row.event_type,
      version: row.event_version,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      correlationId: row.correlation_id,
      occurredAt: row.occurred_at,
      payload: row.payload,
    };
  };

  it("removes the identity at the provider first, then the link, and repeats harmlessly", async () => {
    const identity = testIdentity();
    const { actor } = await registerTestUser(kit.domain, identity);
    const removed: string[] = [];
    const consumer = accountIdentityRemoval({
      identities: () => ({
        deleteIdentity: async (subject) => {
          // The link is still there while the provider is asked.
          expect(
            await rowsOf("app.auth_identities", actor.userId),
          ).toHaveLength(1);
          removed.push(subject);
        },
      }),
      domain: () => kit.domain,
    });

    await remove(actor);
    const event = await deletedEvent(actor.userId);
    const delivery = { messageId: randomUUID(), attempt: 1, event };
    await consumer.handle(delivery);
    await consumer.handle({ ...delivery, attempt: 2 });

    expect(removed).toEqual([identity.subject]);
    expect(await rowsOf("app.auth_identities", actor.userId)).toEqual([]);

    // The address can start over as a new, empty account.
    const again = await resolveUserActor(kit.domain, {
      ...testIdentity({ email: identity.email }),
    });
    expect(again).toMatchObject({ accountStatus: "pending_registration" });
    expect(again?.userId).not.toBe(actor.userId);
  });

  it("keeps the link and retries while the provider cannot be reached", async () => {
    const { actor } = await registerTestUser(kit.domain);
    const consumer = accountIdentityRemoval({
      identities: () => undefined,
      domain: () => kit.domain,
    });

    await remove(actor);
    await expect(
      consumer.handle({
        messageId: randomUUID(),
        attempt: 1,
        event: await deletedEvent(actor.userId),
      }),
    ).rejects.toMatchObject({ code: "identity_provider_unavailable" });
    expect(await rowsOf("app.auth_identities", actor.userId)).toHaveLength(1);
  });

  it("never releases the identity of an account that is not deleted", async () => {
    const { actor } = await registerTestUser(kit.domain);
    const consumer = accountIdentityRemoval({
      identities: () => ({ deleteIdentity: async () => {} }),
      domain: () => kit.domain,
    });

    await expect(
      consumer.handle({
        messageId: randomUUID(),
        attempt: 1,
        event: {
          id: randomUUID(),
          type: "account.deleted",
          version: 1,
          resourceType: "user",
          resourceId: actor.userId,
          correlationId: null,
          occurredAt: new Date(),
          payload: { from: "active" },
        },
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(await rowsOf("app.auth_identities", actor.userId)).toHaveLength(1);
  });
});

describe("races", () => {
  it("never opens a request for the object of an account being deleted", async () => {
    for (let round = 0; round < 5; round++) {
      const owner = await user();
      const borrower = await user();
      await friends(borrower, owner);
      const objectId = await create(owner);

      await Promise.allSettled([
        ask(borrower, objectId, { kind: "direct" }),
        remove(owner),
      ]);

      expect(await statusOf(owner.userId)).toBe("deleted");
      expect(
        await db
          .selectFrom("app.loan_requests")
          .select("id")
          .where("borrower_user_id", "=", borrower.userId)
          .where("status", "<>", "ended")
          .execute(),
      ).toEqual([]);
    }
  });

  it("never deletes an account while a loan is approved for it meanwhile", async () => {
    for (let round = 0; round < 5; round++) {
      const setup = await kit.published();
      const { requestId } = await ask(
        setup.borrower,
        setup.objectId,
        kit.environmentOrigin(setup.environmentId),
      );

      await Promise.allSettled([
        run(approveLoanRequest, setup.owner, { requestId }),
        remove(setup.borrower),
      ]);

      const loans = await db
        .selectFrom("app.loans")
        .select("id")
        .where("request_id", "=", requestId)
        .execute();
      // Either the loan came first and keeps the account, or the account
      // went first and nothing was approved.
      expect(await statusOf(setup.borrower.userId)).toBe(
        loans.length === 1 ? "active" : "deleted",
      );
    }
  });
});
