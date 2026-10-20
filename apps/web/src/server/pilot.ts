import type { PilotRole } from "@lanbort/contracts";
import { isDomainError, readPilotRole } from "@lanbort/domain";
import { notFound } from "next/navigation";
import { cache } from "react";
import { pilotEnabled } from "./env";
import { pageQueryIfAllowed } from "./session";

/**
 * The signed-in user's role in the closed pilot, or null for everyone else
 * and for everyone while the pilot's workspace is off (`PILOT_ENABLED`). It
 * only decides what pages show; every pilot action is authorized again by
 * its own policy.
 */
export const getPilotRole = cache(async (): Promise<PilotRole | null> => {
  if (!pilotEnabled()) return null;

  try {
    return await pageQueryIfAllowed(readPilotRole, {});
  } catch (error) {
    // An account that is not active takes no part (PS-ADM-001).
    if (isDomainError(error) && error.code === "account_inactive") return null;
    throw error;
  }
});

/** A pilot page: anyone outside the pilot sees «not found». */
export async function requirePilotRole(): Promise<PilotRole> {
  return (await getPilotRole()) ?? notFound();
}

/** A page for the lead only; a participant sees «not found» too. */
export async function requirePilotLead(): Promise<void> {
  if ((await requirePilotRole()).role !== "lead") notFound();
}
