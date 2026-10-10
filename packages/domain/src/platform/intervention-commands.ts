import {
  type CaseInterventions,
  caseInterventionsQuerySchema,
  endEnvironmentRolesResultSchema,
  endEnvironmentRolesSchema,
  openPlatformInquirySchema,
  type PlatformInterventionKind,
  platformInquiryOpenedSchema,
} from "@lanbort/contracts";
import type { AccountStatus } from "../actor";
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
 * PS-ADM-014: the interventions taken from a case, with their bases, for
 * whoever may handle it.
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

      return { resource: { ...loaded.resource, rows }, context: undefined };
    }),
  present: ({ resource }): CaseInterventions => ({
    caseId: resource.case.id,
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
