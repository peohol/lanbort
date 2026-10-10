import type { CaseKind } from "@lanbort/contracts";
import type { SearchParams } from "./list-pages";

/**
 * The platform stewards' pages (PS-ADM-015, ADR-0011, «Plattformforvaltning
 * v1»): «Forvaltning», their passkeys and the platform queue. Cases
 * themselves are at `caseHref`, as for every other handler.
 */
export const stewardshipHref = "/forvaltning";

export const passkeysHref = `${stewardshipHref}/passkeys`;

export const newPasskeyHref = `${passkeysHref}/ny`;

/** The platform queue's own address, without its filters. */
export const platformQueuePath = `${stewardshipHref}/ko`;

/**
 * The queue's filters by kind (Tomat «Plattformkøen»): every platform kind
 * belongs to one, under the word the stewards know it by.
 */
export const platformQueueFilters = {
  rapporter: { label: "Rapporter", kinds: ["platform_report"] },
  meldinger: { label: "Meldinger", kinds: ["unavailability_report"] },
  saksgrunnlag: { label: "Saksgrunnlag", kinds: ["platform_inquiry"] },
} as const satisfies Record<
  string,
  { label: string; kinds: readonly CaseKind[] }
>;

export type PlatformQueueFilter = keyof typeof platformQueueFilters;

const kindParam = "type";
const statusParam = "vis";

/** The platform queue: open or closed cases, of one filter or all. */
export function platformQueueHref({
  status = "open",
  filter,
}: {
  status?: "open" | "closed";
  filter?: PlatformQueueFilter | undefined;
} = {}): string {
  const params = new URLSearchParams();

  if (filter) params.set(kindParam, filter);
  if (status === "closed") params.set(statusParam, "lukkede");

  const search = params.toString();

  return `${platformQueuePath}${search ? `?${search}` : ""}`;
}

/** What a platform queue address asks for. */
export function parsePlatformQueue(params: SearchParams): {
  status: "open" | "closed";
  filter: PlatformQueueFilter | undefined;
} {
  const kind = params[kindParam];

  return {
    status: params[statusParam] === "lukkede" ? "closed" : "open",
    filter:
      typeof kind === "string" && Object.hasOwn(platformQueueFilters, kind)
        ? (kind as PlatformQueueFilter)
        : undefined,
  };
}
