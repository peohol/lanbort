import type { NotificationTarget } from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import type { Kysely } from "kysely";
import { whereUserFinds } from "../publications/queries";
import { loadQuestion, seesQuestion } from "../questions/store";

/**
 * Whether a notification that already exists still concerns its recipient.
 * Most targets are theirs for good (their loan, their invitation). A
 * subscription or a question is seen only through an environment
 * (PS-OBJ-014–015): once the subscription has ended, or the recipient no
 * longer finds the object there, the notification must not lead on to
 * anything, such as an e-mail sent later (WP-41). Opening it in the app
 * checks the same again.
 */
export async function stillConcerns(
  db: Kysely<Database>,
  notification: {
    readonly recipientId: string;
    readonly target: NotificationTarget;
  },
  now: Date,
): Promise<boolean> {
  const { recipientId, target } = notification;

  switch (target.type) {
    case "object_subscription": {
      const subscription = await db
        .selectFrom("app.object_subscriptions")
        .select("object_id")
        .where("id", "=", target.id)
        .where("user_id", "=", recipientId)
        .executeTakeFirst();

      return (
        subscription !== undefined &&
        (
          await whereUserFinds(db, recipientId, [subscription.object_id], now)
        ).has(subscription.object_id)
      );
    }
    case "object_question": {
      const question = await loadQuestion(db, target.id);

      return (
        question !== null &&
        (await seesQuestion(db, question, recipientId, now))
      );
    }
    default:
      return true;
  }
}
