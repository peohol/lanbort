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

/**
 * What a rule tells about an event: nobody is told about what they did
 * themselves, unless the rule says it leaves them something to do
 * (`tellsActor`).
 */
async function draftsOf(
  rule: NotificationRule,
  input: Parameters<NotificationRule["drafts"]>[0],
) {
  const drafts = await rule.drafts(input);

  return rule.tellsActor
    ? drafts
    : drafts.filter((draft) => draft.recipientId !== input.event.actorUserId);
}

/**
 * One rule per event type. An event can concern several groups (an edit of
 * an object tells waiting borrowers about new terms and subscribers about
 * new content), so the rules for one type are run together, each with its
 * own `tellsActor`; a person reached by more than one of them is told once
 * (`distinctDrafts`).
 */
export function rulesByEventType(rules: readonly NotificationRule[]) {
  const groups = new Map<string, NotificationRule[]>();

  for (const rule of rules) {
    groups.set(rule.eventType, [...(groups.get(rule.eventType) ?? []), rule]);
  }

  return new Map(
    [...groups].map(([eventType, group]): [string, NotificationRule] => [
      eventType,
      {
        eventType,
        // Each rule of the group has already left out the actor or not.
        tellsActor: true,
        drafts: async (input) => {
          const drafts = [];

          // One after another: the rules share the generator's connection.
          for (const rule of group) {
            drafts.push(...(await draftsOf(rule, input)));
          }

          return drafts;
        },
      },
    ]),
  );
}

export const notificationConsumerName = "notifications.generate";

/**
 * Makes notifications from committed domain events (outbox, at-least-once;
 * docs/architecture/07, «Varsler»). Who is told is decided from the event's
 * ids and the current state, and nobody is told about what they did
 * themselves unless the rule says so (`rulesByEventType`). Notifications
 * are keyed by their event, so a redelivery makes nothing twice. A failure here is retried on its own and never touches the
 * domain change that recorded the event (PS-COM-002).
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

      const database = db();

      await recordNotifications(
        database,
        `event:${event.id}`,
        event.occurredAt,
        await rule.drafts({ db: database, event, now: clock() }),
      );
    },
  });
}
