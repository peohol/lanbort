import type { AccountDeletionStep } from "../account/deletion";

/**
 * PS-ADM-006 with the subscriptions of WP-63: they are the account's own
 * wishes to be told, so they go with it, and nothing is told about them
 * afterwards. Its questions and answers are shared with the others in the
 * thread and stay, without who wrote them (`presentQuestion`).
 */
export const subscriptionsStep: AccountDeletionStep = {
  name: "object_subscriptions",
  run: async (db, userId) => {
    await db
      .deleteFrom("app.object_subscriptions")
      .where("user_id", "=", userId)
      .execute();
  },
};
