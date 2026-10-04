import type { AccountStatusReason } from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import { type Kysely, sql, type Transaction } from "kysely";
import { type Actor, type AccountStatus, systemActor } from "../actor";
import { deleteAccountAs } from "../account/deletion";
import {
  accountClosureStarted,
  accountDeactivated,
  accountDeleted,
  accountMadeDormant,
  accountReactivated,
  accountSuspended,
} from "../account/events";
import {
  changeAccountStatus,
  loadAccountForChange,
} from "../account/lifecycle";
import { transitionAllowed } from "../account/model";
import { chatAccountKeyReset, chatDeviceRevoked } from "../chat/events";
import { loadDevice, shutOut } from "../chat/store";
import { lapseInvitationsOf } from "../environment/continuity-store";
import {
  environmentOwnershipVacated,
  environmentRestrictionImposed,
  environmentRestrictionLifted,
  environmentRoleRevoked,
  environmentTypeChanged,
  environmentWindDownCancelled,
  environmentWindDownFinalized,
  environmentWindDownStarted,
  membershipEnded,
  membershipPassivated,
  membershipRejected,
} from "../environment/events";
import {
  closeReactivationRequest,
  endMembership,
} from "../environment/membership-commands";
import { isStricter } from "../environment/privacy";
import { endAdministration } from "../environment/role-commands";
import {
  findActiveRoles,
  findMembership,
  isRestricted,
  passivate,
} from "../environment/store";
import { applyType } from "../environment/type-change-store";
import { DomainError } from "../errors";
import type { EventDefinition } from "../events/catalog";
import type { EventRecorder } from "../events/recorder";
import { moderationMeasureTaken } from "../moderation/events";
import { archiveLockedObject } from "../objects/commands";
import { removeOwner } from "../objects/co-owners";
import {
  loadCommitments,
  objectCommitmentSources,
} from "../objects/commitments";
import { deleteObject } from "../objects/deletion";
import {
  coOwnerLeft,
  objectArchived,
  objectDeleted,
  objectImageRemoved,
  objectImageUploadStarted,
  objectRestored,
  objectRestrictionLifted,
  objectRestrictionSet,
} from "../objects/events";
import { removeImage } from "../objects/images";
import { loadObjectState } from "../objects/state";
import { platformRoleRevoked } from "../platform/events";
import {
  publicationApproved,
  publicationBlocked,
  publicationEnded,
  publicationPausedForApproval,
  publicationRejected,
  publicationReleasedFromApproval,
  publicationUnblocked,
  publicationWithdrawn,
} from "../publications/events";
import { isLive } from "../publications/model";
import {
  endPublication,
  findPublication,
  setPublicationStatus,
} from "../publications/store";
import { endFriendship, placeBlock } from "../social/commands";
import {
  friendshipRemoved,
  userBlocked,
  userBlockLifted,
} from "../social/events";
import { loadPair, lockPair } from "../social/pair";
import type { RestoreJournalEntry } from "./journal";
import { restoreProcess } from "./policies";

type Tx = Transaction<Database>;
type AnyEvent = EventDefinition<unknown>;

export interface ReplayArgs {
  readonly tx: Tx;
  readonly entry: RestoreJournalEntry;
  readonly events: EventRecorder;
  readonly now: Date;
}

/**
 * How one kind of erasure or restriction is re-applied to a restored
 * database (WP-72, PS-NFR-014). The journal holds what the replaced database
 * recorded after the backup; each replay brings the restored copy up to that
 * erasure or restriction with the product's own domain code, so its side
 * effects and events follow as they did the first time.
 *
 * A replay returns `applied`, or `unchanged` when the restored copy already
 * has it (or has nothing it could concern, such as an account created after
 * the backup). When it cannot be re-applied safely it throws a
 * {@link DomainError}: the restore then reports it and does not open
 * (fail closed) until someone has dealt with it.
 */
export interface RestoreReplay {
  readonly name: string;
  readonly events: readonly AnyEvent[];
  /**
   * Later entries of these types for the same subject settle an entry: the
   * restriction was lifted again, or a stronger replay covers it.
   */
  readonly settledBy?: readonly AnyEvent[];
  /** What a restriction applies to; the resource unless stated. */
  readonly subject?: (entry: RestoreJournalEntry) => string;
  /**
   * Reads, from the replaced database at export, ids the event itself does
   * not carry.
   */
  readonly capture?: (
    db: Kysely<Database>,
    entry: RestoreJournalEntry,
  ) => Promise<Record<string, string> | null>;
  replay(args: ReplayArgs): Promise<"applied" | "unchanged">;
}

export const restoreActor = systemActor(restoreProcess);

/** Stops the restore from opening until this entry has been dealt with. */
function needsHandling(message: string): never {
  throw new DomainError("conflict", message);
}

function payloadOf<P>(
  definition: EventDefinition<P>,
  entry: RestoreJournalEntry,
) {
  return definition.payload.parse(entry.payload);
}

/** Records the entry's own event again, for the consumers that follow it. */
function recordAgain<P>(
  definition: EventDefinition<P>,
  { entry, events }: ReplayArgs,
): void {
  events.record(definition, {
    resourceId: entry.resourceId,
    payload: payloadOf(definition, entry),
  });
}

async function userExists(tx: Tx, userId: string): Promise<boolean> {
  return (
    (await tx
      .selectFrom("app.users")
      .select("id")
      .where("id", "=", userId)
      .executeTakeFirst()) !== undefined
  );
}

/**
 * The user who made the original change, which the re-applied change is
 * attributed to (object versions, restrictions). Never used to authorize.
 */
async function originalUser(tx: Tx, entry: RestoreJournalEntry) {
  if (
    entry.actorUserId === null ||
    !(await userExists(tx, entry.actorUserId))
  ) {
    needsHandling("The account that made the change is not in the backup");
  }

  return entry.actorUserId;
}

/**
 * The user's own request, for an account change recorded as theirs
 * (`app.account_status_changes` requires it). Attribution only.
 */
function requestingUser(userId: string, status: AccountStatus): Actor {
  return {
    kind: "user",
    userId,
    accountStatus: status,
    authentication: { sessionId: userId, assurance: "aal1", methods: [] },
    platformRoles: [],
  };
}

/** A platform change's basis; the original basis stays out of the journal. */
const replayBasis = (entry: RestoreJournalEntry) =>
  `Re-applied after a restore (event ${entry.id}).`;

const accountTargets = new Map<
  string,
  {
    to: "deactivated" | "dormant" | "suspended" | "closing";
    reason: AccountStatusReason;
  }
>([
  [accountDeactivated.type, { to: "deactivated", reason: "user_request" }],
  [accountMadeDormant.type, { to: "dormant", reason: "inactivity" }],
  [accountSuspended.type, { to: "suspended", reason: "platform" }],
  [accountClosureStarted.type, { to: "closing", reason: "platform" }],
]);

/** PS-ADM-001–003: an account stopped, put to rest or suspended. */
const accountStatusReplay: RestoreReplay = {
  name: "account_status",
  events: [
    accountDeactivated,
    accountMadeDormant,
    accountSuspended,
    accountClosureStarted,
  ],
  settledBy: [accountReactivated],
  replay: async ({ tx, entry, events, now }) => {
    const target = accountTargets.get(entry.type);
    const loaded = await loadAccountForChange(tx, entry.resourceId);

    if (!target || !loaded || loaded.resource.status === target.to) {
      return "unchanged";
    }

    const account = loaded.resource;

    if (!transitionAllowed({ from: account.status, ...target })) {
      needsHandling(
        `The account is ${account.status}, the journal has it ${target.to}`,
      );
    }

    await changeAccountStatus(
      tx,
      {
        account,
        ...target,
        actor:
          target.reason === "user_request"
            ? requestingUser(account.userId, account.status)
            : restoreActor,
        ...(target.reason === "platform" && { basis: replayBasis(entry) }),
      },
      events,
      now,
    );

    return "applied";
  },
};

/**
 * PS-ADM-006: a deleted account is deleted again with every deletion step.
 * While the restored copy still binds it (a loan that ended after the
 * backup), it waits for someone to deal with it.
 */
const accountDeletionReplay: RestoreReplay = {
  name: "account_deletion",
  events: [accountDeleted],
  replay: async ({ tx, entry, events, now }) => {
    const loaded = await loadAccountForChange(tx, entry.resourceId);

    if (!loaded || loaded.resource.status === "deleted") {
      return "unchanged";
    }

    const account = loaded.resource;
    const own = entry.actorUserId === account.userId;
    await deleteAccountAs(
      tx,
      own
        ? {
            account,
            reason: "user_request",
            actor: requestingUser(account.userId, account.status),
          }
        : {
            account,
            reason: "platform",
            actor: restoreActor,
            basis: replayBasis(entry),
          },
      events,
      now,
    );

    return "applied";
  },
};

/** PS-USR-006: the block, and the end of their request or friendship. */
const blockReplay: RestoreReplay = {
  name: "user_block",
  events: [userBlocked],
  settledBy: [userBlockLifted],
  capture: async (db, entry) => {
    const block = await db
      .selectFrom("app.user_blocks")
      .select(["blocker_id", "blocked_id"])
      .where("id", "=", entry.resourceId)
      .executeTakeFirst();

    return block
      ? { blockerId: block.blocker_id, blockedId: block.blocked_id }
      : null;
  },
  replay: async ({ tx, entry, events, now }) => {
    const blockerId = entry.captured?.blockerId;
    const blockedId = entry.captured?.blockedId;

    if (!blockerId || !blockedId) {
      needsHandling("The journal does not say who blocked whom");
    }

    if (!(await userExists(tx, blockerId))) {
      return "unchanged";
    }

    await lockPair(tx, blockerId, blockedId);
    const pair = await loadPair(tx, blockerId, blockedId);

    if (!pair || pair.blockedByActor) {
      return "unchanged";
    }

    await placeBlock({ tx, pair, events, now });

    return "applied";
  },
};

/** A friend removed: friend-only visibility ends with the friendship. */
const friendshipReplay: RestoreReplay = {
  name: "friendship_removal",
  events: [friendshipRemoved],
  replay: async ({ tx, entry, events, now }) => {
    const friendship = await tx
      .selectFrom("app.friendships")
      .select(["user_low_id", "user_high_id"])
      .where("id", "=", entry.resourceId)
      .where("status", "=", "active")
      .executeTakeFirst();
    const remover = entry.actorUserId;

    if (!friendship || !remover) {
      return "unchanged";
    }

    const other =
      remover === friendship.user_low_id
        ? friendship.user_high_id
        : friendship.user_low_id;
    await lockPair(tx, remover, other);
    const pair = await loadPair(tx, remover, other);

    if (pair?.openFriendship?.id !== entry.resourceId) {
      return "unchanged";
    }

    await endFriendship(
      { tx, pair, events, now },
      entry.resourceId,
      "removed",
      friendshipRemoved,
    );

    return "applied";
  },
};

/** PS-USR-008: a global role ends. */
const platformRoleReplay: RestoreReplay = {
  name: "platform_role",
  events: [platformRoleRevoked],
  replay: async (args) => {
    const { tx, entry, now } = args;
    const { role } = payloadOf(platformRoleRevoked, entry);
    const revoked = await tx
      .updateTable("app.platform_role_grants")
      .set({
        revoked_at: now,
        revoked_by_process: restoreProcess,
        revoke_reason: replayBasis(entry),
      })
      .where("user_id", "=", entry.resourceId)
      .where("role", "=", role)
      .where("revoked_at", "is", null)
      .executeTakeFirst();

    if (revoked.numUpdatedRows === 0n) {
      return "unchanged";
    }

    recordAgain(platformRoleRevoked, args);

    return "applied";
  },
};

/**
 * ADR-0010 §7: a revoked chat device stays shut out. The journal holds no
 * signature, so it is revoked by the server alone; it gets nothing more.
 */
const chatDeviceRevocationReplay: RestoreReplay = {
  name: "chat_device_revocation",
  events: [chatDeviceRevoked],
  replay: async (args) => {
    const { tx, entry, now } = args;
    const device = await loadDevice(tx, entry.resourceId, { lock: true });

    if (!device || device.revokedAt !== null) {
      return "unchanged";
    }

    await shutOut(tx, [device.id], now);
    recordAgain(chatDeviceRevoked, args);

    return "applied";
  },
};

/**
 * ADR-0010 §8: after a reset, nothing under the replaced account key comes
 * back. The new key was made after the backup, so the account is left with
 * none and sets up chat again, which its contacts see as a changed key.
 */
const chatAccountKeyResetReplay: RestoreReplay = {
  name: "chat_account_key_reset",
  events: [chatAccountKeyReset],
  replay: async (args) => {
    const { tx, entry, now } = args;
    const { previousAccountKeyId } = payloadOf(chatAccountKeyReset, entry);
    const key = await tx
      .selectFrom("app.chat_account_keys")
      .select("id")
      .where("id", "=", previousAccountKeyId)
      .where("replaced_at", "is", null)
      .forUpdate()
      .executeTakeFirst();

    if (!key) {
      return "unchanged";
    }

    const live = await tx
      .selectFrom("app.chat_devices")
      .select("id")
      .where("account_key_id", "=", key.id)
      .where("revoked_at", "is", null)
      .execute();
    await shutOut(
      tx,
      live.map((device) => device.id),
      now,
    );
    await tx
      .updateTable("app.chat_account_keys")
      .set({ replaced_at: now })
      .where("id", "=", key.id)
      .execute();
    recordAgain(chatAccountKeyReset, args);

    return "applied";
  },
};

/** PS-OBJ-011: the object goes with its content, as it did. */
const objectDeletionReplay: RestoreReplay = {
  name: "object_deletion",
  events: [objectDeleted],
  replay: async ({ tx, entry, events, now }) => {
    const object = await loadObjectState(tx, entry.resourceId, { lock: true });

    if (!object) {
      return "unchanged";
    }

    if (
      (await loadCommitments(tx, object.objectId, objectCommitmentSources))
        .length > 0
    ) {
      needsHandling("The object still has a loan in the backup");
    }

    await deleteObject(tx, object, events, now);

    return "applied";
  },
};

/** A removed image goes again; its file is deleted after commit. */
const imageRemovalReplay: RestoreReplay = {
  name: "object_image_removal",
  events: [objectImageRemoved],
  settledBy: [objectDeleted],
  replay: async ({ tx, entry, events, now }) => {
    const { imageId } = payloadOf(objectImageRemoved, entry);
    const object = await loadObjectState(tx, entry.resourceId, { lock: true });
    const image =
      object &&
      (await tx
        .selectFrom("app.object_images")
        .select("position")
        .where("id", "=", imageId)
        .where("object_id", "=", object.objectId)
        .executeTakeFirst());

    if (!object || !image) {
      return "unchanged";
    }

    await removeImage(
      tx,
      object,
      { imageId, position: image.position },
      await originalUser(tx, entry),
      events,
      now,
    );

    return "applied";
  },
};

/**
 * Database backups do not hold stored files (Supabase Storage), so a file
 * uploaded after the backup has no image in the restored copy. Recording the
 * upload again lets the image cleanup delete the orphaned file.
 */
const imageUploadReplay: RestoreReplay = {
  name: "object_image_upload",
  events: [objectImageUploadStarted],
  replay: async (args) => {
    const { imageId } = payloadOf(objectImageUploadStarted, args.entry);
    const registered = await args.tx
      .selectFrom("app.object_images")
      .select("id")
      .where("id", "=", imageId)
      .executeTakeFirst();

    if (registered) {
      return "unchanged";
    }

    recordAgain(objectImageUploadStarted, args);

    return "applied";
  },
};

/**
 * PS-OBJ-010: a co-owner who left is no owner. The one who left is the
 * actor; leaving with a deleted account is the account deletion's replay.
 */
const coOwnerLeftReplay: RestoreReplay = {
  name: "object_co_owner_left",
  events: [coOwnerLeft],
  settledBy: [objectDeleted],
  replay: async ({ tx, entry, events, now }) => {
    const leaver = entry.actorUserId;
    const object = await loadObjectState(tx, entry.resourceId, { lock: true });

    if (!object || !leaver || !object.ownerIds.includes(leaver)) {
      return "unchanged";
    }

    const commitments = await loadCommitments(
      tx,
      object.objectId,
      objectCommitmentSources,
    );

    if (
      object.ownerIds.length === 1 ||
      commitments.some((commitment) => commitment.responsibleOwnerId === leaver)
    ) {
      needsHandling(
        "The co-owner still has a part in the object in the backup",
      );
    }

    await removeOwner(tx, object, leaver, events, now);

    return "applied";
  },
};

/**
 * PS-OBJ-008: a co-owner's veto on new commitments stays in force until that
 * co-owner withdraws it or leaves. It keeps its id, so a later lift in the
 * journal settles it. A co-owner whose joining was lost is not an owner in
 * the backup, and their veto goes with the co-ownership.
 */
const objectRestrictionReplay: RestoreReplay = {
  name: "object_restriction",
  events: [objectRestrictionSet],
  settledBy: [objectRestrictionLifted],
  subject: (entry) => String(entry.payload.restrictionId),
  capture: async (db, entry) => {
    const { restrictionId } = payloadOf(objectRestrictionSet, entry);
    const restriction = await db
      .selectFrom("app.object_restrictions")
      .select([
        "set_by_user_id",
        sql<string | null>`lower(period)::text`.as("from"),
        sql<string | null>`upper(period)::text`.as("until"),
      ])
      .where("id", "=", restrictionId)
      .executeTakeFirst();

    return restriction
      ? {
          setBy: restriction.set_by_user_id,
          ...(restriction.from && { from: restriction.from }),
          ...(restriction.until && { until: restriction.until }),
        }
      : null;
  },
  replay: async (args) => {
    const { tx, entry, now } = args;
    const { restrictionId } = payloadOf(objectRestrictionSet, entry);
    const setBy = entry.captured?.setBy;

    if (!setBy) {
      needsHandling("The journal does not say who set the restriction");
    }

    const object = await loadObjectState(tx, entry.resourceId, { lock: true });

    if (!object?.ownerIds.includes(setBy)) {
      return "unchanged";
    }

    const { from, until } = entry.captured ?? {};
    const inserted = await tx
      .insertInto("app.object_restrictions")
      .values({
        id: restrictionId,
        object_id: object.objectId,
        set_by_user_id: setBy,
        period: from
          ? sql<string>`daterange(${from}::date, ${until ?? null}::date, '[)')`
          : null,
        created_at: now,
      })
      .onConflict((onConflict) => onConflict.column("id").doNothing())
      .returning("id")
      .executeTakeFirst();

    if (!inserted) {
      return "unchanged";
    }

    recordAgain(objectRestrictionSet, args);

    return "applied";
  },
};

/** PS-OBJ-016: an archived object is not offered. */
const archiveReplay: RestoreReplay = {
  name: "object_archive",
  events: [objectArchived],
  settledBy: [objectRestored, objectDeleted],
  replay: async ({ tx, entry, events, now }) => {
    const object = await loadObjectState(tx, entry.resourceId, { lock: true });

    if (object?.status !== "active") {
      return "unchanged";
    }

    await archiveLockedObject(
      tx,
      object,
      await originalUser(tx, entry),
      events,
      now,
    );

    return "applied";
  },
};

/** The publication, locked, while it is still pending or active. */
async function livePublication(tx: Tx, entry: RestoreJournalEntry) {
  const publication = await findPublication(tx, entry.resourceId, {
    lock: true,
  });

  return publication && isLive(publication.status) ? publication : null;
}

/** PS-OBJ-006: a publication taken down or ended is not found any more. */
const publicationEndReplay: RestoreReplay = {
  name: "publication_end",
  events: [publicationWithdrawn, publicationEnded],
  replay: async (args) => {
    const { tx, entry, now } = args;
    const publication = await livePublication(tx, entry);

    if (!publication) {
      return "unchanged";
    }

    if (entry.type === publicationWithdrawn.type) {
      await endPublication(
        tx,
        publication.id,
        "withdrawn",
        await originalUser(tx, entry),
        now,
      );
      recordAgain(publicationWithdrawn, args);
    } else {
      const { reason } = payloadOf(publicationEnded, entry);
      await endPublication(tx, publication.id, reason, null, now);
      recordAgain(publicationEnded, args);
    }

    return "applied";
  },
};

/** PS-ENV-011, PS-OBJ-017: an administrator's decision on a publication. */
function publicationStatusReplay(
  event: AnyEvent,
  status: "rejected" | "blocked" | "pending",
  settledBy: readonly AnyEvent[],
): RestoreReplay {
  return {
    name: `publication_${status}`,
    events: [event],
    settledBy,
    replay: async (args) => {
      const publication = await livePublication(args.tx, args.entry);

      if (!publication || publication.status === status) {
        return "unchanged";
      }

      await setPublicationStatus(args.tx, publication.id, status, args.now);
      recordAgain(event, args);

      return "applied";
    },
  };
}

/** PS-ENV-004: a user barred from new membership attempts. */
const restrictionReplay: RestoreReplay = {
  name: "environment_restriction",
  events: [environmentRestrictionImposed],
  settledBy: [environmentRestrictionLifted],
  subject: (entry) => `${entry.resourceId}:${String(entry.payload.userId)}`,
  replay: async (args) => {
    const { tx, entry, now } = args;
    const { userId } = payloadOf(environmentRestrictionImposed, entry);

    if (
      !(await userExists(tx, userId)) ||
      (await isRestricted(tx, entry.resourceId, userId))
    ) {
      return "unchanged";
    }

    await tx
      .insertInto("app.environment_access_restrictions")
      .values({
        environment_id: entry.resourceId,
        user_id: userId,
        imposed_at: now,
        imposed_by_user_id: await originalUser(tx, entry),
      })
      .execute();
    recordAgain(environmentRestrictionImposed, args);

    return "applied";
  },
};

/**
 * PS-ENV-005: a membership that ended. A role in the environment ends
 * before the membership does, through its own entry.
 */
const membershipEndReplay: RestoreReplay = {
  name: "membership_end",
  events: [membershipEnded],
  replay: async (args) => {
    const { tx, entry, events, now } = args;
    const { environmentId, userId, reason } = payloadOf(membershipEnded, entry);
    const membership = await findMembership(
      tx,
      environmentId,
      entry.resourceId,
    );

    if (!membership || membership.state === "ended") {
      return "unchanged";
    }

    if ((await findActiveRoles(tx, environmentId, userId)).length > 0) {
      needsHandling(
        "The member still holds a role in the environment in the backup",
      );
    }

    await endMembership(tx, membership, reason, now);
    recordAgain(membershipEnded, args);
    await lapseInvitationsOf(tx, environmentId, userId, now, events);

    return "applied";
  },
};

/**
 * A rejected application ends. A rejected reactivation request closes, and
 * the member stays passive.
 */
const membershipRejectionReplay: RestoreReplay = {
  name: "membership_rejection",
  events: [membershipRejected],
  replay: async (args) => {
    const { tx, entry, now } = args;
    const { environmentId, reactivation } = payloadOf(
      membershipRejected,
      entry,
    );
    const membership = await findMembership(
      tx,
      environmentId,
      entry.resourceId,
    );

    if (reactivation) {
      if (membership?.state !== "passive" || membership.reviewStage === null) {
        return "unchanged";
      }

      await closeReactivationRequest(tx, membership.id, now);
    } else if (membership?.state === "pending") {
      await endMembership(tx, membership, "application_rejected", now);
    } else {
      return "unchanged";
    }

    recordAgain(membershipRejected, args);

    return "applied";
  },
};

/** PS-ENV-006: a member who no longer meets the requirements is passive. */
const membershipPassivationReplay: RestoreReplay = {
  name: "membership_passivation",
  events: [membershipPassivated],
  replay: async ({ tx, entry, events, now }) => {
    const { environmentId, reason } = payloadOf(membershipPassivated, entry);
    const membership = await findMembership(
      tx,
      environmentId,
      entry.resourceId,
    );

    if (membership?.state !== "active") {
      return "unchanged";
    }

    await passivate(tx, [membership], now, events, reason);

    return "applied";
  },
};

/**
 * An administrator role that ended. An owner change goes through the
 * continuity process (PS-ENV-013), so it waits for someone to deal with it.
 */
const roleReplay: RestoreReplay = {
  name: "environment_role",
  events: [environmentRoleRevoked],
  replay: async ({ tx, entry, events, now }) => {
    const { userId, role, reason } = payloadOf(environmentRoleRevoked, entry);

    if (!(await findActiveRoles(tx, entry.resourceId, userId)).includes(role)) {
      return "unchanged";
    }

    if (role === "owner") {
      needsHandling("The environment's owner changed after the backup");
    }

    await endAdministration(
      tx,
      entry.resourceId,
      userId,
      reason,
      { process: restoreProcess },
      now,
      events,
    );

    return "applied";
  },
};

/** The former owner's role is gone already, or the change waits (above). */
const vacancyReplay: RestoreReplay = {
  name: "environment_vacancy",
  events: [environmentOwnershipVacated],
  replay: async ({ tx, entry }) => {
    const { formerOwnerUserId } = payloadOf(environmentOwnershipVacated, entry);

    if (
      (await findActiveRoles(tx, entry.resourceId, formerOwnerUserId)).includes(
        "owner",
      )
    ) {
      needsHandling("The environment's owner changed after the backup");
    }

    return "unchanged";
  },
};

/** PS-ENV-007: a stricter type applies at once; a weaker one is not re-applied. */
const typeChangeReplay: RestoreReplay = {
  name: "environment_type",
  events: [environmentTypeChanged],
  replay: async ({ tx, entry, events, now }) => {
    const { toType } = payloadOf(environmentTypeChanged, entry);
    const environment = await tx
      .selectFrom("app.environments")
      .select(["id", "type"])
      .where("id", "=", entry.resourceId)
      .forUpdate()
      .executeTakeFirst();

    if (
      !environment ||
      !isStricter(toType, environment.type as typeof toType)
    ) {
      return "unchanged";
    }

    await applyType(
      tx,
      { id: environment.id, type: environment.type as typeof toType },
      toType,
      null,
      now,
      events,
    );

    return "applied";
  },
};

/**
 * PS-ENV-012: winding down. Once the backup has the environment winding
 * down, the scheduled continuity job finalizes it when due; starting it
 * again waits for someone to deal with it.
 */
const windDownReplay: RestoreReplay = {
  name: "environment_wind_down",
  events: [environmentWindDownStarted, environmentWindDownFinalized],
  settledBy: [environmentWindDownCancelled],
  replay: async ({ tx, entry }) => {
    const environment = await tx
      .selectFrom("app.environments")
      .select("state")
      .where("id", "=", entry.resourceId)
      .executeTakeFirst();

    if (!environment || environment.state === "winding_down") {
      return "unchanged";
    }

    needsHandling("The environment started winding down after the backup");
  },
};

/**
 * PS-TRUST-016: a publication measure's effect is its own entry
 * (`environment_publication.rejected`/`blocked`). Platform measures on
 * objects and reviews wait for someone to deal with them.
 */
const moderationReplay: RestoreReplay = {
  name: "moderation_measure",
  events: [moderationMeasureTaken],
  replay: async ({ entry }) => {
    const { measure } = payloadOf(moderationMeasureTaken, entry);

    if (
      measure === "publication_rejected" ||
      measure === "publication_blocked" ||
      measure === "object_unblocked"
    ) {
      return "unchanged";
    }

    needsHandling(`A platform measure (${measure}) was taken after the backup`);
  },
};

/**
 * Everything a restore re-applies, in no particular order: the journal's
 * own order decides. Every event type is either here or in
 * `restoreClassification`'s list of what a restore may lose.
 */
export const restoreReplays: readonly RestoreReplay[] = [
  accountStatusReplay,
  accountDeletionReplay,
  blockReplay,
  friendshipReplay,
  platformRoleReplay,
  objectDeletionReplay,
  imageRemovalReplay,
  imageUploadReplay,
  coOwnerLeftReplay,
  objectRestrictionReplay,
  archiveReplay,
  publicationEndReplay,
  publicationStatusReplay(publicationRejected, "rejected", [
    publicationApproved,
  ]),
  publicationStatusReplay(publicationBlocked, "blocked", [
    publicationUnblocked,
  ]),
  publicationStatusReplay(publicationPausedForApproval, "pending", [
    publicationReleasedFromApproval,
    publicationApproved,
  ]),
  restrictionReplay,
  membershipEndReplay,
  membershipRejectionReplay,
  membershipPassivationReplay,
  roleReplay,
  vacancyReplay,
  typeChangeReplay,
  windDownReplay,
  moderationReplay,
  chatDeviceRevocationReplay,
  chatAccountKeyResetReplay,
];
