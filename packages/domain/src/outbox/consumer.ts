/** A committed event as delivered to an outbox consumer. */
export interface StoredEvent {
  readonly id: string;
  readonly type: string;
  readonly version: number;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly correlationId: string | null;
  readonly occurredAt: Date;
  readonly payload: unknown;
}

export interface OutboxDelivery {
  /**
   * Stable for every attempt of this (event, consumer) pair. Consumers pass it
   * on as the idempotency key to external providers, so a retry after an
   * uncertain outcome cannot deliver the same side effect twice.
   */
  readonly messageId: string;
  /** 1 on the first attempt. */
  readonly attempt: number;
  readonly event: StoredEvent;
}

/**
 * An asynchronous side effect driven by committed events (ADR-0004). Delivery
 * is at-least-once, so `handle` must be idempotent per `messageId`.
 */
export interface OutboxConsumer {
  readonly name: string;
  readonly eventTypes: readonly string[];
  handle(delivery: OutboxDelivery): Promise<void>;
}

const consumerNamePattern = /^[a-z][a-z0-9_.-]{0,63}$/;
const errorCodePattern = /^[a-z0-9_.:-]{1,64}$/;

export function defineConsumer(consumer: OutboxConsumer): OutboxConsumer {
  if (!consumerNamePattern.test(consumer.name)) {
    throw new Error(`Invalid outbox consumer name: ${consumer.name}`);
  }

  if (consumer.eventTypes.length === 0) {
    throw new Error(`Outbox consumer ${consumer.name} handles no events.`);
  }

  return Object.freeze({ ...consumer });
}

/**
 * Thrown by a consumer to report a failure with a machine-readable code.
 * Permanent failures are not retried. Any other thrown error is recorded as a
 * retryable `unexpected_error` without its message, which may contain data.
 */
export class OutboxDeliveryError extends Error {
  constructor(
    readonly code: string,
    readonly permanent = false,
  ) {
    super(`Outbox delivery failed: ${code}`);
    this.name = "OutboxDeliveryError";

    if (!errorCodePattern.test(code)) {
      throw new Error(`Invalid outbox error code: ${code}`);
    }
  }
}

/** Which consumers receive which event types. */
export class ConsumerRegistry {
  private readonly byName = new Map<string, OutboxConsumer>();
  private readonly byEventType = new Map<string, OutboxConsumer[]>();

  constructor(consumers: readonly OutboxConsumer[] = []) {
    for (const consumer of consumers) {
      if (this.byName.has(consumer.name)) {
        throw new Error(`Duplicate outbox consumer: ${consumer.name}`);
      }

      this.byName.set(consumer.name, consumer);

      for (const type of consumer.eventTypes) {
        this.byEventType.set(type, [
          ...(this.byEventType.get(type) ?? []),
          consumer,
        ]);
      }
    }
  }

  consumersFor(eventType: string): readonly OutboxConsumer[] {
    return this.byEventType.get(eventType) ?? [];
  }

  get names(): readonly string[] {
    return [...this.byName.keys()];
  }

  get(name: string): OutboxConsumer | undefined {
    return this.byName.get(name);
  }
}
