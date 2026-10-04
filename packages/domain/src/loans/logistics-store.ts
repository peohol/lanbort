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
}

const channelColumns = [
  "id",
  "loan_id",
  "borrower_user_id",
  "lender_user_id",
  "opened_at",
  "closed_at",
  "close_reason",
] as const;

interface ChannelRow {
  readonly id: string;
  readonly loan_id: string;
  readonly borrower_user_id: string;
  readonly lender_user_id: string;
  readonly opened_at: Date;
  readonly closed_at: Date | null;
  readonly close_reason: string | null;
}

function toChannel(row: ChannelRow): LoanLogisticsChannelRecord {
  return {
    id: row.id,
    loanId: row.loan_id,
    borrowerUserId: row.borrower_user_id,
    lenderUserId: row.lender_user_id,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    closeReason: row.close_reason as LoanLogisticsCloseReason | null,
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
  const row = await db
    .selectFrom("app.loan_logistics_channels")
    .select(channelColumns)
    .where("id", "=", channelId)
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
  const row = await db
    .selectFrom("app.loan_logistics_channels")
    .select(channelColumns)
    .where("loan_id", "=", loanId)
    .where("closed_at", "is", null)
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
  const rows = await db
    .selectFrom("app.loan_logistics_channels")
    .select(channelColumns)
    .where("loan_id", "=", loanId)
    .where((eb) =>
      eb.or([
        eb("borrower_user_id", "=", userId),
        eb("lender_user_id", "=", userId),
      ]),
    )
    .orderBy("opened_at", "desc")
    .orderBy("id", "desc")
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
