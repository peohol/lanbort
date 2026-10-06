import { z } from "zod";
import { environmentSummarySchema } from "./environment";
import { loanRequestRoleSchema } from "./loans";
import { notificationTargetSchema } from "./notifications";
import { calendarDateSchema } from "./objects";

/**
 * Home (UX-IA-005): what needs the user now, before anything else. Each
 * section is a reason to look, in the order Home shows them:
 * - `awaiting_you`: something only the user can do now;
 * - `unresolved`: a loan whose handover or return is not settled, waiting
 *   for the other side or for clarification;
 * - `upcoming`: the next handover or return day of a loan;
 * - `administration`: tasks of a role the user actually holds (UX-JRN-012).
 * Home is never a feed: nothing appears here that asks nothing of the user.
 */
export const homeSections = [
  "awaiting_you",
  "unresolved",
  "upcoming",
  "administration",
] as const;
export const homeSectionSchema = z.enum(homeSections);
export type HomeSection = z.infer<typeof homeSectionSchema>;

/**
 * Every kind of Home item and the section it belongs to. The section follows
 * from the kind, so the same situation is always shown the same way.
 */
export const homeItemKinds = {
  "loan_request.answer": "awaiting_you",
  "loan_request.confirm_terms": "awaiting_you",
  "loan_request.accept_responsibility": "awaiting_you",
  "loan.answer_amendment": "awaiting_you",
  "loan.answer_responsibility": "awaiting_you",
  "loan.take_over_responsibility": "awaiting_you",
  "loan.report_handover": "awaiting_you",
  "loan.report_return": "awaiting_you",
  "loan.confirm_return": "awaiting_you",
  "loan.write_review": "awaiting_you",
  "social.answer_friend_request": "awaiting_you",
  "object.answer_co_owner_invitation": "awaiting_you",
  "environment.answer_invitation": "awaiting_you",
  "environment.answer_requirements": "awaiting_you",
  "environment.confirm_membership": "awaiting_you",
  "environment.answer_role_invitation": "awaiting_you",
  "environment.answer_type_change": "awaiting_you",
  "loan.awaiting_handover": "unresolved",
  "loan.awaiting_return": "unresolved",
  "loan.late": "unresolved",
  "loan.disputed": "unresolved",
  "loan.handover": "upcoming",
  "loan.return": "upcoming",
  "environment.review_memberships": "administration",
  "environment.review_publications": "administration",
  "environment.claim_ownership": "administration",
  "environment.handle_cases": "administration",
} as const satisfies Record<string, HomeSection>;

export type HomeItemKind = keyof typeof homeItemKinds;

export const homeItemKindSchema = z.enum(
  Object.keys(homeItemKinds) as [HomeItemKind, ...HomeItemKind[]],
);

/**
 * One thing on Home and where it leads (the same targets as notifications).
 * It names only what the user already sees in that context: the object's
 * title in the loan's agreement, the environment's or the person's name.
 */
export const homeItemSchema = z.strictObject({
  kind: homeItemKindSchema,
  target: notificationTargetSchema,
  title: z.string().nullable(),
  /** The user's side of a loan or request. */
  role: loanRequestRoleSchema.nullable(),
  /** The handover or return day the item is about. */
  day: calendarDateSchema.nullable(),
  /** When the chance to act ends, if it does. */
  dueAt: z.iso.datetime().nullable(),
  /** How many waiting tasks an administration item stands for. */
  count: z.int().positive().nullable(),
});

export const homeOverviewSchema = z.strictObject({
  /** Every section in Home's order, empty ones included. */
  sections: z.array(
    z.strictObject({
      section: homeSectionSchema,
      items: z.array(homeItemSchema),
    }),
  ),
  /** Secondary: shortcuts to the user's own environments (UX-IA-004). */
  environments: z.array(environmentSummarySchema),
});

export type HomeItem = z.infer<typeof homeItemSchema>;
export type HomeOverview = z.infer<typeof homeOverviewSchema>;
