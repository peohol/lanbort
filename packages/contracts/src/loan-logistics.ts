import { z } from "zod";
import { loanIdSchema } from "./loans";

/**
 * Loan logistics when the parties are blocked (WP-44, PS-COM-007). A block
 * closes ordinary private chat, but a loan in progress keeps its structured
 * actions, and its two parties get a narrow channel for short practical
 * messages about the handover, the return, times, places and the object.
 * It is its own kind of conversation, never ordinary chat, and only ever
 * about this one loan. The server alone opens and closes it.
 */
export const loanLogisticsChannelIdSchema = z.uuid();

/**
 * Why a channel no longer accepts messages:
 * - `loan_ended`: the loan has ended;
 * - `parties_changed`: the responsible lender changed, so the channel no
 *   longer joins the loan's parties;
 * - `safety`: it was closed early because of harassment or a particular
 *   risk. Further follow-up goes through the loan's structured actions.
 */
export const loanLogisticsCloseReasonSchema = z.enum([
  "loan_ended",
  "parties_changed",
  "safety",
]);

export const loanLogisticsChannelSchema = z.strictObject({
  id: loanLogisticsChannelIdSchema,
  loanId: loanIdSchema,
  openedAt: z.iso.datetime(),
  /** Null while the channel is open. */
  closedAt: z.iso.datetime().nullable(),
  closeReason: loanLogisticsCloseReasonSchema.nullable(),
});

/** The logistics channels of a loan, for its parties now. */
export const loanLogisticsQuerySchema = z.strictObject({
  loanId: loanIdSchema,
});

/** Newest first; at most one is open. */
export const loanLogisticsSchema = z.strictObject({
  channels: z.array(loanLogisticsChannelSchema),
});

/**
 * OD-0020: closes the loan's open channel early, for good, because of
 * harassment or a particular risk. Who may do it is not decided; until it
 * is, only a dedicated process can.
 */
export const closeLoanLogisticsSchema = z.strictObject({
  channelId: loanLogisticsChannelIdSchema,
});

export type LoanLogisticsCloseReason = z.infer<
  typeof loanLogisticsCloseReasonSchema
>;
export type LoanLogisticsChannel = z.infer<typeof loanLogisticsChannelSchema>;
export type LoanLogisticsQuery = z.infer<typeof loanLogisticsQuerySchema>;
export type LoanLogistics = z.infer<typeof loanLogisticsSchema>;
export type CloseLoanLogistics = z.infer<typeof closeLoanLogisticsSchema>;
