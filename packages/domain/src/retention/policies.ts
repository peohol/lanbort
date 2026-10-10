import { definePolicy } from "../authorization/policy";
import { requireSystemProcess } from "../authorization/rules";

/** Deletes what the pilot's retention policy no longer keeps (OD-0002). */
export const retentionProcess = "data.retention";

export const purgeExpiredDataPolicy = definePolicy<void, void>({
  action: "data.purge_expired",
  actor: [requireSystemProcess(retentionProcess)],
});

export const retentionPolicies = [purgeExpiredDataPolicy];
