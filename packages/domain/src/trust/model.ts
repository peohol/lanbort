import type {
  DimensionTrust,
  LoanRequestRole,
  RoleTrust,
} from "@lanbort/contracts";
import { scoreContested } from "../reviews/model";

/**
 * Pure rules of contextual trust (WP-51, PS-TRUST-006–012). A person's trust
 * is derived from the published reviews about them each time it is read:
 * - per role, never mixed: as a borrower from what lenders said, as a lender
 *   from what borrowers said, each on its own dimensions (PS-TRUST-006);
 * - as counts, a plain mean and the spread over 1–5, with no weighting of
 *   reviewers (PS-TRUST-012) and no overall score of the person;
 * - from reviews only: reports, blocks and conflicts never count
 *   (PS-TRUST-010);
 * - without the scores a reopened loan has put in doubt (PS-TRUST-008).
 */

/** Published scores as the store counts them: one row per kind of score. */
export interface ScoreTally {
  /** The reviewer's side; the person reviewed had the other one. */
  readonly reviewerRole: LoanRequestRole;
  readonly dimension: string;
  readonly score: number;
  readonly restsOnReturn: boolean;
  /** The loan reopened after the review was published. */
  readonly reopened: boolean;
  readonly count: number;
}

const roundedMean = (sum: number, count: number) =>
  count === 0 ? null : Math.round((sum / count) * 100) / 100;

/**
 * What the published scores of `reviewerRole` say on each of its
 * `dimensions` (in order), and how many reviews they come from.
 */
export function summarizeRole(
  reviewerRole: LoanRequestRole,
  dimensions: readonly string[],
  reviews: number,
  tallies: readonly ScoreTally[],
): RoleTrust {
  return {
    reviews,
    dimensions: dimensions.map((dimension): DimensionTrust => {
      const distribution = [0, 0, 0, 0, 0];
      let setAside = 0;
      let sum = 0;

      for (const tally of tallies) {
        if (
          tally.reviewerRole !== reviewerRole ||
          tally.dimension !== dimension
        ) {
          continue;
        }

        if (scoreContested(tally, tally.reopened)) {
          setAside += tally.count;
          continue;
        }

        const index = tally.score - 1;
        distribution[index] = (distribution[index] ?? 0) + tally.count;
        sum += tally.score * tally.count;
      }

      const count = distribution.reduce((total, n) => total + n, 0);

      return {
        dimension,
        count,
        mean: roundedMean(sum, count),
        distribution,
        setAside,
      };
    }),
  };
}
