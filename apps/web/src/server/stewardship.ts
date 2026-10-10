import type { StewardPasskeys } from "@lanbort/contracts";
import {
  listOwnPasskeys,
  listPlatformCaseQueue,
  maximumStewardPasskeys,
  passkeyConfirmationMaxAgeMs,
} from "@lanbort/domain";
import { notFound } from "next/navigation";
import { cache } from "react";
import { platformStewardsEnabled } from "./env";
import { pageQueryIfAllowed } from "./session";

/**
 * Where the signed-in platform steward stands (ADR-0011, OD-0023): whether
 * the role works in this deployment at all, their passkeys, and until when
 * this session's confirmation counts. It only decides what pages show;
 * every steward action is authorized again by its own policy.
 */
export interface Stewardship extends StewardPasskeys {
  /** PLATFORM_STEWARDS_ENABLED: off in production until verified there. */
  readonly enabled: boolean;
  readonly maximum: number;
  /**
   * When this session's passkey confirmation stops counting, while it
   * still does; with fewer than `minimum` passkeys it only lets the
   * steward add one without a code.
   */
  readonly freshUntil: string | null;
}

/** The steward's standing, or null for anyone who does not hold the role. */
export const getStewardship = cache(async (): Promise<Stewardship | null> => {
  const passkeys = await pageQueryIfAllowed(listOwnPasskeys, {});

  if (!passkeys) return null;

  const until =
    passkeys.confirmedAt &&
    new Date(passkeys.confirmedAt).getTime() + passkeyConfirmationMaxAgeMs;

  return {
    ...passkeys,
    enabled: platformStewardsEnabled(),
    maximum: maximumStewardPasskeys,
    freshUntil:
      until && until > Date.now() ? new Date(until).toISOString() : null,
  };
});

/** A steward page: anyone without the role sees «not found». */
export async function requireStewardship(): Promise<Stewardship> {
  return (await getStewardship()) ?? notFound();
}

/**
 * The first page of open platform cases, for the counts on Home and
 * «Forvaltning»; null unless steward actions are open in this session.
 */
export const getOpenPlatformCases = cache(async () => {
  const steward = await getStewardship();

  if (!steward?.enabled || !steward.strong) return null;

  return pageQueryIfAllowed(listPlatformCaseQueue, { status: "open" });
});
