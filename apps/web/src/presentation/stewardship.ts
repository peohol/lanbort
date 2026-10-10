import type { CaseSummary } from "@lanbort/contracts";
import {
  newPasskeyHref,
  platformQueueHref,
  stewardshipHref,
} from "@/navigation/stewardship";

/**
 * How a platform steward's role stands in this session (ADR-0011, OD-0023,
 * «Plattformforvaltning v1»), in the order the pages check it:
 * - `setup`: no passkeys yet;
 * - `closed`: fewer than the minimum, so steward actions are closed;
 * - `unconfirmed`: no confirmation in the last 10 minutes;
 * - `confirmed`: steward actions are open.
 */
export type StewardStanding = "setup" | "closed" | "unconfirmed" | "confirmed";

export function stewardStanding(steward: {
  passkeys: readonly unknown[];
  minimum: number;
  strong: boolean;
}): StewardStanding {
  if (steward.passkeys.length === 0) return "setup";
  if (steward.passkeys.length < steward.minimum) return "closed";

  return steward.strong ? "confirmed" : "unconfirmed";
}

/** Why the queue cannot be opened yet, by standing. */
export const queueLockedText: Record<
  Exclude<StewardStanding, "confirmed">,
  string
> = {
  setup: "Krever to passkeys",
  closed: "Krever to passkeys",
  unconfirmed: "Krever bekreftelse med passkey",
};

/** Who has the open cases in the queue: nobody, the reader, or others. */
export function queueCounts(
  cases: readonly CaseSummary[],
  userId: string,
): { unassigned: number; yours: number; others: number } {
  const open = cases.filter((c) => c.status === "open");
  const yours = open.filter((c) => c.assigneeUserId === userId).length;
  const unassigned = open.filter((c) => c.assigneeUserId === null).length;

  return { unassigned, yours, others: open.length - yours - unassigned };
}

/** «3 som ingen har tatt · 1 du har», leaving out what is none. */
export function queueCountsText({
  unassigned,
  yours,
  others,
}: ReturnType<typeof queueCounts>): string {
  const parts = [
    unassigned > 0 && `${unassigned} som ingen har tatt`,
    yours > 0 && `${yours} du har`,
    others > 0 && `${others} andre har`,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" · ") : "Ingen saker venter";
}

/** «1 aktiv · minst 2, høyst 10». */
export function passkeyCountText(
  count: number,
  minimum: number,
  maximum: number,
): string {
  return `${count} ${count === 1 ? "aktiv" : "aktive"} · minst ${minimum}, høyst ${maximum}`;
}

/** How a passkey came to be: the first with a code, the rest with a passkey. */
export const enrolledWithText = {
  enrollment_code: "med registreringskode",
  passkey: "med passkey",
} as const;

/**
 * The steward's one task on Home, under «For Lånbort» (Tomat screen 1):
 * cases nobody has taken lead to the queue, anything else to the step that
 * opens the role.
 */
export function stewardHomeTask(
  standing: StewardStanding,
  unassigned: number | null,
): { text: string; detail: string | null; href: string } {
  switch (standing) {
    case "setup":
      return { text: "Sett opp passkeys", detail: null, href: newPasskeyHref };
    case "closed":
      return {
        text: "Legg til en passkey",
        detail: "Forvalterhandlinger er stengt under to",
        href: newPasskeyHref,
      };
    case "unconfirmed":
      return {
        text: "Åpne forvaltningen",
        detail: "Bekreft med passkey for å se plattformsaker",
        href: stewardshipHref,
      };
    case "confirmed":
      return unassigned
        ? {
            text: `Behandle ${unassigned} ${unassigned === 1 ? "plattformsak" : "plattformsaker"}`,
            detail: `Ingen har tatt ${unassigned === 1 ? "den" : "dem"} ennå`,
            href: platformQueueHref(),
          }
        : {
            text: "Åpne forvaltningen",
            detail: "Ingen plattformsaker venter",
            href: stewardshipHref,
          };
  }
}
