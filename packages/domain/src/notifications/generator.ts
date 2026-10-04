import type { Database } from "@lanbort/database";
import type { Kysely } from "kysely";
import { defineConsumer } from "../outbox/consumer";
import type { NotificationRule } from "./rule";
import { caseRules } from "./rules/cases";
import { loanRules } from "./rules/loans";
import { objectRules } from "./rules/objects";
import { relationRules } from "./rules/relations";
import { recordNotifications } from "./store";

/** Every event that makes notifications, and who it tells. */
export const notificationRules: readonly NotificationRule[] = [
  ...loanRules,
  ...relationRules,
  ...caseRules,
  ...objectRules,
];

export function rulesByEventType(rules: readonly NotificationRule[]) {
  const byType = new Map<string, NotificationRule>();

  for (const rule of rules) {
    if (byType.has(rule.eventType)) {
      throw new Error(`Two notification rules for ${rule.eventType}`);
    }

    byType.set(rule.eventType, rule);
  }

  return byType;
}

export const notificationConsumerName = "notifications.generate";

/**
 * Makes notifications from committed domain events (outbox, at-least-once;
 * docs/architecture/07, «Varsler»). Who is told is decided from the event's
 * ids and the current state. Nobody is told about what they did themselves,
 * unless the rule says it leaves them something to do (`tellsActor`).
 * Notifications are keyed by their event, so a redelivery makes nothing
 * twice. Who is told and the notifications are one transaction, so a rule
 * can hold still what it decided on until they are stored. A failure here is
 * retried on its own and never touches the domain change that recorded the
 * event (PS-COM-002).
 */
export function notificationGenerator({
  db,
  rules = notificationRules,
  clock = () => new Date(),
}: {
  readonly db: () => Kysely<Database>;
  readonly rules?: readonly NotificationRule[];
  readonly clock?: () => Date;
}) {
  const byType = rulesByEventType(rules);

  return defineConsumer({
    name: notificationConsumerName,
    eventTypes: [...byType.keys()],
    handle: async ({ event }) => {
      const rule = byType.get(event.type);

      if (!rule) {
        return;
      }

      await db()
        .transaction()
        .execute(async (tx) => {
          const drafts = await rule.drafts({ db: tx, event, now: clock() });

          await recordNotifications(
            tx,
            `event:${event.id}`,
            event.occurredAt,
            rule.tellsActor
              ? drafts
              : drafts.filter(
                  (draft) => draft.recipientId !== event.actorUserId,
                ),
          );
        });
    },
  });
}
