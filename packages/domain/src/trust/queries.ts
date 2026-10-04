import {
  type ProfileReview,
  type TrustProfile,
  trustProfileQuerySchema,
  trustReviewPageSize,
} from "@lanbort/contracts";
import type { Loaded } from "../commands/command";
import { defineQuery } from "../commands/query";
import { loadLenderScope } from "../loans/store";
import { inSnapshot } from "../objects/state";
import { otherSide, scoreContested } from "../reviews/model";
import { loadReviewScores, type StoredScore } from "../reviews/store";
import { type ScoreTally, summarizeRole } from "./model";
import {
  hasProfileAccess,
  type ProfileAccessResource,
  readTrustProfilePolicy,
} from "./policies";
import {
  countReviews,
  loadDimensionCodes,
  loadProfileAccess,
  loadProfileReviews,
  loadScoreTallies,
  type ProfileReviewRow,
} from "./store";
import { rateLimits } from "../abuse/rate-limits";

/** What the profile shows: null for callers the policy turns away. */
interface TrustProfileResource extends ProfileAccessResource {
  readonly detail: {
    readonly dimensions: Awaited<ReturnType<typeof loadDimensionCodes>>;
    readonly counts: Awaited<ReturnType<typeof countReviews>>;
    readonly tallies: readonly ScoreTally[];
    readonly reviews: readonly ProfileReviewRow[];
    readonly scores: ReadonlyMap<string, readonly StoredScore[]>;
  } | null;
}

function present(
  review: ProfileReviewRow,
  scores: readonly StoredScore[],
): ProfileReview {
  return {
    id: review.id,
    subjectRole: otherSide(review.reviewerRole),
    basis: review.basis,
    author: review.author,
    environment: review.environment,
    scores: scores.map((score) => ({
      dimension: score.dimension,
      score: score.score,
      contested: scoreContested(score, review.reopenedAt !== null),
    })),
    text: review.text,
    publishedAt: review.publishedAt.toISOString(),
    loanReopenedAt: review.reopenedAt?.toISOString() ?? null,
    response: review.response && {
      text: review.response.text,
      respondedAt: review.response.at.toISOString(),
    },
  };
}

/**
 * A person's trust profile (PS-TRUST-006–012), for themselves or for someone
 * with legitimate access to their profile: per role, what the published
 * reviews about them say on each dimension, and the reviews the reader may
 * read, newest first. The figures are the same for every reader; only which
 * reviews can be read differs.
 */
export const readTrustProfile = defineQuery({
  name: "trust_profile.read",
  input: trustProfileQuerySchema,
  policy: readTrustProfilePolicy,
  rateLimit: rateLimits.lookups,
  load: ({ db, actor, input, now }) =>
    inSnapshot(
      db,
      async (tx): Promise<Loaded<TrustProfileResource, void> | null> => {
        if (actor.kind !== "user") {
          return null;
        }

        const viewer = await loadLenderScope(tx, actor.userId, now);
        const access = await loadProfileAccess(
          tx,
          actor.userId,
          input.userId,
          viewer,
          now,
        );

        if (!access) {
          return null;
        }

        // Nothing more is read for callers the policy will turn away.
        if (!hasProfileAccess(actor.userId, access)) {
          return {
            resource: { ...access, detail: null },
            context: undefined,
          };
        }

        // One connection serves the snapshot, so these run one after another.
        const dimensions = await loadDimensionCodes(tx);
        const counts = await countReviews(tx, input.userId, now);
        const tallies = await loadScoreTallies(tx, input.userId, now);
        const reviews = await loadProfileReviews(tx, {
          subjectUserId: input.userId,
          viewer,
          role: input.role,
          cursor: input.cursor,
          limit: trustReviewPageSize + 1,
          now,
        });
        const scores = await loadReviewScores(
          tx,
          reviews.map((review) => review.id),
        );

        return {
          resource: {
            ...access,
            detail: { dimensions, counts, tallies, reviews, scores },
          },
          context: undefined,
        };
      },
    ),
  present: ({ input, resource }): TrustProfile => {
    const { detail } = resource;

    if (!detail) {
      throw new Error("The policy allows only readers with profile access");
    }

    const { dimensions, counts, tallies, reviews, scores } = detail;
    const page = reviews.slice(0, trustReviewPageSize);

    return {
      userId: input.userId,
      // What lenders said about them as a borrower, and the other way round.
      asBorrower: summarizeRole(
        "lender",
        dimensions.lender,
        counts.lender,
        tallies,
      ),
      asLender: summarizeRole(
        "borrower",
        dimensions.borrower,
        counts.borrower,
        tallies,
      ),
      reviews: page.map((review) =>
        present(review, scores.get(review.id) ?? []),
      ),
      nextCursor:
        reviews.length > trustReviewPageSize ? (page.at(-1)?.id ?? null) : null,
    };
  },
});
