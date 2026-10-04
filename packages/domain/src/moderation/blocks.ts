import type { AvailabilityBlockSource } from "../objects/blocks";
import { platformBlockedObjects } from "./store";

/**
 * A steward's block (WP-52, `object_blocked`) keeps the object from new
 * loans on every date, until it is lifted. Loans already approved go on.
 */
export const platformModerationBlocks: AvailabilityBlockSource = {
  name: "platform_moderation",
  load: async (db, objectIds) =>
    (await platformBlockedObjects(db, objectIds)).map((objectId) => ({
      objectId,
      period: { from: null, until: null },
    })),
};
