import {
  type CaseKind,
  type PlatformLookup,
  platformLookupSchema,
} from "@lanbort/contracts";
import type { InterventionFlowKey } from "@/presentation/interventions";
import type { SearchParams } from "./list-pages";
import { caseHref, objectHref, personHref } from "./routes";

/**
 * The platform stewards' pages (PS-ADM-015, ADR-0011, «Plattformforvaltning
 * v1»): «Forvaltning», their passkeys and the platform queue. Cases
 * themselves are at `caseHref`, as for every other handler.
 */
export const stewardshipHref = "/forvaltning";

export const passkeysHref = `${stewardshipHref}/passkeys`;

export const newPasskeyHref = `${passkeysHref}/ny`;

/** A steward's own inquiry, where no report came in (PS-ADM-015). */
export const inquiryHref = `${stewardshipHref}/saksgrunnlag`;

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

/**
 * A steward's intervention from a case (PS-ADM-015): the choices, or one
 * intervention's steps, by the word in its address.
 */
export const interventionSlugs = {
  suspend: "suspender",
  reinstate: "gjeninnsett",
  "start-closure": "avslutt",
  "complete-closure": "fullfor-avslutning",
  "false-identity": "falsk-identitet",
  "end-roles": "avslutt-roller",
} as const satisfies Record<InterventionFlowKey, string>;

export const interventionHref = (caseId: string, key?: InterventionFlowKey) =>
  `${caseHref(caseId)}/inngrep${key ? `/${interventionSlugs[key]}` : ""}`;

/** The intervention an address names, or null. */
export const interventionBySlug = (slug: string) =>
  (Object.entries(interventionSlugs) as [InterventionFlowKey, string][]).find(
    ([, each]) => each === slug,
  )?.[0] ?? null;

/** The id in a link to a page `href` makes, or null. */
function idInLink(link: string, href: (id: string) => string): string | null {
  const marker = "~";
  const prefix = href(marker).split(marker)[0]!;
  let path: string;

  try {
    path = new URL(link, "http://localhost").pathname;
  } catch {
    return null;
  }

  return path.startsWith(prefix)
    ? (path.slice(prefix.length).split("/")[0] ?? null)
    : null;
}

/**
 * What a steward typed to find an account or a thing (OD-0055), as its
 * lookup: the full e-mail address, or the link to the person's or the
 * thing's page, read from its address. Null for anything else, since there
 * is no search.
 */
export function lookupOf(
  kind: "user" | "object",
  text: string,
): PlatformLookup | null {
  const value = text.trim();
  const id = idInLink(value, kind === "user" ? personHref : objectHref);
  const lookup =
    kind === "object"
      ? { by: "object", objectId: id }
      : value.includes("@") && !value.includes("/")
        ? { by: "email", email: value }
        : { by: "person", userId: id };
  const parsed = platformLookupSchema.safeParse(lookup);

  return parsed.success ? parsed.data : null;
}
