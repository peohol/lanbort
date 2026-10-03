import {
  type LoanRequestRole,
  type LoanReview,
  type LoanReviews,
  loanReviewsQuerySchema,
} from "@lanbort/contracts";
import type { Loaded } from "../commands/command";
import { defineQuery } from "../commands/query";
import { findLoan } from "../loans/reservations";
import { inSnapshot } from "../objects/state";
import { reviewParties } from "./commands";
import {
  otherSide,
  presentedWindowStatus,
  type ReviewDimension,
  type ReviewWindowRecord,
  windowOver,
} from "./model";
import {
  type ReviewPartiesResource,
  readLoanReviewsPolicy,
  reviewRoleOf,
} from "./policies";
import {
  findReviewWindow,
  findReviews,
  loadDimensions,
  type ReviewRecord,
  reopenedSince,
} from "./store";

/** A review with when its loan reopened after it was published, if it did. */
interface ReadReview extends ReviewRecord {
  readonly reopenedAt: Date | null;
}

/** What a party reads: null before the loan has ended, or for others. */
interface ReviewsResource extends ReviewPartiesResource {
  readonly role: LoanRequestRole | null;
  readonly detail: {
    readonly window: ReviewWindowRecord;
    readonly reviews: readonly ReadReview[];
    readonly dimensions: Readonly<
      Record<LoanRequestRole, readonly ReviewDimension[]>
    >;
  } | null;
}

/**
 * When the review counts as published as of `now`: when its window closed,
 * or, for a window whose time is over before the job recorded it, its
 * deadline (PS-TRUST-003). Null while it is hidden.
 */
function publishedAt(
  review: ReviewRecord,
  window: ReviewWindowRecord,
  now: Date,
): Date | null {
  return review.publishedAt ?? (windowOver(window, now) ? window.dueAt : null);
}

function present(
  review: ReadReview,
  window: ReviewWindowRecord,
  dimensions: readonly ReviewDimension[],
  now: Date,
): LoanReview {
  const published = publishedAt(review, window, now);
  const restsOnReturn = new Set(
    dimensions
      .filter((dimension) => dimension.restsOnReturn)
      .map(({ code }) => code),
  );

  return {
    id: review.id,
    authorRole: review.authorRole,
    status: published ? "published" : "hidden",
    version: review.version,
    scores: review.scores.map(({ dimension, score }) => ({
      dimension,
      score,
      contested: review.reopenedAt !== null && restsOnReturn.has(dimension),
    })),
    text: review.text,
    submittedAt: review.submittedAt.toISOString(),
    updatedAt: review.updatedAt.toISOString(),
    publishedAt: published?.toISOString() ?? null,
    loanReopenedAt: review.reopenedAt?.toISOString() ?? null,
    response: review.response && {
      text: review.response.text,
      respondedAt: review.response.at.toISOString(),
    },
  };
}

/**
 * The loan's reviews as one of its parties sees them (PS-TRUST-003/005): the
 * window and the dimensions they score, their own review whether hidden or
 * published, and the other party's review of them only once it is published,
 * each with its response. A published review whose loan reopened later says
 * so, and its scores that rest on the return are marked contested
 * (PS-TRUST-008). Hidden reviews of the other party are never shown, not
 * even whether one exists.
 */
export const readLoanReviews = defineQuery({
  name: "loan_review.read",
  input: loanReviewsQuerySchema,
  policy: readLoanReviewsPolicy,
  load: ({ db, actor, input, now }) =>
    inSnapshot(
      db,
      async (tx): Promise<Loaded<ReviewsResource, void> | null> => {
        const loan = await findLoan(tx, { loanId: input.loanId });

        if (!loan) {
          return null;
        }

        const window = await findReviewWindow(tx, loan.id);
        const parties = reviewParties(loan, window);
        const role = reviewRoleOf(actor, parties);

        // Nothing more is read for callers the policy will turn away.
        if (!role || !window) {
          return {
            resource: { ...parties, role, detail: null },
            context: undefined,
          };
        }

        const reviews: ReadReview[] = [];

        // One connection serves the snapshot, so these run one after another.
        for (const review of await findReviews(tx, loan.id)) {
          const published = publishedAt(review, window, now);
          reviews.push({
            ...review,
            reopenedAt:
              published && (await reopenedSince(tx, loan.id, published)),
          });
        }

        const dimensions = {
          borrower: await loadDimensions(tx, "borrower", window.basis),
          lender: await loadDimensions(tx, "lender", window.basis),
        };

        return {
          resource: {
            ...parties,
            role,
            detail: { window, reviews, dimensions },
          },
          context: undefined,
        };
      },
    ),
  present: ({ input, resource, now }): LoanReviews => {
    const { role, detail } = resource;

    if (!role) {
      throw new Error("The policy allows only a party of the loan's reviews");
    }

    if (!detail) {
      return {
        loanId: input.loanId,
        role,
        window: null,
        own: null,
        received: null,
      };
    }

    const { window, reviews, dimensions } = detail;
    const own = reviews.find((review) => review.authorRole === role);
    const received = reviews.find(
      (review) =>
        review.authorRole === otherSide(role) &&
        publishedAt(review, window, now) !== null,
    );

    return {
      loanId: input.loanId,
      role,
      window: {
        status: presentedWindowStatus(window, now),
        basis: window.basis,
        dueAt: window.dueAt?.toISOString() ?? null,
        dimensions: dimensions[role].map(({ code }) => code),
      },
      own: own ? present(own, window, dimensions[role], now) : null,
      received: received
        ? present(received, window, dimensions[otherSide(role)], now)
        : null,
    };
  },
});
