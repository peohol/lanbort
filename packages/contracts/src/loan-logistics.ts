import { z } from "zod";
import { chatConversationIdSchema } from "./chat";
import { loanIdSchema } from "./loans";

/**
 * Loan logistics when the parties are blocked (WP-44, PS-COM-007). A block
 * closes ordinary private chat, but a loan in progress keeps its structured
 * actions, and its two parties get a narrow channel for short practical
 * messages about the handover, the return, times, places and the object.
 * It is its own kind of conversation, never ordinary chat, and only ever
 * about this one loan. The server alone opens and closes it; neither party
 * can close it while the loan is in progress, only mute or archive it for
 * themselves (OD-0020).
 */
export const loanLogisticsChannelIdSchema = z.uuid();

/**
 * Why a channel no longer accepts messages:
 * - `loan_ended`: the loan has ended;
 * - `parties_changed`: the responsible lender changed, so the channel no
 *   longer joins the loan's parties.
 */
export const loanLogisticsCloseReasonSchema = z.enum([
  "loan_ended",
  "parties_changed",
]);

export const loanLogisticsChannelSchema = z.strictObject({
  id: loanLogisticsChannelIdSchema,
  loanId: loanIdSchema,
  openedAt: z.iso.datetime(),
  /** Null while the channel is open. */
  closedAt: z.iso.datetime().nullable(),
  closeReason: loanLogisticsCloseReasonSchema.nullable(),
  /** Its encrypted conversation, once one of the parties has started it. */
  conversationId: chatConversationIdSchema.nullable(),
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
 * The channel's encrypted conversation (ADR-0010, WP-43): started by either
 * party while the channel is open, and the same one whoever asks again.
 */
export const startLoanLogisticsChatSchema = z.strictObject({
  channelId: loanLogisticsChannelIdSchema,
});

export type LoanLogisticsCloseReason = z.infer<
  typeof loanLogisticsCloseReasonSchema
>;
export type LoanLogisticsChannel = z.infer<typeof loanLogisticsChannelSchema>;
export type LoanLogisticsQuery = z.infer<typeof loanLogisticsQuerySchema>;
export type LoanLogistics = z.infer<typeof loanLogisticsSchema>;
export type StartLoanLogisticsChat = z.infer<
  typeof startLoanLogisticsChatSchema
>;
