import {
  type LoanReviewResult,
  loanReviewResponseResultSchema,
  loanReviewResultSchema,
  respondToLoanReviewSchema,
  submitLoanReviewSchema,
} from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import type { Kysely, Transaction } from "kysely";
import { z } from "zod";
import type { Actor } from "../actor";
import { defineCommand } from "../commands/command";
import { DomainError } from "../errors";
import type { EventRecorder } from "../events/recorder";
import { loadLoan, type LoadedLoan } from "../loans/resources";
import { settleDueReturns } from "../loans/return";
import { actingUserId } from "../objects/state";
import {
  loanReviewPublished,
  loanReviewResponded,
  loanReviewRevised,
  loanReviewSubmitted,
} from "./events";
import {
  otherSide,
  type ReviewWindowRecord,
  reviewRefusal,
  sameScores,
  validateReview,
  windowOver,
  windowParty,
} from "./model";
import {
  publishDueLoanReviewsPolicy,
  type ReviewPartiesResource,
  respondToLoanReviewPolicy,
  reviewRoleOf,
  submitLoanReviewPolicy,
} from "./policies";
import {
  closeReviewWindow,
  findReviewWindow,
  findReviews,
  insertResponse,
  insertReview,
  loadDimensions,
  lockDueReviewWindows,
  reviseReview,
} from "./store";

/**
 * Reviews after a loan (WP-50, PS-TRUST-001–005): a party reviews the other
 * in the loan's review window, revises the review while it is hidden, and
 * responds once to the published review about them. The window itself
 * follows the loan in the database.
 */
type Db = Kysely<Database>;

function conflict(message: string, fields: readonly string[] = []): never {
  throw new DomainError("conflict", message, fields);
}

/** Who reviews whom: the window's parties, or the loan's before it ended. */
export function reviewParties(
  loan: Pick<LoadedLoan, "borrowerUserId" | "responsibleLenderId">,
  window: ReviewWindowRecord | null,
): ReviewPartiesResource {
  return (
    window ?? {
      borrowerUserId: loan.borrowerUserId,
      lenderUserId: loan.responsibleLenderId,
    }
  );
}

interface ReviewTarget extends ReviewPartiesResource {
  readonly loaded: LoadedLoan;
}

/**
 * The loan, locked like every loan command locks it (its object, then the
 * loan), then its review window, with the parties the policy decides on.
 */
async function loadReviewTarget(tx: Transaction<Database>, loanId: string) {
  const loaded = await loadLoan(tx, loanId, { lock: true });

  if (!loaded) {
    return null;
  }

  const window = await findReviewWindow(tx, loanId, { lock: true });

  return {
    resource: { ...reviewParties(loaded, window), loaded },
    context: undefined,
  };
}

/**
 * Closes a window whose time is over as of when it was over, which
 * publishes the reviews given in it then (PS-TRUST-003). Returns how many
 * were published.
 */
async function closeDueWindow(
  db: Db,
  window: ReviewWindowRecord,
  events: EventRecorder,
): Promise<number> {
  if (window.dueAt === null) {
    throw new Error("An open review window has a deadline");
  }

  const hidden = (await findReviews(db, window.loanId)).filter(
    (review) => review.status === "hidden",
  );
  await closeReviewWindow(db, {
    loanId: window.loanId,
    as: "deadline",
    at: window.dueAt,
  });

  for (const review of hidden) {
    events.record(loanReviewPublished, {
      resourceId: review.id,
      payload: {
        loanId: window.loanId,
        authorRole: review.authorRole,
        basis: "deadline",
      },
    });
  }

  return hidden.length;
}

/**
 * Before a review command decides anything: return confirmations that are
 * due are made first, as in every loan command (a receipt that took effect
 * may have ended the loan and opened its window), and a window whose time
 * is over is closed. Returns the window as it is then, and the caller's
 * side in it.
 */
async function settleReviews(
  db: Db,
  actor: Actor,
  target: ReviewTarget,
  now: Date,
  events: EventRecorder,
): Promise<{ window: ReviewWindowRecord | null; role: "borrower" | "lender" }> {
  await settleDueReturns(db, target.loaded.loan, now, events);
  let window = await findReviewWindow(db, target.loaded.loan.id, {
    lock: true,
  });

  if (window && windowOver(window, now)) {
    await closeDueWindow(db, window, events);
    window = await findReviewWindow(db, window.loanId);
  }

  const role = reviewRoleOf(actor, reviewParties(target.loaded, window));

  if (!role) {
    throw new Error("The policy allows only a party of the loan's reviews");
  }

  return { window, role };
}

/**
 * PS-TRUST-001–004: a party reviews the other party of an ended loan, in one
 * transaction (docs/architecture/05):
 * 1. the loan's object, the loan and its review window are locked, so both
 *    parties' reviews, the loan's own commands and the publication job run
 *    one after another; due return confirmations are made first, and a
 *    window whose time is over is closed;
 * 2. the window is open: the loan has ended, has not reopened since
 *    (PS-TRUST-008), and its 14 days are not over;
 * 3. the review scores exactly the dimensions the ending lets the caller's
 *    side assess, each 1–5, with a short explanation if any score is 1 or 2
 *    (PS-TRUST-001/002);
 * 4. a first review is hidden (PS-TRUST-003). If the other party has
 *    reviewed already, the window closes and both are published at once;
 *    otherwise it waits for the other party or the deadline;
 * 5. a hidden review is revised by sending it again with the version the
 *    caller saw (`expectedVersion`); the same content again changes nothing.
 * Nothing social is checked: a block does not take an earned review away
 * (PS-TRUST-009).
 */
export const submitLoanReview = defineCommand({
  name: "loan_review.submit",
  input: submitLoanReviewSchema,
  output: loanReviewResultSchema,
  policy: submitLoanReviewPolicy,
  idempotency: "required",
  load: ({ tx, input }) => loadReviewTarget(tx, input.loanId),
  execute: async ({
    tx,
    actor,
    input,
    resource,
    events,
    now,
  }): Promise<LoanReviewResult> => {
    const { window, role } = await settleReviews(
      tx,
      actor,
      resource,
      now,
      events,
    );
    const refusal = reviewRefusal(window, now);

    if (refusal || !window) {
      conflict(refusal ?? "The loan has not ended");
    }

    const text = input.text ?? null;
    const scores = validateReview(
      input.scores,
      text,
      await loadDimensions(tx, role, window.basis),
    );
    const reviews = await findReviews(tx, window.loanId, { lock: true });
    const own = reviews.find((review) => review.authorRole === role);
    const result = (reviewId: string, version: number) => ({
      loanId: window.loanId,
      reviewId,
      version,
      status: "hidden" as const,
    });

    if (own) {
      if (input.expectedVersion !== own.version) {
        conflict("The review has changed", ["expectedVersion"]);
      }

      if (own.text === text && sameScores(own.scores, scores)) {
        return result(own.id, own.version);
      }

      const version = await reviseReview(tx, {
        review: own,
        text,
        scores,
        now,
      });
      events.record(loanReviewRevised, {
        resourceId: own.id,
        payload: { loanId: window.loanId, authorRole: role, version },
      });

      return result(own.id, version);
    }

    if (input.expectedVersion !== undefined) {
      conflict("There is no review to revise", ["expectedVersion"]);
    }

    const reviewId = await insertReview(tx, {
      loanId: window.loanId,
      role,
      authorUserId: actingUserId(actor),
      subjectUserId: windowParty(window, otherSide(role)),
      text,
      scores,
      now,
    });
    events.record(loanReviewSubmitted, {
      resourceId: reviewId,
      payload: { loanId: window.loanId, authorRole: role },
    });

    const other = reviews.find((review) => review.authorRole !== role);

    if (!other) {
      return result(reviewId, 1);
    }

    await closeReviewWindow(tx, {
      loanId: window.loanId,
      as: "both_submitted",
      at: now,
    });

    for (const [id, authorRole] of [
      [other.id, other.authorRole],
      [reviewId, role],
    ] as const) {
      events.record(loanReviewPublished, {
        resourceId: id,
        payload: { loanId: window.loanId, authorRole, basis: "both_submitted" },
      });
    }

    return { ...result(reviewId, 1), status: "published" };
  },
});

/**
 * PS-TRUST-005: the reviewed party gives one response to the published
 * review about them. It is shown with the review, changes no score and
 * opens no discussion: the author cannot answer it, and nobody can change
 * it. The same response again returns it; another one is refused. A block
 * between the parties does not take it away (PS-TRUST-009).
 */
export const respondToLoanReview = defineCommand({
  name: "loan_review.respond",
  input: respondToLoanReviewSchema,
  output: loanReviewResponseResultSchema,
  policy: respondToLoanReviewPolicy,
  idempotency: "required",
  load: ({ tx, input }) => loadReviewTarget(tx, input.loanId),
  execute: async ({ tx, actor, input, resource, events, now }) => {
    const { window, role } = await settleReviews(
      tx,
      actor,
      resource,
      now,
      events,
    );
    const about =
      window &&
      (await findReviews(tx, window.loanId, { lock: true })).find(
        (review) =>
          review.authorRole === otherSide(role) &&
          review.status === "published",
      );

    if (!about) {
      conflict("No published review about you");
    }

    const response = (at: Date) => ({
      loanId: about.loanId,
      reviewId: about.id,
      respondedAt: at.toISOString(),
    });

    if (about.response) {
      if (about.response.text !== input.text) {
        conflict("You have responded already", ["text"]);
      }

      return response(about.response.at);
    }

    await insertResponse(tx, {
      reviewId: about.id,
      authorUserId: actingUserId(actor),
      text: input.text,
      now,
    });
    events.record(loanReviewResponded, {
      resourceId: about.id,
      payload: { loanId: about.loanId, authorRole: about.authorRole },
    });

    return response(now);
  },
});

/** How many windows one run of the job closes at most. */
const publicationBatchSize = 100;

/**
 * The scheduled job for PS-TRUST-003: closes review windows whose 14 days
 * are over, publishing the reviews given in them as of the deadline. Safe to
 * run repeatedly and concurrently: windows another run or a command holds
 * are skipped until the next run. Reads count a window as closed from its
 * deadline on anyway, so the job only records what already holds.
 */
export const publishDueLoanReviews = defineCommand({
  name: "loan_review.publish_due",
  input: z.strictObject({}),
  output: z.strictObject({ published: z.int().nonnegative() }),
  policy: publishDueLoanReviewsPolicy,
  idempotency: "none",
  load: async () => ({ resource: undefined, context: undefined }),
  execute: async ({ tx, events, now }) => {
    let published = 0;

    for (const window of await lockDueReviewWindows(
      tx,
      now,
      publicationBatchSize,
    )) {
      published += await closeDueWindow(tx, window, events);
    }

    return { published };
  },
});
