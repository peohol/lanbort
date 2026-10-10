import { sql } from "kysely";
import { z } from "zod";
import { defineCommand } from "../commands/command";
import { pilotRetention } from "./model";
import { purgeExpiredDataPolicy } from "./policies";

const countSchema = z.number().int().nonnegative();

async function deleted(query: {
  executeTakeFirst(): Promise<{ numDeletedRows: bigint }>;
}): Promise<number> {
  return Number((await query.executeTakeFirst()).numDeletedRows);
}

/**
 * Deletes what the pilot's retention policy no longer keeps (OD-0002,
 * `pilotRetention`). Run by the scheduled job `/api/internal/retention`;
 * safe to run repeatedly and concurrently. It records no event: what it
 * deletes is not history anyone relies on, and `pnpm ops:restore finish`
 * runs it again on what a restore brings back.
 */
export const purgeExpiredData = defineCommand({
  name: "data.purge_expired",
  input: z.strictObject({}),
  output: z.strictObject({
    notifications: countSchema,
    emailDeliveries: countSchema,
    outboxMessages: countSchema,
    commandResults: countSchema,
    membershipAnswers: countSchema,
    rateLimits: countSchema,
  }),
  policy: purgeExpiredDataPolicy,
  idempotency: "none",
  load: async () => ({ resource: undefined, context: undefined }),
  execute: async ({ tx, now }) => {
    const before = (ms: number) => new Date(now.getTime() - ms);
    // A loan that is still reserved or active keeps its notifications: its
    // deadline reminders would otherwise be made again.
    const oldNotifications = tx
      .selectFrom("app.notifications as notification")
      .select("notification.id")
      .where(
        "notification.created_at",
        "<",
        before(pilotRetention.notificationsMs),
      )
      .where(
        sql<boolean>`not (notification.target_type = 'loan' and exists (
          select 1 from app.loans as loan
          where loan.id = notification.target_id
            and loan.status in ('reserved', 'active')
        ))`,
      );

    const emailDeliveries = await deleted(
      tx
        .deleteFrom("app.notification_deliveries")
        .where((eb) =>
          eb.or([
            eb.and([
              eb("status", "<>", "pending"),
              eb("finished_at", "<", before(pilotRetention.emailDeliveriesMs)),
            ]),
            eb("notification_id", "in", oldNotifications),
          ]),
        ),
    );

    return {
      notifications: await deleted(
        tx.deleteFrom("app.notifications").where("id", "in", oldNotifications),
      ),
      emailDeliveries,
      outboxMessages: await deleted(
        tx
          .deleteFrom("app.outbox_messages")
          .where("status", "=", "succeeded")
          .where("finished_at", "<", before(pilotRetention.outboxMessagesMs)),
      ),
      commandResults: await deleted(
        tx
          .deleteFrom("app.idempotency_records")
          .where("created_at", "<", before(pilotRetention.commandResultsMs)),
      ),
      membershipAnswers: await deleted(
        tx
          .deleteFrom("app.environment_membership_answers")
          .where("membership_id", "in", (eb) =>
            eb
              .selectFrom("app.environment_memberships")
              .select("id")
              .where("state", "=", "ended")
              .where(
                "ended_at",
                "<",
                before(pilotRetention.membershipAnswersMs),
              ),
          ),
      ),
      // Each use already removes some; this catches subjects gone quiet.
      // Rows a use holds are left for later, as there.
      rateLimits: Number(
        (
          await sql`
            delete from app.rate_limits as limits
            where (limits.rule, limits.subject_hash) in (
              select expired.rule, expired.subject_hash
              from app.rate_limits as expired
              where expired.available_at < ${now}
              for update skip locked
            )
          `.execute(tx)
        ).numAffectedRows ?? 0,
      ),
    };
  },
});
