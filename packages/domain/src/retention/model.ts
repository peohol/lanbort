const day = 24 * 60 * 60 * 1000;

/**
 * The pilot's retention periods for data that is kept for a while and then
 * goes (OD-0002, docs/implementation/retention.md). Everything else follows
 * the account, the object or the shared history it belongs to. Read by the
 * scheduled job `/api/internal/retention` and nowhere else.
 */
export const pilotRetention = {
  /** In-app notifications, read or not, from when they were made. */
  notificationsMs: 180 * day,
  /** Finished e-mail deliveries (sent, skipped or failed). */
  emailDeliveriesMs: 30 * day,
  /** Outbox messages that succeeded. Failed ones stay until handled. */
  outboxMessagesMs: 30 * day,
  /** Stored results of idempotent commands, which repeat a retry's answer. */
  commandResultsMs: 30 * day,
  /** Answers given to join an environment, after the membership ended. */
  membershipAnswersMs: 90 * day,
} as const;
