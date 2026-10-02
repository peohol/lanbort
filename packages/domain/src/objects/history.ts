import {
  type ObjectChangeField,
  type ObjectHistory,
  objectHistoryQuerySchema,
  type ObjectRevision,
  type ObjectRevisionChange,
  objectRevisionFields,
  objectVersionSchema,
  revertObjectSchema,
} from "@lanbort/contracts";
import { z } from "zod";
import { defineCommand } from "../commands/command";
import { defineQuery } from "../commands/query";
import { DomainError } from "../errors";
import { type DateInterval, toApiInterval } from "./availability";
import { replaceAvailability, sameIntervals } from "./commands";
import { objectReverted } from "./events";
import { readObjectHistoryPolicy, revertObjectPolicy } from "./policies";
import {
  actingUserId,
  bumpVersion,
  inSnapshot,
  loadAvailability,
  loadLockedObject,
  loadObjectState,
  type ObjectState,
  requireSelectableCategory,
} from "./state";

/** Revisions per page of history. */
export const objectHistoryPageSize = 50;

const storedAvailability = z.array(
  z.strictObject({ from: z.iso.date(), until: z.iso.date().nullable() }),
);

interface RevisionRow {
  readonly version: number;
  readonly change: string;
  readonly reverted_to_version: number | null;
  readonly actor_user_id: string | null;
  readonly recorded_at: Date;
  readonly title: string;
  readonly category_id: string;
  readonly description: string;
  readonly loan_terms: string | null;
  readonly status: string;
  readonly availability: unknown;
  readonly image_ids: string[];
}

function contentOf(row: RevisionRow): ObjectRevision["content"] {
  return {
    title: row.title,
    categoryId: row.category_id,
    description: row.description,
    loanTerms: row.loan_terms,
    status: row.status as ObjectRevision["content"]["status"],
    availability: storedAvailability.parse(row.availability).map(toApiInterval),
    imageIds: row.image_ids,
  };
}

/** What differs from `previous`; everything when there is none. */
function changedFields(
  content: ObjectRevision["content"],
  previous: ObjectRevision["content"] | undefined,
): ObjectRevision["changedFields"] {
  const parts = (c: ObjectRevision["content"]) => ({
    title: c.title,
    categoryId: c.categoryId,
    description: c.description,
    loanTerms: c.loanTerms,
    status: c.status,
    availability: JSON.stringify(c.availability),
    images: c.imageIds.join(","),
  });
  const now = parts(content);
  const before = previous && parts(previous);

  return objectRevisionFields.filter(
    (field) => !before || now[field] !== before[field],
  );
}

/**
 * PS-OBJ-013: every version of the object, newest first, with who changed
 * what and when, so co-owners can follow each other's changes.
 */
export const getObjectHistory = defineQuery({
  name: "object.read_history",
  input: objectHistoryQuerySchema,
  policy: readObjectHistoryPolicy,
  load: ({ db, input }) =>
    inSnapshot(db, async (tx) => {
      const state = await loadObjectState(tx, input.objectId);

      if (!state) {
        return null;
      }

      let query = tx
        .selectFrom("app.object_revisions")
        .selectAll()
        .where("object_id", "=", state.objectId)
        .orderBy("version", "desc")
        // One more than a page: the previous version of the oldest one shown.
        .limit(objectHistoryPageSize + 1);

      if (input.beforeVersion !== undefined) {
        query = query.where("version", "<", input.beforeVersion);
      }

      return {
        resource: { ...state, revisions: await query.execute() },
        context: undefined,
      };
    }),
  present: ({ resource }): ObjectHistory => {
    const rows: RevisionRow[] = resource.revisions;
    const contents = rows.map(contentOf);
    const page = rows.slice(0, objectHistoryPageSize);

    return {
      revisions: page.map((row, index) => ({
        version: row.version,
        change: row.change as ObjectRevisionChange,
        revertedToVersion: row.reverted_to_version,
        actorUserId: row.actor_user_id,
        recordedAt: row.recorded_at.toISOString(),
        changedFields: changedFields(
          contents[index] as ObjectRevision["content"],
          contents[index + 1],
        ),
        content: contents[index] as ObjectRevision["content"],
      })),
      nextBeforeVersion:
        rows.length > objectHistoryPageSize
          ? (page.at(-1)?.version ?? null)
          : null,
    };
  },
});

async function loadRevision(
  tx: Parameters<typeof loadObjectState>[0],
  state: ObjectState,
  version: number,
) {
  const row = await tx
    .selectFrom("app.object_revisions")
    .selectAll()
    .where("object_id", "=", state.objectId)
    .where("version", "=", version)
    .executeTakeFirst();

  if (!row || version >= state.version) {
    throw new DomainError("invalid_input", "No earlier version", ["version"]);
  }

  return row;
}

/**
 * PS-OBJ-013: brings back the content of an earlier version (title,
 * category, description, terms and general availability) as a new version.
 * Later history stays. Images are not brought back: removed image files are
 * deleted. Co-owner restrictions still apply to the availability it brings
 * back, so a revert can never reopen a restricted period.
 */
export const revertObject = defineCommand({
  name: "object.revert",
  input: revertObjectSchema,
  output: objectVersionSchema,
  policy: revertObjectPolicy,
  idempotency: "required",
  load: ({ tx, input }) => loadLockedObject(tx, input.objectId),
  execute: async ({ tx, actor, input, resource, events, now }) => {
    if (input.expectedVersion !== resource.version) {
      throw new DomainError("conflict", "The object has changed", [
        "expectedVersion",
      ]);
    }

    const revision = await loadRevision(tx, resource, input.version);
    const availability: DateInterval[] = storedAvailability.parse(
      revision.availability,
    );
    const target = {
      title: revision.title,
      categoryId: revision.category_id,
      description: revision.description,
      loanTerms: revision.loan_terms,
    };
    const changed: ObjectChangeField[] = (
      ["title", "categoryId", "description", "loanTerms"] as const
    ).filter((field) => target[field] !== resource[field]);

    if (
      !sameIntervals(
        availability,
        (await loadAvailability(tx, [resource.objectId])).get(
          resource.objectId,
        ) ?? [],
      )
    ) {
      changed.push("availability");
      await replaceAvailability(tx, resource.objectId, availability);
    }

    if (changed.length === 0) {
      return { objectId: resource.objectId, version: resource.version };
    }

    if (changed.includes("categoryId")) {
      await requireSelectableCategory(tx, target.categoryId);
    }

    const version = await bumpVersion(
      tx,
      resource,
      now,
      {
        actorUserId: actingUserId(actor),
        change: "reverted",
        revertedToVersion: input.version,
      },
      {
        title: target.title,
        category_id: target.categoryId,
        description: target.description,
        loan_terms: target.loanTerms,
      },
    );
    events.record(objectReverted, {
      resourceId: resource.objectId,
      payload: {
        version,
        revertedToVersion: input.version,
        changedFields: changed,
      },
    });

    return { objectId: resource.objectId, version };
  },
});
