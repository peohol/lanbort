import { liftingMeasureKinds } from "@lanbort/contracts";
import { moderationMeasureTaken } from "../../moderation/events";
import { measureAffected } from "../../moderation/notice";
import { notifyOn, tell } from "../rule";

/**
 * PS-TRUST-018: whoever a measure hits is told, as a required notice that
 * names the measure and leads to its reason. It says nothing of a report,
 * who sent it or who decided. A measure that lifts an earlier one is told
 * to those the earlier one hit, as plain information.
 */
export const moderationRules = [
  notifyOn(moderationMeasureTaken, async ({ db, event, payload }) =>
    tell(
      await measureAffected(db, event.resourceId),
      liftingMeasureKinds.has(payload.measure)
        ? "moderation.block_lifted"
        : "moderation.measure_taken",
      { type: "moderation_measure", id: event.resourceId },
      payload.measure,
    ),
  ),
];
