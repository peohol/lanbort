import { z } from "zod";

/**
 * - `domain`: explains the product's actual course of events and may later be
 *   shown to the people involved.
 * - `audit`: administrative or security-relevant actions that must be
 *   verifiable afterwards, normally not shown broadly
 *   (docs/architecture/06-hendelser-historikk-og-revisjon.md).
 */
export type EventKind = "domain" | "audit";

export interface EventDefinition<P> {
  readonly type: string;
  readonly version: number;
  readonly kind: EventKind;
  readonly resourceType: string;
  readonly payload: z.ZodType<P>;
}

const eventTypePattern = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;
const resourceTypePattern = /^[a-z][a-z0-9_]{0,63}$/;

/**
 * Declares an event type. The payload schema must be a strict object, so an
 * event can only ever carry the explicitly listed minimal fields; anything
 * else (names, e-mail addresses, free text copied in by mistake) fails.
 */
export function defineEvent<Shape extends z.ZodRawShape>(definition: {
  type: string;
  version: number;
  kind: EventKind;
  resourceType: string;
  payload: z.ZodObject<Shape>;
}): EventDefinition<z.infer<z.ZodObject<Shape>>> {
  if (!eventTypePattern.test(definition.type)) {
    throw new Error(`Invalid event type: ${definition.type}`);
  }

  if (!Number.isInteger(definition.version) || definition.version < 1) {
    throw new Error(`Invalid version for event ${definition.type}`);
  }

  if (!resourceTypePattern.test(definition.resourceType)) {
    throw new Error(`Invalid resource type for event ${definition.type}`);
  }

  if (
    z.toJSONSchema(definition.payload, { io: "input" }).additionalProperties !==
    false
  ) {
    throw new Error(
      `Event ${definition.type} must use a strict payload schema (z.strictObject).`,
    );
  }

  return Object.freeze({ ...definition });
}
