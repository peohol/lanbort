import type { NotificationKind, NotificationTarget } from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import type { Kysely } from "kysely";
import type { EventDefinition } from "../events/catalog";
import type { StoredEvent } from "../outbox/consumer";
import type { NotificationDraft } from "./model";

export type Db = Kysely<Database>;

export interface RuleInput<P> {
  readonly db: Db;
  readonly event: StoredEvent;
  readonly payload: P;
  /** When the notification is made, for rules that read current access. */
  readonly now: Date;
}

/**
 * Who is told about one kind of committed event, and how. Rules read only
 * ids and codes from the event and the current state of the database, so a
 * notification never carries more than the recipient may already see.
 */
export interface NotificationRule {
  readonly eventType: string;
  drafts(
    input: Omit<RuleInput<unknown>, "payload">,
  ): Promise<NotificationDraft[]>;
}

export function notifyOn<P>(
  event: EventDefinition<P>,
  drafts: (
    input: RuleInput<P>,
  ) => Promise<readonly NotificationDraft[]> | readonly NotificationDraft[],
): NotificationRule {
  return {
    eventType: event.type,
    drafts: async (input) => [
      ...(await drafts({
        ...input,
        payload: event.payload.parse(input.event.payload),
      })),
    ],
  };
}

/** The same notification for each of `recipients`. */
export function tell(
  recipients: Iterable<string>,
  kind: NotificationKind,
  target: NotificationTarget,
  detail: string | null = null,
): NotificationDraft[] {
  return [...new Set(recipients)].map((recipientId) => ({
    recipientId,
    kind,
    target,
    detail,
  }));
}
