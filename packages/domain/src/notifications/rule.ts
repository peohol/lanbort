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
  /**
   * Whether the user who acted is told too. Normally not, since they know
   * what they did; only when the event leaves them something to do
   * themselves or concerns something other than what they acted on.
   */
  readonly tellsActor: boolean;
  /**
   * What the notifications are keyed by (`recordNotifications`): normally
   * the event, so a redelivery makes nothing twice. A rule for something
   * several events announce together, such as both reviews of a loan
   * published at once, keys them by that one thing instead, so each
   * recipient is told once.
   */
  source(event: StoredEvent): string;
  drafts(
    input: Omit<RuleInput<unknown>, "payload">,
  ): Promise<NotificationDraft[]>;
}

export function notifyOn<P>(
  event: EventDefinition<P>,
  drafts: (
    input: RuleInput<P>,
  ) => Promise<readonly NotificationDraft[]> | readonly NotificationDraft[],
  {
    tellsActor = false,
    once,
  }: {
    readonly tellsActor?: boolean;
    /** One source for every event that announces the same thing. */
    readonly once?: (payload: P) => string;
  } = {},
): NotificationRule {
  return {
    eventType: event.type,
    tellsActor,
    source: (stored) =>
      once ? once(event.payload.parse(stored.payload)) : `event:${stored.id}`,
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

/**
 * `drafts` only while `query` still finds what the event announced. The
 * outbox runs after the fact, so an invitation or a proposal may already be
 * withdrawn; its notification would then lead to something the recipient
 * can no longer see.
 */
export async function whileStill(
  query: { executeTakeFirst(): Promise<unknown> },
  drafts: () => NotificationDraft[] | Promise<NotificationDraft[]>,
): Promise<NotificationDraft[]> {
  return (await query.executeTakeFirst()) === undefined ? [] : drafts();
}
