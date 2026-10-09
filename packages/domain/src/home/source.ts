import {
  type HomeItem,
  type HomeItemKind,
  type NotificationTarget,
} from "@lanbort/contracts";
import type { Actor } from "../actor";
import type { DomainContext } from "../commands/command";
import { executeQuery, type QueryDefinition } from "../commands/query";
import { AuthorizationError } from "../errors";

/**
 * What a {@link HomeSource} reads with: the caller's own queries, all as of
 * the same moment, so each part of Home applies the same policy and shows
 * the same thing as the context it leads to.
 */
export interface HomeReader {
  readonly actor: Actor;
  /** The query as the caller; throws like `executeQuery`. */
  query<I, R, C, O>(query: QueryDefinition<I, R, C, O>, input: I): Promise<O>;
  /** The query as the caller, or null if they may not read it (now). */
  ifAllowed<I, R, C, O>(
    query: QueryDefinition<I, R, C, O>,
    input: I,
  ): Promise<O | null>;
}

/**
 * One domain's contribution to Home (UX-IA-005): the items that ask
 * something of the caller now, decided from what the domain's own queries
 * show them. New domains (cases, moderation) add a source instead of
 * changing Home.
 */
export interface HomeSource {
  readonly name: string;
  items(reader: HomeReader): Promise<readonly HomeItem[]>;
}

export function homeReader(
  domain: Pick<DomainContext, "db" | "clock">,
  actor: Actor,
): HomeReader {
  const query: HomeReader["query"] = (definition, input) =>
    executeQuery(domain, definition, { actor, input });

  return {
    actor,
    query,
    async ifAllowed(definition, input) {
      try {
        return await query(definition, input);
      } catch (error) {
        // Access can end between two reads; Home then shows nothing of it.
        if (error instanceof AuthorizationError) {
          return null;
        }

        throw error;
      }
    },
  };
}

/** A Home item; every detail it does not have is null. */
export function homeItem(
  kind: HomeItemKind,
  target: NotificationTarget,
  details: Partial<Omit<HomeItem, "kind" | "target">> = {},
): HomeItem {
  return {
    kind,
    target,
    title: null,
    role: null,
    person: null,
    via: null,
    period: null,
    day: null,
    dueAt: null,
    count: null,
    ...details,
  };
}
