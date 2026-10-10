import { readUnavailabilityTarget } from "@lanbort/domain";
import { unavailabilityReportHref } from "@/navigation/cases";
import { platformStewardsEnabled } from "./env";
import { pageQueryIfAllowed } from "./session";

/**
 * Where the reader may tell Lånbort that `userId` may have died
 * (PS-COM-015), by the same rule the report is taken by: a concrete
 * relation and no block between them. None until Lånbort's platform
 * stewards can handle cases (ADR-0011, OD-0023), or with no person.
 */
export async function unavailabilityReportLink(
  userId: string | null,
): Promise<string | null> {
  if (!userId || !platformStewardsEnabled()) {
    return null;
  }

  const target = await pageQueryIfAllowed(readUnavailabilityTarget, {
    userId,
  });

  return target && unavailabilityReportHref(target.userId);
}
