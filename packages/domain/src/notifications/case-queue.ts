import { z } from "zod";
import { defineCommand } from "../commands/command";
import { notifyCaseQueueReturnsPolicy } from "./policies";
import { waitingCase } from "./rules/cases";
import { recordNotifications } from "./store";

/** How many queue returns one run takes; the next run takes the rest. */
const batchSize = 200;

/**
 * Tells the handlers about cases the database returned to the queue by
 * itself (`returned_to_queue` in `app.case_actions`, WP-45): their handler
 * lost the role, the membership or the account, or became involved. Nothing
 * acted, so no domain event exists; each action is taken once
 * (`app.case_action_notices`, written with its notifications), so repeated
 * and concurrent runs tell nobody twice. Who is told is who may handle the
 * case when the job runs, and the notification carries no reason.
 */
export const notifyCaseQueueReturns = defineCommand({
  name: "notification.notify_case_queue_returns",
  input: z.strictObject({}),
  output: z.strictObject({ notified: z.int().nonnegative() }),
  policy: notifyCaseQueueReturnsPolicy,
  idempotency: "none",
  load: async () => ({ resource: undefined, context: undefined }),
  execute: async ({ tx, now }) => {
    const actions = await tx
      .selectFrom("app.case_actions as action")
      .select(["action.id", "action.case_id", "action.at"])
      .where("action.kind", "=", "returned_to_queue")
      .where(({ not, exists, selectFrom }) =>
        not(
          exists(
            selectFrom("app.case_action_notices as notice")
              .select("notice.action_id")
              .whereRef("notice.action_id", "=", "action.id"),
          ),
        ),
      )
      .orderBy("action.position")
      .limit(batchSize)
      .execute();
    let notified = 0;

    for (const action of actions) {
      // A concurrent run that took the action first has told them already.
      const taken = await tx
        .insertInto("app.case_action_notices")
        .values({ action_id: action.id, noticed_at: now })
        .onConflict((conflict) => conflict.column("action_id").doNothing())
        .returning("action_id")
        .executeTakeFirst();

      if (taken) {
        notified += await recordNotifications(
          tx,
          `case_action:${action.id}`,
          action.at,
          await waitingCase(tx, action.case_id, now),
        );
      }
    }

    return { notified };
  },
});
