import type {
  LoanEndReason,
  LoanReview,
  LoanReviews,
} from "@lanbort/contracts";
import { formatTime } from "./dates";

/**
 * What each dimension asks, in the reviewer's words (vision 07, «Utlåners
 * perspektiv» and «Låntakers perspektiv»). The dimensions are data on the
 * server; one without words here is shown by its code until it gets them.
 */
const dimensionLabels: Record<string, string> = {
  pickup_on_time: "Hentet til avtalt tid",
  return_on_time: "Leverte tilbake til avtalt tid",
  condition_at_return: "Rimelig tilstand ved retur",
  available_at_handover: "Gjorde tingen tilgjengelig til avtalt tid",
  available_for_return: "Var tilgjengelig for tilbakeleveringen",
  matches_description: "Tingen stemte med beskrivelsen",
  communication: "Kommunikasjon",
};

export const dimensionLabel = (dimension: string) =>
  dimensionLabels[dimension] ?? dimension;

/** PS-TRUST-002: the scale, from worst to best. */
export const reviewScores = [1, 2, 3, 4, 5] as const;

/**
 * UX-JRN-010, PS-TRUST-001: why only some things are asked, when the loan
 * did not go the whole way. An unresolved ending is said plainly, and says
 * nothing about who was right.
 */
const basisNotes: Partial<Record<LoanEndReason, string>> = {
  cancelled:
    "Lånet ble kansellert før overleveringen, så du vurderer bare det som skjedde frem til da.",
  not_completed:
    "Tingen ble aldri overlevert, så du vurderer bare det som skjedde rundt overleveringen.",
  unresolved:
    "Lånet ble avsluttet som uavklart. Du vurderer bare kommunikasjonen, og anmeldelsene merkes som etter et uavklart lån.",
};

export const basisNote = (basis: LoanEndReason) => basisNotes[basis] ?? null;

/**
 * UX-JRN-010, PS-TRUST-003: said before anything is sent. Both reviews are
 * published together, so neither side can answer the other's.
 */
export function hiddenUntil(reviews: LoanReviews, other: string): string {
  const due = reviews.window?.dueAt;

  return due
    ? `Anmeldelsen din er skjult til ${other} også har anmeldt deg, eller til fristen ${formatTime(due)}. Da vises begge samtidig.`
    : `Anmeldelsen din er skjult til ${other} også har anmeldt deg, eller til fristen går ut. Da vises begge samtidig.`;
}

/** A score as a line, with what moderation or a reopened loan changed. */
export interface ScoreLine {
  readonly dimension: string;
  readonly label: string;
  readonly text: string;
}

export function scoreLines(review: LoanReview): ScoreLine[] {
  const removed = new Set(review.moderated.removedDimensions);

  return review.scores.map(({ dimension, score, contested }) => ({
    dimension,
    label: dimensionLabel(dimension),
    text: removed.has(dimension)
      ? "Fjernet av moderering"
      : `${score} av 5${contested ? " (omstridt etter at lånet ble åpnet igjen)" : ""}`,
  }));
}
