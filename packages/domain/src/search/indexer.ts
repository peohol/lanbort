import type { Database } from "@lanbort/database";
import { type Kysely, sql } from "kysely";
import { z } from "zod";
import { defineCommand } from "../commands/command";
import {
  environmentCreated,
  environmentDetailsUpdated,
  environmentTypeChanged,
  environmentWindDownCancelled,
  environmentWindDownFinalized,
  environmentWindDownStarted,
} from "../environment/events";
import type { EventDefinition } from "../events/catalog";
import {
  objectArchived,
  objectDeleted,
  objectReverted,
  objectRestored,
  objectUpdated,
} from "../objects/events";
import { defineConsumer, type StoredEvent } from "../outbox/consumer";
import {
  publicationApproved,
  publicationBlocked,
  publicationCreated,
  publicationEnded,
  publicationPausedForApproval,
  publicationRejected,
  publicationReleasedFromApproval,
  publicationUnblocked,
  publicationWithdrawn,
} from "../publications/events";
import { reconcileSearchIndexPolicy } from "./policies";

type Db = Kysely<Database>;

/** Index rows to bring in line with the domain core. */
export interface SearchScope {
  readonly objectIds?: readonly string[];
  readonly environmentIds?: readonly string[];
}

/**
 * Rebuilds the given rows of the derived index from the authoritative tables
 * (`app.refresh_search_*`), and returns how many it changed. Idempotent, and
 * concurrent refreshes of the same row run one after another.
 */
export async function refreshSearchIndex(
  db: Db,
  { objectIds = [], environmentIds = [] }: SearchScope,
): Promise<number> {
  let changed = 0;

  if (objectIds.length > 0) {
    const { rows } = await sql<{ changed: number }>`
      select app.refresh_search_objects(${[...objectIds]}::uuid[]) as changed
    `.execute(db);
    changed += rows[0]?.changed ?? 0;
  }

  if (environmentIds.length > 0) {
    const { rows } = await sql<{ changed: number }>`
      select app.refresh_search_environments(${[...environmentIds]}::uuid[]) as changed
    `.execute(db);
    changed += rows[0]?.changed ?? 0;
  }

  return changed;
}

/**
 * What changes an object's searchable text or whether it can be found at
 * all: its content and lifecycle, and its publications.
 */
const objectEvents: readonly EventDefinition<unknown>[] = [
  objectUpdated,
  objectReverted,
  objectArchived,
  objectRestored,
  objectDeleted,
];

const publicationEvents: readonly EventDefinition<unknown>[] = [
  publicationCreated,
  publicationWithdrawn,
  publicationApproved,
  publicationRejected,
  publicationBlocked,
  publicationUnblocked,
  publicationPausedForApproval,
  publicationReleasedFromApproval,
  publicationEnded,
];

/** What changes an environment's text, type or whether it takes members. */
const environmentEvents: readonly EventDefinition<unknown>[] = [
  environmentCreated,
  environmentDetailsUpdated,
  environmentTypeChanged,
  environmentWindDownStarted,
  environmentWindDownCancelled,
  environmentWindDownFinalized,
];

/** Every publication event names its object. */
const publicationTarget = z.object({ objectId: z.uuid() });

/** The index rows an event can change. */
export function searchScopeOf(event: StoredEvent): SearchScope {
  switch (event.resourceType) {
    case "object":
      return { objectIds: [event.resourceId] };
    case "environment_publication":
      return {
        objectIds: [publicationTarget.parse(event.payload).objectId],
      };
    case "environment":
      return { environmentIds: [event.resourceId] };
    default:
      return {};
  }
}

export const searchIndexConsumerName = "search_index.refresh";

/**
 * Keeps the derived search index in line after each relevant change
 * (outbox, at-least-once; ADR-0005, docs/architecture/02 «Søk/geografi»).
 * Each delivery rebuilds the rows it concerns from the current state, so a
 * redelivery or an out-of-order delivery leaves the same result. Until it
 * runs, searches still decide access and availability against the domain
 * core; the index only lags behind in what text matches.
 */
export function searchIndexer({ db }: { readonly db: () => Db }) {
  return defineConsumer({
    name: searchIndexConsumerName,
    eventTypes: [
      ...objectEvents,
      ...publicationEvents,
      ...environmentEvents,
    ].map((event) => event.type),
    handle: async ({ event }) => {
      await refreshSearchIndex(db(), searchScopeOf(event));
    },
  });
}

/**
 * Rebuilds the whole index from the authoritative tables. Catches what
 * records no event, such as a publication that ended because its owners lost
 * access, and rebuilds the index after a restore (WP-72). Safe to run
 * repeatedly and concurrently.
 */
export const reconcileSearchIndex = defineCommand({
  name: "search_index.reconcile",
  input: z.strictObject({}),
  output: z.strictObject({ changed: z.int().nonnegative() }),
  policy: reconcileSearchIndexPolicy,
  idempotency: "none",
  load: async () => ({ resource: undefined, context: undefined }),
  execute: async ({ tx }) => {
    const { rows } = await sql<{ changed: number }>`
      select app.reconcile_search_index() as changed
    `.execute(tx);

    return { changed: rows[0]?.changed ?? 0 };
  },
});
