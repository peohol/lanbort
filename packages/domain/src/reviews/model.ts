import type { LoanEndReason, LoanRequestRole } from "@lanbort/contracts";
import { DomainError } from "../errors";

/**
 * Pure rules of reviews after a loan (WP-50, PS-TRUST-001–005). The database
 * opens a loan's review window when the loan ends, pauses it when an ended
 * loan reopens before publication, and opens it again for the next ending
 * (PS-TRUST-008); these rules decide what the parties may do in it.
 */

/**
 * PS-TRUST-003, pilot standard: how long the parties have to review after
 * the loan ended (the database's `app.loan_review_window()`).
 */
export const reviewWindowDays = 14;

export function reviewDueAt(endedAt: Date): Date {
  return new Date(endedAt.getTime() + reviewWindowDays * 24 * 60 * 60 * 1000);
}

/**
 * A loan's review window as stored. `open` until both have reviewed or
 * `dueAt`; `paused` while the loan is reopened; `closed` once the reviews
 * were published.
 */
export type StoredReviewWindowStatus = "open" | "paused" | "closed";

export interface ReviewWindowRecord {
  readonly loanId: string;
  readonly borrowerUserId: string;
  readonly lenderUserId: string;
  /** How the loan ended: what the parties experienced (PS-TRUST-001). */
  readonly basis: LoanEndReason;
  readonly openedAt: Date;
  readonly dueAt: Date | null;
  readonly status: StoredReviewWindowStatus;
  readonly closedAt: Date | null;
}

/**
 * Whether the window is over as of `now` without being recorded as closed
 * yet: the reviews given count as published from `dueAt` on, however late
 * the job comes by.
 */
export function windowOver(window: ReviewWindowRecord, now: Date): boolean {
  return (
    window.status === "open" &&
    window.dueAt !== null &&
    window.dueAt.getTime() <= now.getTime()
  );
}

/** The window's status as of `now`. */
export function presentedWindowStatus(
  window: ReviewWindowRecord,
  now: Date,
): StoredReviewWindowStatus {
  return windowOver(window, now) ? "closed" : window.status;
}

/** Why nobody may review in the window now, or null if they may. */
export function reviewRefusal(
  window: ReviewWindowRecord | null,
  now: Date,
): string | null {
  switch (window && presentedWindowStatus(window, now)) {
    case null:
      return "The loan has not ended";
    case "paused":
      return "The loan has reopened";
    case "closed":
      return "The review window has closed";
    default:
      return null;
  }
}

export function otherSide(role: LoanRequestRole): LoanRequestRole {
  return role === "borrower" ? "lender" : "borrower";
}

/** The window's party of `role`. */
export function windowParty(
  window: Pick<ReviewWindowRecord, "borrowerUserId" | "lenderUserId">,
  role: LoanRequestRole,
): string {
  return role === "borrower" ? window.borrowerUserId : window.lenderUserId;
}

/** A dimension one side scores after the window's ending. */
export interface ReviewDimension {
  readonly code: string;
  /**
   * It rests on the return having happened, so it is contested once a
   * confirmed return is contradicted (PS-TRUST-008).
   */
  readonly restsOnReturn: boolean;
}

export interface ReviewScore {
  readonly dimension: string;
  readonly score: number;
}

/**
 * PS-TRUST-001/002: a review scores exactly the dimensions the ending lets
 * its side assess, each once, and explains itself briefly when any score is
 * 1 or 2. Returns the scores in the dimensions' order.
 */
export function validateReview(
  scores: readonly ReviewScore[],
  text: string | null,
  dimensions: readonly ReviewDimension[],
): ReviewScore[] {
  const given = new Map(scores.map((score) => [score.dimension, score.score]));

  if (
    given.size !== scores.length ||
    given.size !== dimensions.length ||
    dimensions.some(({ code }) => !given.has(code))
  ) {
    throw new DomainError("invalid_input", "Score each dimension once", [
      "scores",
    ]);
  }

  if (text === null && scores.some(({ score }) => score <= 2)) {
    throw new DomainError("invalid_input", "Explain a score of 1 or 2", [
      "text",
    ]);
  }

  return dimensions.map(({ code }) => ({
    dimension: code,
    score: given.get(code) as number,
  }));
}

/** Whether two sets of scores say the same. */
export function sameScores(
  a: readonly ReviewScore[],
  b: readonly ReviewScore[],
): boolean {
  const scores = new Map(a.map((score) => [score.dimension, score.score]));

  return (
    a.length === b.length &&
    b.every(({ dimension, score }) => scores.get(dimension) === score)
  );
}
