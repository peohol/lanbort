import { randomBytes, randomUUID } from "node:crypto";
import type { Database } from "@lanbort/database";
import type { Kysely } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Actor, systemActor, type UserActor } from "../actor";
import { deleteOwnAccount } from "../account/deletion";
import {
  type CommandDefinition,
  type DomainContext,
  executeCommand,
} from "../commands/command";
import { executeQuery } from "../commands/query";
import { createEnvironment } from "../environment/environment-commands";
import {
  joinEnvironment,
  leaveEnvironment,
  rejectMembership,
} from "../environment/membership-commands";
import { calendarDate } from "../objects/availability";
import { archiveObject, createObject } from "../objects/commands";
import { consentToObjectDeletion } from "../objects/deletion";
import { objectImageUploadStarted } from "../objects/events";
import { outboxConsumers } from "../outbox/consumers";
import { grantPlatformRole, revokePlatformRole } from "../platform/commands";
import { platformRoleOpsProcess } from "../platform/policies";
import { publishObject, withdrawPublication } from "../publications/commands";
import { reconcileSearchIndex } from "../search/indexer";
import { searchIndexProcess } from "../search/policies";
import { searchObjects } from "../search/queries";
import {
  acceptFriendRequest,
  blockUser,
  removeFriend,
  sendFriendRequest,
} from "../social/commands";
import {
  backUpDatabase,
  connectDatabase,
  dropDatabase,
  restoreDatabase,
  testDatabaseName,
} from "../testing/backup";
import { registerTestUser } from "../testing/identities";
import { type RestoreCheckResult, runRestoreChecks } from "./checks";
import type { RestoreJournalEntry } from "./journal";
import {
  exportRestoreJournal,
  type ReplayResult,
  replayRestoreJournal,
} from "./replay";

/** Pilot targets, docs/architecture/09 «Backup». */
const recoveryTimeObjective = 8 * 60 * 60 * 1000;

const suffix = randomBytes(4).toString("hex");
const liveName = `restore_drill_live_${suffix}`;
const restoredName = `restore_drill_restored_${suffix}`;

/** A domain on one database, wired like the app (outbox messages included). */
function domainOn(db: Kysely<Database>): DomainContext {
  const domain: DomainContext = {
    db,
    consumers: outboxConsumers({
      domain: () => domain,
      imageStore: () => undefined,
      identities: () => undefined,
    }),
  };

  return domain;
}

// The "production" database is its own copy of the test database, so other
// tests running meanwhile never reach the journal.
restoreDatabase(liveName, backUpDatabase(testDatabaseName()));
const live = domainOn(connectDatabase(liveName));
let restored: DomainContext;

afterAll(async () => {
  await live.db.destroy();
  await restored?.db.destroy();
  dropDatabase(liveName);
  dropDatabase(restoredName);
});

function run<I, R, C, O>(
  domain: DomainContext,
  command: CommandDefinition<I, R, C, O>,
  actor: Actor,
  input: object,
): Promise<O> {
  return executeCommand(domain, command, {
    actor,
    input,
    ...(command.idempotency === "none" ? {} : { idempotencyKey: randomUUID() }),
  }).then((result) => result.output);
}

const emails = new Map<string, string | null>();

async function user() {
  const { actor, identity } = await registerTestUser(live);
  emails.set(actor.userId, identity.email);

  return actor;
}
const word = randomBytes(8).toString("hex").replace(/\d/g, "q");

async function object(owner: UserActor, title: string) {
  const { objectId } = await run(live, createObject, owner, {
    title: `${title} ${word}`,
    categoryId: "annet",
    description: "Til øvelsen.",
    availability: [{ start: calendarDate(new Date()), end: null }],
  });

  return objectId;
}

const reconcile = (domain: DomainContext) =>
  run(domain, reconcileSearchIndex, systemActor(searchIndexProcess), {});

/** The objects with the drill's word that the actor finds. */
async function found(domain: DomainContext, actor: UserActor) {
  const { objects } = await executeQuery(domain, searchObjects, {
    actor,
    input: { q: word },
  });

  return objects.map((found) => found.objectId).sort();
}

describe("backup/restore drill (WP-72, PS-NFR-014)", () => {
  const people = {} as Record<
    | "admin"
    | "owner"
    | "viewer"
    | "leaver"
    | "deleted"
    | "blocker"
    | "blocked"
    | "friend"
    | "unfriended"
    | "applicant"
    | "steward"
    | "blockedBefore",
    UserActor
  >;
  const objects = {} as Record<
    "deleted" | "archived" | "withdrawn" | "kept",
    string
  >;
  let backup: Buffer;
  let backupTime: Date;
  let newAfterBackup: string;
  let applicationId: string;
  let closedEnvironmentId: string;
  let openEnvironmentId: string;
  let journal: RestoreJournalEntry[];
  let results: ReplayResult[];
  let restoreMs: number;
  let checksBefore: RestoreCheckResult[];

  beforeAll(async () => {
    for (const name of Object.keys({
      admin: 0,
      owner: 0,
      viewer: 0,
      leaver: 0,
      deleted: 0,
      blocker: 0,
      blocked: 0,
      friend: 0,
      unfriended: 0,
      applicant: 0,
      steward: 0,
      blockedBefore: 0,
    }) as (keyof typeof people)[]) {
      people[name] = await user();
    }

    const { admin, owner, steward } = people;
    ({ environmentId: openEnvironmentId } = await run(
      live,
      createEnvironment,
      admin,
      { name: "Øvelsesgården", type: "open" },
    ));
    ({ environmentId: closedEnvironmentId } = await run(
      live,
      createEnvironment,
      admin,
      { name: "Styret", type: "closed" },
    ));

    for (const member of [
      owner,
      people.viewer,
      people.leaver,
      people.deleted,
    ]) {
      await run(live, joinEnvironment, member, {
        environmentId: openEnvironmentId,
        answers: [],
      });
    }

    const publications: Record<string, string> = {};
    for (const name of ["deleted", "archived", "withdrawn", "kept"] as const) {
      objects[name] = await object(owner, name);
      ({ publicationId: publications[name] as string } = await run(
        live,
        publishObject,
        owner,
        { objectId: objects[name], environmentId: openEnvironmentId },
      ));
    }

    for (const [a, b] of [
      [people.blocker, people.blocked],
      [people.friend, people.unfriended],
    ] as const) {
      await run(live, sendFriendRequest, a, { userId: b.userId });
      await run(live, acceptFriendRequest, b, { userId: a.userId });
    }

    // Already in the backup: the journal's margin reaches back to it.
    await run(live, blockUser, people.blocker, {
      userId: people.blockedBefore.userId,
    });
    ({ membershipId: applicationId } = await run(
      live,
      joinEnvironment,
      people.applicant,
      { environmentId: closedEnvironmentId, answers: [] },
    ));
    const roleChange = {
      email: emails.get(steward.userId),
      role: "platform_steward",
      reason: "Øvelse",
    };
    await run(
      live,
      grantPlatformRole,
      systemActor(platformRoleOpsProcess),
      roleChange,
    );
    await reconcile(live);
    // The copy starts from the shared test database, whose fixtures need
    // not hold every invariant; the restore must add no finding to them.
    checksBefore = await runRestoreChecks(live.db);

    expect(await found(live, people.viewer)).toEqual(
      Object.values(objects).sort(),
    );

    backupTime = new Date();
    backup = backUpDatabase(liveName);

    // After the backup: what the restore must not bring back...
    await run(live, deleteOwnAccount, people.deleted, {});
    await run(live, blockUser, people.blocker, {
      userId: people.blocked.userId,
    });
    await run(live, removeFriend, people.friend, {
      userId: people.unfriended.userId,
    });
    await run(live, consentToObjectDeletion, owner, {
      objectId: objects.deleted,
    });
    await run(live, archiveObject, owner, { objectId: objects.archived });
    await run(live, withdrawPublication, owner, {
      objectId: objects.withdrawn,
      publicationId: publications.withdrawn,
    });
    await run(live, leaveEnvironment, people.leaver, {
      environmentId: openEnvironmentId,
    });
    await run(live, rejectMembership, admin, {
      environmentId: closedEnvironmentId,
      membershipId: applicationId,
      restrict: true,
    });
    await run(
      live,
      revokePlatformRole,
      systemActor(platformRoleOpsProcess),
      roleChange,
    );
    // ...and what it loses with the window after the backup (RPO).
    newAfterBackup = await object(owner, "ny");

    journal = await exportRestoreJournal(
      live.db,
      new Date(backupTime.getTime() - 60_000),
    );

    const started = Date.now();
    restoreDatabase(restoredName, backup);
    restored = domainOn(connectDatabase(restoredName));
    results = await replayRestoreJournal(restored, journal);
    await reconcile(restored);
    restoreMs = Date.now() - started;
  });

  it("re-applies every erasure and restriction made after the backup", () => {
    expect(results.filter((r) => r.outcome === "needs_handling")).toEqual([]);
    const earlierBlock = journal.find(
      (entry) => entry.captured?.blockedId === people.blockedBefore.userId,
    );
    const inBackup = results.filter((r) => r.outcome === "in_backup");
    expect(
      inBackup.map((r) => r.entryId),
      "the journal's margin reaches back to the earlier block",
    ).toContain(earlierBlock?.id);
    expect(
      journal
        .filter((entry) => inBackup.some((r) => r.entryId === entry.id))
        .every((entry) => new Date(entry.occurredAt) < backupTime),
    ).toBe(true);
    expect(
      results
        .filter((r) => r.outcome === "applied")
        .map((r) => r.type)
        .sort(),
    ).toEqual(
      [
        "account.deleted",
        "environment.restriction_imposed",
        "environment_membership.ended",
        "environment_membership.rejected",
        "environment_publication.withdrawn",
        "friendship.removed",
        "object.archived",
        "object.deleted",
        "platform_role.revoked",
        "user_block.created",
      ].sort(),
    );
  });

  it("carries ids and codes only in the journal", () => {
    const text = JSON.stringify(journal);

    expect(text).not.toContain("Øvelse");
    expect(text).not.toContain("@example.test");
    expect(text).not.toContain(word);
  });

  it("keeps the deleted account deleted, and its sign-in identity goes", async () => {
    const account = await restored.db
      .selectFrom("app.users")
      .select("status")
      .where("id", "=", people.deleted.userId)
      .executeTakeFirstOrThrow();
    expect(account.status).toBe("deleted");

    const removal = await restored.db
      .selectFrom("app.outbox_messages as message")
      .innerJoin("app.audit_events as event", "event.id", "message.event_id")
      .select("message.status")
      .where("message.consumer", "=", "account.remove_identity")
      .where("event.resource_id", "=", people.deleted.userId)
      .execute();
    expect(removal).toEqual([{ status: "pending" }]);
  });

  it("keeps blocks, ended friendships, memberships, bars and roles", async () => {
    const { db } = restored;
    const blocks = await db
      .selectFrom("app.user_blocks")
      .select("blocked_id")
      .where("blocker_id", "=", people.blocker.userId)
      .where("lifted_at", "is", null)
      .execute();
    expect(blocks.map((b) => b.blocked_id).sort()).toEqual(
      [people.blocked.userId, people.blockedBefore.userId].sort(),
    );

    const friendships = await db
      .selectFrom("app.friendships")
      .select("status")
      .where("requester_id", "in", [
        people.blocker.userId,
        people.friend.userId,
      ])
      .execute();
    expect(friendships.map((f) => f.status)).toEqual(["ended", "ended"]);

    const memberships = await db
      .selectFrom("app.environment_memberships")
      .select(["user_id", "state"])
      .where("user_id", "in", [
        people.leaver.userId,
        people.deleted.userId,
        people.applicant.userId,
      ])
      .execute();
    expect(memberships.map((m) => m.state)).toEqual([
      "ended",
      "ended",
      "ended",
    ]);

    const bar = await db
      .selectFrom("app.environment_access_restrictions")
      .select("imposed_by_user_id")
      .where("environment_id", "=", closedEnvironmentId)
      .where("user_id", "=", people.applicant.userId)
      .where("lifted_at", "is", null)
      .executeTakeFirst();
    expect(bar?.imposed_by_user_id).toBe(people.admin.userId);

    const roles = await db
      .selectFrom("app.platform_role_grants")
      .select("revoked_by_process")
      .where("user_id", "=", people.steward.userId)
      .execute();
    expect(roles).toEqual([{ revoked_by_process: "ops.restore" }]);
  });

  it("finds only what was still offered, from a rebuilt index", async () => {
    expect(await found(restored, people.viewer)).toEqual([objects.kept]);

    const gone = await restored.db
      .selectFrom("app.objects")
      .select("id")
      .where("id", "in", [objects.deleted, newAfterBackup])
      .execute();
    expect(gone, "deleted, and lost with the window").toEqual([]);
  });

  it("passes the checks before opening, well within the RTO", async () => {
    expect(await runRestoreChecks(restored.db)).toEqual(checksBefore);
    expect(restoreMs).toBeLessThan(recoveryTimeObjective);
  });

  it("can be run again after an interruption without applying twice", async () => {
    const again = await replayRestoreJournal(restored, journal);

    expect(again.map((r) => r.outcome)).toEqual(results.map((r) => r.outcome));
    expect(
      await restored.db
        .selectFrom("app.audit_events")
        .select((eb) => eb.fn.countAll<string>().as("count"))
        .where("actor_process", "=", "ops.restore")
        .where("event_type", "=", "user_block.created")
        .executeTakeFirstOrThrow(),
    ).toEqual({ count: "1" });
  });
});

describe("journal entries that cannot or need not be re-applied", () => {
  const entry = (
    overrides: Partial<RestoreJournalEntry>,
  ): RestoreJournalEntry => ({
    id: randomUUID(),
    position: "9000000000000000000",
    occurredAt: new Date().toISOString(),
    type: "user_block.created",
    resourceType: "user_block",
    resourceId: randomUUID(),
    actorUserId: null,
    payload: {},
    captured: null,
    ...overrides,
  });

  it("settles a restriction lifted again later in the journal", async () => {
    const block = entry({});
    const lifted = entry({
      type: "user_block.lifted",
      resourceId: block.resourceId,
      position: "9000000000000000001",
    });

    expect(
      (await replayRestoreJournal(live, [lifted, block])).map((r) => r.outcome),
    ).toEqual(["settled", "not_replayed"]);
  });

  it("does not open while an entry cannot be re-applied safely", async () => {
    const [result] = await replayRestoreJournal(live, [entry({})]);

    expect(result).toMatchObject({
      outcome: "needs_handling",
      reason: "conflict: The journal does not say who blocked whom",
    });
  });

  it("has the image cleanup delete a file whose upload the backup lacks", async () => {
    const objectId = randomUUID();
    const [result] = await replayRestoreJournal(live, [
      entry({
        type: objectImageUploadStarted.type,
        resourceType: "object",
        resourceId: objectId,
        payload: { imageId: randomUUID() },
      }),
    ]);

    expect(result?.outcome).toBe("applied");
    expect(
      await live.db
        .selectFrom("app.outbox_messages as message")
        .innerJoin("app.audit_events as event", "event.id", "message.event_id")
        .select("message.consumer")
        .where("event.resource_id", "=", objectId)
        .execute(),
    ).toEqual([{ consumer: "object_images.delete_file" }]);
  });
});
