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
 * (migration `…_phase4_loan_logistics`); the domain only reads them and
 * closes one early as a safety measure.
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
  const row = await channels(db)
    .where("channel.id", "=", channelId)
    .$if(options.lock === "share", (query) => query.forShare())
    .$if(options.lock === "update", (query) => query.forUpdate())
    .executeTakeFirst();

  return row ? toChannel(row) : null;
}

/** The loan's open channel, locked for closing, or null. */
export async function findOpenChannel(
  db: Db,
  loanId: string,
): Promise<LoanLogisticsChannelRecord | null> {
  const row = await channels(db)
    .where("channel.loan_id", "=", loanId)
    .where("channel.closed_at", "is", null)
    .forUpdate()
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

/** Closes the open channel for `reason`; the database checks the reason. */
export async function closeChannel(
  db: Db,
  channelId: string,
  reason: LoanLogisticsCloseReason,
  at: Date,
): Promise<void> {
  await db
    .updateTable("app.loan_logistics_channels")
    .set({ closed_at: at, close_reason: reason })
    .where("id", "=", channelId)
    .where("closed_at", "is", null)
    .execute();
}

/**
 * Whether a channel on the loan between these two people was closed as a
 * safety measure, which keeps them from getting another.
 */
export async function hasSafetyClosure(
  db: Db,
  loanId: string,
  parties: { readonly borrowerUserId: string; readonly lenderUserId: string },
): Promise<boolean> {
  const row = await db
    .selectFrom("app.loan_logistics_channels")
    .select("id")
    .where("loan_id", "=", loanId)
    .where("borrower_user_id", "=", parties.borrowerUserId)
    .where("lender_user_id", "=", parties.lenderUserId)
    .where("close_reason", "=", "safety")
    .executeTakeFirst();

  return row !== undefined;
}

/**
 * Records a safety closure between people who were the loan's parties when
 * there is no channel to close: a restore re-applies the measure this way
 * (WP-72), so a later block cannot open another. The database allows no
 * other closed channel to be added.
 */
export async function insertSafetyClosure(
  db: Db,
  loanId: string,
  parties: { readonly borrowerUserId: string; readonly lenderUserId: string },
  at: Date,
): Promise<string> {
  const { id } = await db
    .insertInto("app.loan_logistics_channels")
    .values({
      loan_id: loanId,
      borrower_user_id: parties.borrowerUserId,
      lender_user_id: parties.lenderUserId,
      opened_at: at,
      closed_at: at,
      close_reason: "safety",
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  return id;
}
