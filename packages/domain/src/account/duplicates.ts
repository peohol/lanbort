import {
  type AccountIdentityFinding,
  type AccountIdentityRecord,
  accountIdentityRecordSchema,
  accountInterventionSchema,
  type AccountLinkKind,
  accountLifecycleResultSchema,
  accountRecordResultSchema,
  linkSamePersonSchema,
  moveDuplicateObjectResultSchema,
  moveDuplicateObjectSchema,
  retireDuplicateAccountSchema,
} from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import type { Kysely, Transaction } from "kysely";
import { z } from "zod";
import type { AccountStatus, Actor } from "../actor";
import { defineCommand } from "../commands/command";
import { defineQuery } from "../commands/query";
import { DomainError } from "../errors";
import { removeOwner } from "../objects/co-owners";
import {
  loadCommitments,
  type ObjectCommitmentSource,
  objectCommitmentSources,
} from "../objects/commitments";
import { loadObjectState } from "../objects/state";
import { blockedWithAny, lockPairsWith } from "../social/pair";
import {
  accountFalseIdentityRecorded,
  accountRetiredAsDuplicate,
  accountsLinkedAsSamePerson,
  objectMovedFromDuplicate,
} from "./events";
import { changeAccountStatus } from "./lifecycle";
import {
  type AccountRecordResource,
  type AccountResource,
  type DuplicateObjectResource,
  linkSamePersonPolicy,
  moveDuplicateObjectPolicy,
  readAccountIdentityRecordPolicy,
  recordFalseIdentityPolicy,
  retireDuplicateAccountPolicy,
} from "./policies";
import { lockAccounts } from "./store";

/**
 * WP-55 (PS-ADM-009–010): duplicate accounts and false identity. Two
 * accounts of one person are never merged, and a false identity rewrites no
 * history. What the platform keeps is an internal record (`app.account_links`,
 * `app.account_identity_findings`), written by a steward and read only by
 * one; nothing here moves friendships, memberships, roles, reviews or trust
 * between accounts, and nothing else reads the record.
 */

type Db = Kysely<Database>;

function conflict(message: string, fields?: readonly string[]): never {
  throw new DomainError("conflict", message, fields);
}

function actingStewardId(actor: Actor): string {
  if (actor.kind !== "user") {
    throw new Error("Steward commands require a user actor");
  }

  return actor.userId;
}

/**
 * The retired account locked for its change of state and the continuing one
 * for share, in id order so two retirements of the same pair in opposite
 * directions wait for each other instead of deadlocking.
 */
async function loadDuplicatePair(
  tx: Transaction<Database>,
  retiredId: string,
  continuedId: string,
) {
  const locked = new Map<string, AccountResource>();

  for (const id of [retiredId, continuedId].sort()) {
    const query = tx
      .selectFrom("app.users")
      .select(["id", "status"])
      .where("id", "=", id);
    const row = await (
      id === retiredId ? query.forNoKeyUpdate() : query.forShare()
    ).executeTakeFirst();

    if (row) {
      locked.set(id, { userId: row.id, status: row.status as AccountStatus });
    }
  }

  const retired = locked.get(retiredId);
  const continued = locked.get(continuedId);

  return retired && continued
    ? { resource: { retired, continued }, context: undefined }
    : null;
}

/**
 * PS-ADM-009, PS-ADM-014: a steward who has verified that two accounts
 * belong to the same person, and that neither is a way around a suspension,
 * retires one as a duplicate of the other, in one transaction:
 * - the retired account goes under controlled closure (WP-53), unless it
 *   already is: new activity stops, its own requests end, and its loans and
 *   other bindings are finished with minimum access by the ordinary rules;
 * - the link is recorded with the basis, which stays there.
 * The continuing account gets nothing of the retired one's history,
 * friendships, memberships, roles, reviews or trust. Its own objects can be
 * moved afterwards ({@link moveDuplicateObject}). Retiring it again into the
 * same account starts a closure that was ended meanwhile; into another
 * account, it is refused.
 */
export const retireDuplicateAccount = defineCommand({
  name: "account.retire_duplicate",
  input: retireDuplicateAccountSchema,
  output: accountLifecycleResultSchema,
  policy: retireDuplicateAccountPolicy,
  idempotency: "required",
  load: ({ tx, input }) =>
    loadDuplicatePair(tx, input.userId, input.continuedUserId),
  execute: async ({ tx, actor, input, resource, events, now }) => {
    const { retired, continued } = resource;
    const existing = await tx
      .selectFrom("app.account_links")
      .select("linked_user_id")
      .where("kind", "=", "duplicate")
      .where("user_id", "=", retired.userId)
      .executeTakeFirst();

    if (existing && existing.linked_user_id !== continued.userId) {
      conflict("Already retired as a duplicate of another account", [
        "continuedUserId",
      ]);
    }

    const result =
      retired.status === "closing"
        ? { userId: retired.userId, status: retired.status }
        : await changeAccountStatus(
            tx,
            {
              account: retired,
              to: "closing",
              reason: "platform",
              actor,
              basis: input.basis,
            },
            events,
            now,
          );

    if (!existing) {
      await tx
        .insertInto("app.account_links")
        .values({
          kind: "duplicate",
          user_id: retired.userId,
          linked_user_id: continued.userId,
          basis: input.basis,
          recorded_by_user_id: actingStewardId(actor),
          recorded_at: now,
        })
        .execute();
      events.record(accountRetiredAsDuplicate, {
        resourceId: retired.userId,
        payload: { continuedUserId: continued.userId },
      });
    }

    return result;
  },
});

/** The accounts a record concerns; null unless every one exists. */
async function loadRecordAccounts(
  db: Db,
  userId: string,
  others: readonly string[],
): Promise<{ resource: AccountRecordResource; context: undefined } | null> {
  const ids = [...new Set([userId, ...others])];
  const rows = await db
    .selectFrom("app.users")
    .select(["id", "status"])
    .where("id", "in", ids)
    .execute();
  const target = rows.find((row) => row.id === userId);

  return target && rows.length === ids.length
    ? {
        resource: {
          userId,
          status: target.status as AccountStatus,
          involvedUserIds: ids,
        },
        context: undefined,
      }
    : null;
}

/**
 * PS-ADM-010: a steward links two accounts of the same person, so a later
 * account of a false identity, a way around a suspension or a repeated
 * misuse can be seen in security work. The link changes nothing else: the
 * accounts keep their own states, histories and social relations, and no
 * trust moves (vision 07, «Falsk identitet og historisk tillit»). Linking a
 * pair again returns the existing link.
 */
export const linkSamePerson = defineCommand({
  name: "account.link_same_person",
  input: linkSamePersonSchema,
  output: accountRecordResultSchema,
  policy: linkSamePersonPolicy,
  idempotency: "required",
  load: ({ tx, input }) =>
    loadRecordAccounts(tx, input.userId, [input.linkedUserId]),
  execute: async ({ tx, actor, input, events, now }) => {
    const [first, second] = [input.userId, input.linkedUserId].sort() as [
      string,
      string,
    ];
    const inserted = await tx
      .insertInto("app.account_links")
      .values({
        kind: "same_person",
        user_id: first,
        linked_user_id: second,
        basis: input.basis,
        recorded_by_user_id: actingStewardId(actor),
        recorded_at: now,
      })
      .onConflict((conflicting) =>
        conflicting
          .columns(["user_id", "linked_user_id"])
          .where("kind", "=", "same_person")
          .doNothing(),
      )
      .returning("id")
      .executeTakeFirst();

    if (inserted) {
      events.record(accountsLinkedAsSamePerson, {
        resourceId: first,
        payload: { linkedUserId: second },
      });

      return { id: inserted.id };
    }

    const { id } = await tx
      .selectFrom("app.account_links")
      .select("id")
      .where("kind", "=", "same_person")
      .where("user_id", "=", first)
      .where("linked_user_id", "=", second)
      .executeTakeFirstOrThrow();

    return { id };
  },
});

/**
 * PS-ADM-010: a steward records that the account was created or used under
 * a false identity, as an internal security signal. It changes nothing by
 * itself: stopping the account is the ordinary suspension or controlled
 * closure, earlier loans and reviews stay as the facts they are, and a
 * fabricated loan or review is corrected through moderation, one by one.
 * Recording it again returns the existing finding.
 */
export const recordFalseIdentity = defineCommand({
  name: "account.record_false_identity",
  input: accountInterventionSchema,
  output: accountRecordResultSchema,
  policy: recordFalseIdentityPolicy,
  idempotency: "required",
  load: ({ tx, input }) => loadRecordAccounts(tx, input.userId, []),
  execute: async ({ tx, actor, input, events, now }) => {
    const finding: AccountIdentityFinding = "false_identity";
    const inserted = await tx
      .insertInto("app.account_identity_findings")
      .values({
        user_id: input.userId,
        finding,
        basis: input.basis,
        recorded_by_user_id: actingStewardId(actor),
        recorded_at: now,
      })
      .onConflict((conflicting) =>
        conflicting.columns(["user_id", "finding"]).doNothing(),
      )
      .returning("id")
      .executeTakeFirst();

    if (inserted) {
      events.record(accountFalseIdentityRecorded, {
        resourceId: input.userId,
        payload: {},
      });

      return { id: inserted.id };
    }

    const { id } = await tx
      .selectFrom("app.account_identity_findings")
      .select("id")
      .where("user_id", "=", input.userId)
      .where("finding", "=", finding)
      .executeTakeFirstOrThrow();

    return { id };
  },
});

/**
 * Internal records about an account: findings, and links from either side.
 * The steward reading them must not be among the linked accounts.
 */
export const readAccountIdentityRecord = defineQuery({
  name: "account.read_identity_record",
  input: z.strictObject({ userId: z.uuid() }),
  policy: readAccountIdentityRecordPolicy,
  load: async ({ db, input }) => {
    const findings = await db
      .selectFrom("app.account_identity_findings")
      .select(["id", "finding", "basis", "recorded_by_user_id", "recorded_at"])
      .where("user_id", "=", input.userId)
      .orderBy("recorded_at")
      .orderBy("id")
      .execute();
    const links = await db
      .selectFrom("app.account_links")
      .select([
        "id",
        "kind",
        "user_id",
        "linked_user_id",
        "basis",
        "recorded_by_user_id",
        "recorded_at",
      ])
      .where((eb) =>
        eb.or([
          eb("user_id", "=", input.userId),
          eb("linked_user_id", "=", input.userId),
        ]),
      )
      .orderBy("recorded_at")
      .orderBy("id")
      .execute();
    const others = links.map((link) =>
      link.user_id === input.userId ? link.linked_user_id : link.user_id,
    );
    const loaded = await loadRecordAccounts(db, input.userId, others);

    return (
      loaded && {
        resource: { ...loaded.resource, findings, links },
        context: undefined,
      }
    );
  },
  present: ({ resource }): AccountIdentityRecord =>
    accountIdentityRecordSchema.parse({
      userId: resource.userId,
      findings: resource.findings.map((finding) => ({
        id: finding.id,
        finding: finding.finding,
        basis: finding.basis,
        recordedByUserId: finding.recorded_by_user_id,
        recordedAt: finding.recorded_at.toISOString(),
      })),
      links: resource.links.map((link) => {
        const own = link.user_id === resource.userId;

        return {
          id: link.id,
          kind: link.kind as AccountLinkKind,
          role:
            link.kind === "same_person"
              ? "same_person"
              : own
                ? "retired"
                : "continued",
          otherUserId: own ? link.linked_user_id : link.user_id,
          basis: link.basis,
          recordedByUserId: link.recorded_by_user_id,
          recordedAt: link.recorded_at.toISOString(),
        };
      }),
    }),
});

/**
 * The object, its owners and the duplicate link of an owner retired as a
 * duplicate. Accounts are locked before the object (account/store.ts): the
 * link is looked up first, both its accounts are locked for share, and the
 * object is locked last; the policy decides on its owners as locked.
 */
async function loadDuplicateObject(
  tx: Transaction<Database>,
  objectId: string,
): Promise<{ resource: DuplicateObjectResource; context: undefined } | null> {
  const candidate = await tx
    .selectFrom("app.account_links as link")
    .innerJoin("app.object_owners as owner", "owner.user_id", "link.user_id")
    .select(["link.id", "link.user_id", "link.linked_user_id"])
    .where("link.kind", "=", "duplicate")
    .where("owner.object_id", "=", objectId)
    .orderBy("link.id")
    .executeTakeFirst();
  const statuses = await lockAccounts(
    tx,
    candidate ? [candidate.user_id, candidate.linked_user_id] : [],
  );
  const object = await loadObjectState(tx, objectId, { lock: true });

  if (!object) {
    return null;
  }

  const retired = candidate && statuses.get(candidate.user_id);
  const continued = candidate && statuses.get(candidate.linked_user_id);

  return {
    resource: {
      objectId,
      ownerIds: object.ownerIds,
      link:
        candidate &&
        retired &&
        continued &&
        object.ownerIds.includes(candidate.user_id)
          ? {
              id: candidate.id,
              retired: { userId: candidate.user_id, status: retired },
              continued: {
                userId: candidate.linked_user_id,
                status: continued,
              },
            }
          : null,
    },
    context: undefined,
  };
}

/**
 * Memberships do not move: the object's publications end in environments
 * the continuing account is no member of, as when an owner loses access.
 */
async function endPublicationsBeyond(
  tx: Db,
  objectId: string,
  userId: string,
  now: Date,
): Promise<void> {
  await tx
    .updateTable("app.environment_publications as publication")
    .set({
      status: "unpublished",
      status_changed_at: now,
      ended_at: now,
      end_reason: "access_lost",
    })
    .where("publication.object_id", "=", objectId)
    .where("publication.status", "in", ["pending", "active"])
    .where(({ exists, not, selectFrom }) =>
      not(
        exists(
          selectFrom("app.environment_memberships as membership")
            .select("membership.id")
            .whereRef(
              "membership.environment_id",
              "=",
              "publication.environment_id",
            )
            .where("membership.user_id", "=", userId)
            .where("membership.state", "=", "active"),
        ),
      ),
    )
    .execute();
}

/**
 * PS-ADM-009, PS-ADM-014: a steward moves an object of a retired duplicate
 * under closure to the account that continues, in one transaction:
 * 1. the continuing account joins as an owner (it must be active and not
 *    blocked with the retired one), and the transfer is recorded with the
 *    basis;
 * 2. what belonged to the retired account's context stays there: pending
 *    co-ownership invitations of the object end, and so do its publications
 *    in environments the continuing account is no member of;
 * 3. the retired account leaves the object at once, unless it is still
 *    responsible for a loan of it. Then it stays a co-owner until the loan
 *    ends, or until it hands the role over by the ordinary rules
 *    (`loan.offer_responsibility`, with the borrower's consent since the
 *    continuing account joined after the approval), and leaves at the
 *    latest when the closure completes. The borrower's counterparty never
 *    changes without them.
 * Only an object the duplicate owns alone (or with the continuing account)
 * moves: other co-owners decide themselves who joins them.
 */
export function defineMoveDuplicateObject(
  sources: readonly ObjectCommitmentSource[],
) {
  return defineCommand({
    name: "account.move_duplicate_object",
    input: moveDuplicateObjectSchema,
    output: moveDuplicateObjectResultSchema,
    policy: moveDuplicateObjectPolicy,
    idempotency: "required",
    load: ({ tx, input }) => loadDuplicateObject(tx, input.objectId),
    execute: async ({ tx, actor, input, resource, events, now }) => {
      const { objectId, link } = resource;

      if (!link) {
        throw new Error("The policy admits only a duplicate's object");
      }

      const retiredId = link.retired.userId;
      const continuedId = link.continued.userId;

      if (resource.ownerIds.includes(continuedId)) {
        conflict("The continuing account already owns the object");
      }

      await lockPairsWith(tx, continuedId, [retiredId]);

      if (await blockedWithAny(tx, continuedId, [retiredId])) {
        conflict("The accounts block each other");
      }

      await tx
        .insertInto("app.object_owners")
        .values({ object_id: objectId, user_id: continuedId, added_at: now })
        .execute();
      await tx
        .insertInto("app.account_object_transfers")
        .values({
          link_id: link.id,
          object_id: objectId,
          from_user_id: retiredId,
          to_user_id: continuedId,
          basis: input.basis,
          moved_by_user_id: actingStewardId(actor),
          moved_at: now,
        })
        .execute();
      events.record(objectMovedFromDuplicate, {
        resourceId: objectId,
        payload: { fromUserId: retiredId, toUserId: continuedId },
      });

      await tx
        .updateTable("app.object_co_owner_invitations")
        .set({ status: "closed", ended_at: now })
        .where("object_id", "=", objectId)
        .where("status", "=", "pending")
        .execute();
      await endPublicationsBeyond(tx, objectId, continuedId, now);

      const commitments = await loadCommitments(tx, objectId, sources);
      const formerOwnerLeft = !commitments.some(
        (commitment) => commitment.responsibleOwnerId === retiredId,
      );

      if (formerOwnerLeft) {
        const object = await loadObjectState(tx, objectId);

        if (object) {
          await removeOwner(tx, object, retiredId, events, now);
        }
      }

      return { objectId, formerOwnerLeft };
    },
  });
}

export const moveDuplicateObject = defineMoveDuplicateObject(
  objectCommitmentSources,
);
