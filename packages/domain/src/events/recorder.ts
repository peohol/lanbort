import type { Database } from "@lanbort/database";
import type { Kysely } from "kysely";
import type { Actor } from "../actor";
import type { ConsumerRegistry } from "../outbox/consumer";
import type { EventDefinition } from "./catalog";

interface PendingEvent {
  readonly definition: EventDefinition<unknown>;
  readonly resourceId: string;
  readonly payload: unknown;
  readonly causationEventId: string | undefined;
}

export interface RecordedEvent {
  readonly id: string;
  readonly type: string;
}

const resourceIdPattern = /^[A-Za-z0-9_.:-]{1,128}$/;

/**
 * Collects the events of one command. Payloads are validated against the
 * event's strict schema immediately, so an invalid event fails the command
 * before anything is committed.
 */
export class EventRecorder {
  private readonly events: PendingEvent[] = [];

  record<P>(
    definition: EventDefinition<P>,
    event: { resourceId: string; payload: P; causationEventId?: string },
  ): void {
    if (!resourceIdPattern.test(event.resourceId)) {
      throw new Error(`Invalid resource id for event ${definition.type}`);
    }

    this.events.push({
      definition: definition as EventDefinition<unknown>,
      resourceId: event.resourceId,
      payload: definition.payload.parse(event.payload),
      causationEventId: event.causationEventId,
    });
  }

  get pending(): readonly PendingEvent[] {
    return this.events;
  }
}

function actorColumns(actor: Actor) {
  switch (actor.kind) {
    case "user":
      return {
        actor_type: "user",
        actor_user_id: actor.userId,
        actor_process: null,
      };
    case "system":
      return {
        actor_type: "system",
        actor_user_id: null,
        actor_process: actor.process,
      };
    case "anonymous":
      throw new Error("Events must be attributed to a user or system actor.");
  }
}

/**
 * Appends the recorded events and their outbox messages. Must run inside the
 * transaction that makes the authoritative change, so either all of it is
 * committed or none of it is (ADR-0004).
 */
export async function writeEvents(
  tx: Kysely<Database>,
  recorder: EventRecorder,
  options: {
    actor: Actor;
    correlationId: string | null;
    consumers: ConsumerRegistry;
  },
): Promise<RecordedEvent[]> {
  const recorded: RecordedEvent[] = [];

  for (const event of recorder.pending) {
    const { id } = await tx
      .insertInto("app.audit_events")
      .values({
        kind: event.definition.kind,
        event_type: event.definition.type,
        event_version: event.definition.version,
        ...actorColumns(options.actor),
        resource_type: event.definition.resourceType,
        resource_id: event.resourceId,
        correlation_id: options.correlationId,
        causation_event_id: event.causationEventId ?? null,
        payload: JSON.stringify(event.payload),
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const consumers = options.consumers.consumersFor(event.definition.type);

    if (consumers.length > 0) {
      await tx
        .insertInto("app.outbox_messages")
        .values(
          consumers.map((consumer) => ({
            event_id: id,
            consumer: consumer.name,
          })),
        )
        .execute();
    }

    recorded.push({ id, type: event.definition.type });
  }

  return recorded;
}
