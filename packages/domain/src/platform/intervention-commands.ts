import {
  type CaseInterventions,
  type CaseSubjectAccount,
  caseInterventionsQuerySchema,
  endEnvironmentRolesResultSchema,
  endEnvironmentRolesSchema,
  openPlatformInquirySchema,
  type PlatformInterventionKind,
  platformInquiryOpenedSchema,
} from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import type { Kysely } from "kysely";
import type { AccountStatus } from "../actor";
import { accountBindingSources, loadBindings } from "../account/bindings";
import { realNames } from "../account/store";
import { defineCommand } from "../commands/command";
import { defineQuery } from "../commands/query";
import { loadCase } from "../cases/commands";
import { caseAssigned, caseEntryAdded, caseOpened } from "../cases/events";
import { readCaseInterventionsPolicy } from "../cases/policies";
import { insertCase, insertEntry, recordAction } from "../cases/store";
import { releaseRolesIn } from "../environment/continuity-commands";
import { actingUserId, inSnapshot, loadObjectState } from "../objects/state";
import { intervene, withInterventionCase } from "./interventions";
import {
  endEnvironmentRolesPolicy,
  type InquiryTarget,
  openPlatformInquiryPolicy,
} from "./policies";

/**
 * PS-ADM-015: a steward's own basis for intervening when no report came in
 * («autorisert saksgrunnlag»): a platform case about someone else's account
 * or thing, with the basis as its first entry, to the handlers only. The
 * steward holds it at once and is not a party to it; nobody takes part, and
 * whoever it is about never learns of it through the case, as with a
 * report (PS-COM-015). Its interventions are recorded on it like a
 * report's.
 */
export const openPlatformInquiry = defineCommand({
  name: "case.open_platform_inquiry",
  input: openPlatformInquirySchema,
  output: platformInquiryOpenedSchema,
  policy: openPlatformInquiryPolicy,
  idempotency: "required",
  load: async ({ tx, input: { target } }) => {
    if (target.kind === "user") {
      const user = await tx
        .selectFrom("app.users")
        .select(["id", "status"])
        .where("id", "=", target.userId)
        .forShare()
        .executeTakeFirst();

      return user
        ? {
            resource: {
              kind: "user",
              userId: user.id,
              status: user.status as AccountStatus,
            } satisfies InquiryTarget,
            context: undefined,
          }
        : null;
    }

    const object = await loadObjectState(tx, target.objectId, { lock: true });

    return object
      ? {
          resource: {
            kind: "object",
            objectId: target.objectId,
            ownerIds: object.ownerIds,
          } satisfies InquiryTarget,
          context: undefined,
        }
      : null;
  },
  execute: async ({ tx, actor, input, resource, events, now }) => {
    const userId = actingUserId(actor);
    const caseId = await insertCase(tx, {
      kind: "platform_inquiry",
      environmentId: null,
      loanId: null,
      subjectUserId: resource.kind === "user" ? resource.userId : null,
      report: {
        target: resource.kind,
        objectId: resource.kind === "object" ? resource.objectId : null,
        reviewId: null,
        escalatedFromCaseId: null,
      },
      openedByUserId: userId,
      participants: [],
      now,
    });
    const base = { caseKind: "platform_inquiry", environmentId: null } as const;

    events.record(caseOpened, {
      resourceId: caseId,
      payload: { ...base, loanId: null },
    });
    await recordAction(tx, {
      caseId,
      kind: "assigned",
      actorUserId: userId,
      targetUserId: userId,
      now,
    });
    events.record(caseAssigned, {
      resourceId: caseId,
      payload: { ...base, assigneeUserId: userId },
    });

    const entryId = await insertEntry(tx, {
      caseId,
      authorUserId: userId,
      capacity: "handler",
      audience: "handlers",
      audienceUserId: null,
      body: input.basis,
      correctsEntryId: null,
      now,
    });
    events.record(caseEntryAdded, {
      resourceId: caseId,
      payload: {
        ...base,
        entryId,
        capacity: "handler",
        audience: "handlers",
        correction: false,
      },
    });

    return { caseId, entryId };
  },
});

/**
 * PS-ADM-015 («Inngrep i et miljø ved misbruk av administratorrollen»): a
 * steward ends the administrator and owner roles a person misuses in one
 * environment, from the case about them. Nobody else gains authority: an
 * owner's place goes through the continuity model (PS-ENV-013), where the
 * remaining administrators may take it on, or the environment winds down.
 * The members see only the result, as with any role that ends.
 */
export const endEnvironmentRoles = defineCommand({
  name: "environment_role.end_by_platform",
  input: endEnvironmentRolesSchema,
  output: endEnvironmentRolesResultSchema,
  policy: endEnvironmentRolesPolicy,
  idempotency: "required",
  load: async ({ tx, actor, input, now }) => {
    const environment = await tx
      .selectFrom("app.environments")
      .select("id")
      .where("id", "=", input.environmentId)
      .forUpdate()
      .executeTakeFirst();

    return withInterventionCase(
      tx,
      actor,
      input.caseId,
      now,
      environment
        ? {
            resource: { environmentId: environment.id, userId: input.userId },
            context: undefined,
          }
        : null,
      ({ userId }) => ({ userIds: [userId] }),
    );
  },
  execute: (scope) =>
    intervene(scope, async () => {
      const { tx, actor, resource, events, now } = scope;
      const environment = await tx
        .selectFrom("app.environments")
        .select(["id", "state"])
        .where("id", "=", resource.environmentId)
        .executeTakeFirstOrThrow();
      const ended = await releaseRolesIn(
        tx,
        environment,
        resource.userId,
        "platform_intervention",
        { userId: actingUserId(actor) },
        now,
        events,
      );

      return {
        result: {
          environmentId: resource.environmentId,
          userId: resource.userId,
          ended,
        },
        taken:
          ended.length > 0
            ? {
                kind: "environment_roles_ended",
                userId: resource.userId,
                environmentId: resource.environmentId,
              }
            : null,
      };
    }),
});

/**
 * The account a case is about, as an intervention would find it: its
 * status, the environments where it holds a role, and its bindings.
 */
async function loadSubjectAccount(
  tx: Kysely<Database>,
  userId: string,
): Promise<CaseSubjectAccount | null> {
  const user = await tx
    .selectFrom("app.users")
    .select("status")
    .where("id", "=", userId)
    .executeTakeFirst();

  if (!user) {
    return null;
  }

  const grants = await tx
    .selectFrom("app.environment_role_grants as g")
    .innerJoin("app.environments as e", "e.id", "g.environment_id")
    .select(["e.id", "e.name", "g.role"])
    .where("g.user_id", "=", userId)
    .where("g.revoked_at", "is", null)
    .orderBy("e.name")
    .execute();
  const roles = new Map<string, CaseSubjectAccount["roles"][number]>();

  for (const grant of grants) {
    const role = roles.get(grant.id);
    roles.set(grant.id, {
      environmentId: grant.id,
      name: grant.name,
      owner: (role?.owner ?? false) || grant.role === "owner",
    });
  }

  const duplicate = await tx
    .selectFrom("app.account_links")
    .select("linked_user_id")
    .where("kind", "=", "duplicate")
    .where("user_id", "=", userId)
    .executeTakeFirst();

  return {
    userId,
    status: user.status as AccountStatus,
    roles: [...roles.values()],
    bindings: await loadBindings(tx, userId, accountBindingSources),
    ...(duplicate
      ? await loadDuplicateState(tx, userId, duplicate.linked_user_id)
      : { duplicateOf: null, objects: [] }),
  };
}

/**
 * The account a duplicate continues as, and the things the duplicate still
 * owns that it does not, with their other owners (PS-ADM-009).
 */
async function loadDuplicateState(
  tx: Kysely<Database>,
  userId: string,
  continuedUserId: string,
): Promise<Pick<CaseSubjectAccount, "duplicateOf" | "objects">> {
  const objects = await tx
    .selectFrom("app.objects as object")
    .innerJoin("app.object_owners as owner", "owner.object_id", "object.id")
    .select(["object.id", "object.title"])
    .where("owner.user_id", "=", userId)
    .where((eb) =>
      eb.not(
        eb.exists(
          eb
            .selectFrom("app.object_owners as continued")
            .select("continued.object_id")
            .whereRef("continued.object_id", "=", "object.id")
            .where("continued.user_id", "=", continuedUserId),
        ),
      ),
    )
    .orderBy("object.title")
    .orderBy("object.id")
    .execute();
  const others =
    objects.length === 0
      ? []
      : await tx
          .selectFrom("app.object_owners")
          .select(["object_id", "user_id"])
          .where(
            "object_id",
            "in",
            objects.map(({ id }) => id),
          )
          .where("user_id", "!=", userId)
          .orderBy("added_at")
          .execute();
  const names = await realNames(tx, [
    continuedUserId,
    ...others.map(({ user_id }) => user_id),
  ]);
  const person = (id: string) => ({
    userId: id,
    realName: names.get(id) ?? null,
  });

  return {
    duplicateOf: person(continuedUserId),
    objects: objects.map(({ id, title }) => ({
      objectId: id,
      title,
      coOwners: others
        .filter(({ object_id }) => object_id === id)
        .map(({ user_id }) => person(user_id)),
    })),
  };
}

/**
 * PS-ADM-014: the interventions taken from a case, with their bases, for
 * whoever may handle it, and the account it is about as it stands now.
 */
export const listCaseInterventions = defineQuery({
  name: "case.read_interventions",
  input: caseInterventionsQuerySchema,
  policy: readCaseInterventionsPolicy,
  load: ({ db, actor, input, now }) =>
    inSnapshot(db, async (tx) => {
      const loaded = await loadCase(tx, actor, input.caseId, now);

      if (!loaded) {
        return null;
      }

      // Nothing is read for callers the policy will turn away.
      const { standing } = loaded.resource;
      const rows =
        standing.holdsRole && !standing.involved
          ? await tx
              .selectFrom("app.platform_interventions")
              .selectAll()
              .where("case_id", "=", input.caseId)
              .orderBy("decided_at")
              .orderBy("id")
              .execute()
          : [];
      const ids = (
        key:
          | "user_id"
          | "other_user_id"
          | "decided_by_user_id"
          | "environment_id"
          | "object_id",
      ) => rows.flatMap((row) => row[key] ?? []);
      const userIds = [
        ...new Set([
          ...ids("user_id"),
          ...ids("other_user_id"),
          ...ids("decided_by_user_id"),
        ]),
      ];
      const names = await realNames(tx, userIds);
      const environmentIds = [...new Set(ids("environment_id"))];
      const objectIds = [...new Set(ids("object_id"))];
      const environments =
        environmentIds.length === 0
          ? []
          : await tx
              .selectFrom("app.environments")
              .select(["id", "name"])
              .where("id", "in", environmentIds)
              .execute();
      const objects =
        objectIds.length === 0
          ? []
          : await tx
              .selectFrom("app.objects")
              .select(["id", "title"])
              .where("id", "in", objectIds)
              .execute();
      const subjectUserId = loaded.resource.case.subjectUserId;
      const account =
        standing.holdsRole && !standing.involved && subjectUserId
          ? await loadSubjectAccount(tx, subjectUserId)
          : null;

      return {
        resource: {
          ...loaded.resource,
          rows,
          people: userIds.map((userId) => ({
            userId,
            realName: names.get(userId) ?? null,
          })),
          environments,
          objects,
          account,
        },
        context: undefined,
      };
    }),
  present: ({ resource }): CaseInterventions => ({
    caseId: resource.case.id,
    account: resource.account,
    people: resource.people,
    environments: resource.environments.map(({ id, name }) => ({ id, name })),
    objects: resource.objects.map(({ id, title }) => ({ id, title })),
    items: resource.rows.map((row) => ({
      id: row.id,
      kind: row.kind as PlatformInterventionKind,
      userId: row.user_id,
      otherUserId: row.other_user_id,
      environmentId: row.environment_id,
      objectId: row.object_id,
      basis: row.basis,
      decidedByUserId: row.decided_by_user_id,
      decidedAt: row.decided_at.toISOString(),
    })),
  }),
});
