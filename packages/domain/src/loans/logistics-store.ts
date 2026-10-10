import type {
  LoanLogisticsChannel,
  LoanLogisticsCloseReason,
} from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import type { Kysely } from "kysely";

/**
 * Database access for loan logistics channels (WP-44, PS-COM-007). The
 * database opens a channel when a block comes between the parties of a loan
 * in progress, and closes it when the loan ends or its parties change
 * (migration `…_phase4_loan_logistics`); the domain only reads them.
 */
type Db = Kysely<Database>;

export interface LoanLogisticsChannelRecord {
  readonly id: string;
  readonly loanId: string;
  readonly borrowerUserId: string;
  readonly lenderUserId: string;
  readonly openedAt: Date;
  readonly closedAt: Date | null;
  readonly closeReason: LoanLogisticsCloseReason | null;
  /** Its encrypted conversation, once a party started it (WP-43). */
  readonly conversationId: string | null;
}

/** The channels, each with its conversation if it has one. */
const channels = (db: Db) =>
  db
    .selectFrom("app.loan_logistics_channels as channel")
    .select((eb) => [
      "channel.id",
      "channel.loan_id",
      "channel.borrower_user_id",
      "channel.lender_user_id",
      "channel.opened_at",
      "channel.closed_at",
      "channel.close_reason",
      eb
        .selectFrom("app.chat_conversations as conversation")
        .select("conversation.id")
        .whereRef("conversation.loan_logistics_channel_id", "=", "channel.id")
        .as("conversation_id"),
    ]);

type ChannelRow = Awaited<
  ReturnType<ReturnType<typeof channels>["executeTakeFirstOrThrow"]>
>;

function toChannel(row: ChannelRow): LoanLogisticsChannelRecord {
  return {
    id: row.id,
    loanId: row.loan_id,
    borrowerUserId: row.borrower_user_id,
    lenderUserId: row.lender_user_id,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    closeReason: row.close_reason as LoanLogisticsCloseReason | null,
    conversationId: row.conversation_id,
  };
}

/** Whether `userId` is one of the two people the channel joins. */
export const joins = (channel: LoanLogisticsChannelRecord, userId: string) =>
  userId === channel.borrowerUserId || userId === channel.lenderUserId;

export function presentChannel(
  channel: LoanLogisticsChannelRecord,
): LoanLogisticsChannel {
  return {
    id: channel.id,
    loanId: channel.loanId,
    openedAt: channel.openedAt.toISOString(),
    closedAt: channel.closedAt?.toISOString() ?? null,
    closeReason: channel.closeReason,
    conversationId: channel.conversationId,
  };
}

/**
 * The channel, or null. With `lock: "share"` a closing waits until the
 * transaction ends, so whatever it accepts was accepted while the channel
 * was open; with `lock: "update"` the caller is the one closing it.
 */
export async function findChannel(
  db: Db,
  channelId: string,
  options: { lock?: "share" | "update" } = {},
): Promise<LoanLogisticsChannelRecord | null> {
  if (
    options.lock &&
    !(await db
      .selectFrom("app.loan_logistics_channels")
      .select("id")
      .where("id", "=", channelId)
      .$if(options.lock === "share", (query) => query.forShare())
      .$if(options.lock === "update", (query) => query.forUpdate())
      .executeTakeFirst())
  ) {
    return null;
  }

  // Read in a statement of its own once the channel is held: one that
  // waited for the lock would still see its conversation as it was before.
  const row = await channels(db)
    .where("channel.id", "=", channelId)
    .executeTakeFirst();

  return row ? toChannel(row) : null;
}

/**
 * The loan's channels that joined `userId`, newest first. A party never sees
 * a channel between the other party and someone else (an earlier lender):
 * it would tell them about a block that is not theirs.
 */
export async function findChannelsOf(
  db: Db,
  loanId: string,
  userId: string,
): Promise<LoanLogisticsChannelRecord[]> {
  const rows = await channels(db)
    .where("channel.loan_id", "=", loanId)
    .where((eb) =>
      eb.or([
        eb("channel.borrower_user_id", "=", userId),
        eb("channel.lender_user_id", "=", userId),
      ]),
    )
    .orderBy("channel.opened_at", "desc")
    .orderBy("channel.id", "desc")
    .execute();

  return rows.map(toChannel);
}
