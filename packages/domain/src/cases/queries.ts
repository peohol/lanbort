import {
  type Case,
  type CaseList,
  caseListQuerySchema,
  casePageSize,
  caseReferenceSchema,
  type CaseSummary,
  environmentCaseQueueQuerySchema,
  platformCaseQueueQuerySchema,
} from "@lanbort/contracts";
import { realNames } from "../account/store";
import { defineQuery } from "../commands/query";
import { loadEnvironmentAccess } from "../environment/store";
import { actingUserId, inSnapshot } from "../objects/state";
import { loadCase } from "./commands";
import {
  type ActionRecord,
  type CaseRecord,
  type EntryRecord,
  handlingOf,
  type ParticipantRecord,
  platformCaseKinds,
  sharedUpTo,
  sharedWithParties,
  visibleToParticipant,
} from "./model";
import {
  listEnvironmentCaseQueuePolicy,
  listOwnCasesPolicy,
  listPlatformCaseQueuePolicy,
  readCasePolicy,
} from "./policies";
import {
  caseHandlers,
  handledBy,
  listCases,
  loadActions,
  loadCaseTitles,
  loadEntries,
  loadHandlingState,
  loadParticipants,
} from "./store";

/** What is read for a caller the policy will turn away. */
const nothingRead = {
  participants: [] as ParticipantRecord[],
  entries: [] as EntryRecord[],
  actions: [] as ActionRecord[],
  titles: { loanTitle: null, objectTitle: null },
  handlers: [] as string[],
  names: new Map<string, string>(),
};

/** Every user a case's rows name, for their names. */
function namedIn(
  c: CaseRecord,
  rows: {
    readonly participants: readonly { readonly userId: string }[];
    readonly entries: readonly EntryRecord[];
    readonly actions: readonly ActionRecord[];
    readonly handlers: readonly string[];
    readonly assigneeUserId: string | null;
  },
): string[] {
  return [
    c.subjectUserId,
    rows.assigneeUserId,
    ...rows.handlers,
    ...rows.participants.map(({ userId }) => userId),
    ...rows.entries.flatMap((entry) => [
      entry.authorUserId,
      entry.audienceUserId,
      ...entry.privateMessages.map(({ senderUserId }) => senderUserId),
    ]),
    ...rows.actions.flatMap(({ actorUserId, targetUserId }) => [
      actorUserId,
      targetUserId,
    ]),
  ].filter((userId): userId is string => userId !== null);
}

/**
 * A case as the caller sees it. A participant sees their own entries, what
 * was written to them, and whether someone handles it; a handler's entries
 * come from the function, not the person. A handler sees all of it, with its
 * history. A case holds only what was written in it: never private chat,
 * only the copies of private messages a participant chose to submit
 * (PS-COM-013).
 */
export const readCase = defineQuery({
  name: "case.read",
  input: caseReferenceSchema,
  policy: readCasePolicy,
  load: ({ db, actor, input, now }) =>
    inSnapshot(db, async (tx) => {
      const loaded = await loadCase(tx, actor, input.caseId, now);

      if (!loaded) {
        return null;
      }

      // Nothing more is read for callers the policy will turn away.
      const { participant, standing } = loaded.resource;
      const reads =
        participant !== null || (standing.holdsRole && !standing.involved);

      const c = loaded.resource.case;
      const handling = await loadHandlingState(tx, input.caseId, now);

      if (!reads) {
        return {
          resource: { ...loaded.resource, ...nothingRead, handling },
          context: undefined,
        };
      }

      const participants = await loadParticipants(tx, input.caseId);
      const entries = await loadEntries(tx, input.caseId);
      const actions = await loadActions(tx, input.caseId);
      const handlers =
        participant === null && c.status === "open"
          ? await caseHandlers(tx, input.caseId, now)
          : [];

      return {
        resource: {
          ...loaded.resource,
          participants,
          entries,
          actions,
          handling,
          titles: await loadCaseTitles(tx, c),
          handlers,
          names: await realNames(
            tx,
            namedIn(c, {
              participants,
              entries,
              actions,
              handlers,
              assigneeUserId: handling.assigneeUserId,
            }),
          ),
        },
        context: undefined,
      };
    }),
  present: ({ actor, resource }): Case => {
    const c = resource.case;
    const userId = actingUserId(actor);
    const asParty = resource.participant !== null;
    const shared = sharedUpTo(resource.actions);
    const { assigneeUserId, handlerAvailable } = resource.handling;
    const open = c.status === "open";

    const shown: Omit<Case, "people"> = {
      id: c.id,
      kind: c.kind,
      status: c.status,
      viewer: asParty ? "party" : "handler",
      environmentId: c.environmentId,
      loanId: c.loanId,
      subjectUserId: c.subjectUserId,
      reportTarget: c.reportTarget,
      objectId: c.objectId,
      reviewId: c.reviewId,
      escalatedFromCaseId: c.escalatedFromCaseId,
      openedAt: c.openedAt.toISOString(),
      closedAt: c.closedAt?.toISOString() ?? null,
      handling: handlingOf(assigneeUserId, handlerAvailable),
      assigneeUserId: asParty ? null : assigneeUserId,
      mayWrite: asParty
        ? open && (resource.participant?.mayWrite ?? false)
        : open && (assigneeUserId === null || assigneeUserId === userId),
      participants: resource.participants.map((participant) => ({
        userId: participant.userId,
        role: participant.role,
        mayWrite: open && participant.mayWrite,
      })),
      entries: resource.entries
        .filter(
          (entry) =>
            !asParty || visibleToParticipant(entry, userId, c.kind, shared),
        )
        .map((entry) => ({
          id: entry.id,
          capacity: entry.capacity,
          authorUserId:
            asParty && entry.capacity === "handler" ? null : entry.authorUserId,
          audience: entry.audience,
          toUserId: entry.audienceUserId,
          shared: sharedWithParties(entry, c.kind, shared),
          body: entry.body,
          privateMessages: entry.privateMessages.map((copy) => ({
            ...copy,
            sentAt: copy.sentAt.toISOString(),
          })),
          correctsEntryId: entry.correctsEntryId,
          createdAt: entry.createdAt.toISOString(),
        })),
      history: asParty
        ? []
        : resource.actions.map((action) => ({
            kind: action.kind,
            actorUserId: action.actorUserId,
            targetUserId: action.targetUserId,
            reason: action.reason,
            at: action.at.toISOString(),
          })),
      loanTitle: resource.titles.loanTitle,
      objectTitle: resource.titles.objectTitle,
      handlers: asParty
        ? []
        : resource.handlers.filter((handler) => handler !== userId),
    };

    return { ...shown, people: peopleNamedIn(shown, resource.names) };
  },
});

/** The name of each user the view names, and of nobody else. */
function peopleNamedIn(
  shown: Omit<Case, "people">,
  names: ReadonlyMap<string, string>,
): Case["people"] {
  const ids = new Set(
    [
      shown.subjectUserId,
      shown.assigneeUserId,
      ...shown.handlers,
      ...shown.participants.map(({ userId }) => userId),
      ...shown.entries.flatMap((entry) => [
        entry.authorUserId,
        entry.toUserId,
        ...entry.privateMessages.map(({ senderUserId }) => senderUserId),
      ]),
      ...shown.history.flatMap(({ actorUserId, targetUserId }) => [
        actorUserId,
        targetUserId,
      ]),
    ].filter((userId): userId is string => userId !== null),
  );

  return [...ids].map((userId) => ({
    userId,
    realName: names.get(userId) ?? null,
  }));
}

function summary(
  item: {
    readonly record: CaseRecord;
    readonly assigneeUserId: string | null;
    readonly handlerAvailable: boolean;
  },
  asHandler: boolean,
): CaseSummary {
  const { record } = item;

  return {
    id: record.id,
    kind: record.kind,
    status: record.status,
    environmentId: record.environmentId,
    loanId: record.loanId,
    openedAt: record.openedAt.toISOString(),
    closedAt: record.closedAt?.toISOString() ?? null,
    handling: handlingOf(item.assigneeUserId, item.handlerAvailable),
    assigneeUserId: asHandler ? item.assigneeUserId : null,
  };
}

const toList = (
  page: Awaited<ReturnType<typeof listCases>>,
  asHandler: boolean,
): CaseList => ({
  items: page.items.map((item) => summary(item, asHandler)),
  nextCursor: page.nextCursor,
});

/** The caller's own cases as a participant, newest first (UX-IA-007). */
export const listOwnCases = defineQuery({
  name: "case.list_own",
  input: caseListQuerySchema,
  policy: listOwnCasesPolicy,
  load: ({ db, actor, input, now }) =>
    inSnapshot(db, async (tx) => {
      const userId = actingUserId(actor);
      const page = await listCases(
        tx,
        (query) =>
          query.where((eb) =>
            eb.exists(
              eb
                .selectFrom("app.case_participants as participant")
                .select("participant.user_id")
                .whereRef("participant.case_id", "=", "c.id")
                .where("participant.user_id", "=", userId),
            ),
          ),
        { cursor: input.cursor, pageSize: casePageSize, now },
      );

      return { resource: toList(page, false), context: undefined };
    }),
  present: ({ resource }) => resource,
});

/**
 * The environment's cases its administrator may handle (UX-IA-007): not
 * those they are involved in (UX-JRN-012).
 */
export const listEnvironmentCaseQueue = defineQuery({
  name: "case.list_environment_queue",
  input: environmentCaseQueueQuerySchema,
  policy: listEnvironmentCaseQueuePolicy,
  load: ({ db, actor, input, now }) =>
    inSnapshot(db, async (tx) => {
      const access = await loadEnvironmentAccess(
        tx,
        input.environmentId,
        actor,
        now,
      );

      if (!access) {
        return null;
      }

      // Nothing more is read for callers the policy will turn away.
      const page =
        actor.kind === "user" && access.viewer.roles.includes("administrator")
          ? await listCases(
              tx,
              (query) =>
                query
                  .where("c.environment_id", "=", input.environmentId)
                  .where("c.status", "=", input.status)
                  .where(handledBy(actor.userId, now)),
              { cursor: input.cursor, pageSize: casePageSize, now },
            )
          : { items: [], nextCursor: null };

      return {
        resource: { ...access, list: toList(page, true) },
        context: undefined,
      };
    }),
  present: ({ resource }) => resource.list,
});

/** The platform's cases (reports) a platform steward may handle. */
export const listPlatformCaseQueue = defineQuery({
  name: "case.list_platform_queue",
  input: platformCaseQueueQuerySchema,
  policy: listPlatformCaseQueuePolicy,
  load: ({ db, actor, input, now }) =>
    inSnapshot(db, async (tx) => {
      const userId = actingUserId(actor);
      const page = await listCases(
        tx,
        (query) =>
          query
            .where("c.kind", "in", platformCaseKinds)
            .where("c.status", "=", input.status)
            .where(handledBy(userId, now)),
        { cursor: input.cursor, pageSize: casePageSize, now },
      );

      return { resource: toList(page, true), context: undefined };
    }),
  present: ({ resource }) => resource,
});
