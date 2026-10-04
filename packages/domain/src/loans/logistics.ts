import {
  closeLoanLogisticsSchema,
  type LoanLogistics,
  loanLogisticsChannelSchema,
  loanLogisticsQuerySchema,
} from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import type { Kysely } from "kysely";
import { defineCommand } from "../commands/command";
import { defineQuery } from "../commands/query";
import { DomainError } from "../errors";
import { inSnapshot } from "../objects/state";
import { loanLogisticsClosedForSafety } from "./events";
import {
  closeChannel,
  findChannel,
  findChannelsOf,
  joins,
  type LoanLogisticsChannelRecord,
  presentChannel,
} from "./logistics-store";
import {
  closeLoanLogisticsPolicy,
  type LoanResource,
  readLoanLogisticsPolicy,
} from "./policies";
import { findLoan } from "./reservations";

/**
 * Loan logistics when the parties are blocked (WP-44, PS-COM-007). A block
 * closes ordinary private chat but never the loan (PS-USR-007): while it is
 * in progress, its parties get a narrow channel of their own for short
 * practical messages about the handover, the return, times, places and the
 * object. The database opens and closes it with the block and the loan; the
 * domain reads it and closes it early as a safety measure. Its messages are
 * end-to-end encrypted in a chat conversation of its own kind
 * (`chat/loan-logistics.ts`), which takes them only while it is open.
 */

type Db = Kysely<Database>;

/**
 * Whether the channel accepts messages, commits and welcomes from `userId`
 * now (ADR-0010 «WP-44»): `open` or `closed` for one of the two people it
 * joins, null for anyone else, who must get the same `not_found` as for a
 * channel that does not exist. The account standing that keeps what a loan
 * needs (`requireLoanStanding`) is the caller's policy to check.
 *
 * Call it with `lock` inside the transaction that accepts: a closing then
 * waits for it, so nothing is accepted after the channel closed.
 */
export async function loanLogisticsGate(
  db: Db,
  channelId: string,
  userId: string,
  options: { lock?: boolean } = {},
): Promise<"open" | "closed" | null> {
  const channel = await findChannel(
    db,
    channelId,
    options.lock ? { lock: "share" } : {},
  );

  if (!channel || !joins(channel, userId)) {
    return null;
  }

  return channel.closedAt === null ? "open" : "closed";
}

interface LoanLogisticsResource extends LoanResource {
  readonly channels: readonly LoanLogisticsChannelRecord[];
}

/**
 * The loan's logistics channels that joined the caller, newest first, for
 * the loan's parties now. At most one is open. A channel between the other
 * party and an earlier lender is never shown.
 */
export const readLoanLogistics = defineQuery({
  name: "loan.read_logistics",
  input: loanLogisticsQuerySchema,
  policy: readLoanLogisticsPolicy,
  load: ({ db, actor, input }) =>
    inSnapshot(db, async (tx) => {
      const loan = await findLoan(tx, { loanId: input.loanId });

      if (!loan) {
        return null;
      }

      const channels =
        actor.kind === "user"
          ? await findChannelsOf(tx, loan.id, actor.userId)
          : [];
      const resource: LoanLogisticsResource = {
        borrowerUserId: loan.borrowerUserId,
        responsibleLenderId: loan.responsibleLenderId,
        channels,
      };

      return { resource, context: undefined };
    }),
  present: ({ resource }): LoanLogistics => ({
    channels: resource.channels.map(presentChannel),
  }),
});

/**
 * PS-COM-007: closes the loan's open logistics channel early, for good,
 * because of harassment or a particular risk. Further follow-up goes through
 * the loan's structured actions and, where relevant, a case. The loan gets
 * no new channel with the same parties, also after a new block.
 *
 * Who may take the measure is not decided (OD-0020); until it is, only its
 * dedicated process can, and nothing runs it. Closing a channel already
 * closed for safety gives it back unchanged; one closed otherwise is final
 * already (`conflict`).
 */
export const closeLoanLogisticsForSafety = defineCommand({
  name: "loan_logistics.close_for_safety",
  input: closeLoanLogisticsSchema,
  output: loanLogisticsChannelSchema,
  policy: closeLoanLogisticsPolicy,
  idempotency: "required",
  load: async ({ tx, input }) => {
    const channel = await findChannel(tx, input.channelId, { lock: "update" });

    return channel && { resource: channel, context: undefined };
  },
  execute: async ({ tx, resource, events, now }) => {
    if (resource.closeReason === "safety") {
      return presentChannel(resource);
    }

    if (resource.closedAt !== null) {
      throw new DomainError("conflict", "The channel has closed already");
    }

    await closeChannel(tx, resource.id, "safety", now);
    events.record(loanLogisticsClosedForSafety, {
      resourceId: resource.id,
      payload: { loanId: resource.loanId },
    });

    return presentChannel({
      ...resource,
      closedAt: now,
      closeReason: "safety",
    });
  },
});
