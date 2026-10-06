/**
 * The addresses of Lånbort's pages (WP-80), in one place, so pages link to
 * each other by name and an address changes in one line. The five areas,
 * the account and the notification layer are in `areas.ts`; chat in
 * `chat.ts`. Some pages here are built by later packages (UI plan); until
 * a page exists, nothing leads to it (`targets.ts`).
 */

/** How a thing is seen: through one environment, or directly as a friend. */
export type ObjectOrigin =
  | { readonly kind: "environment"; readonly environmentId: string }
  | { readonly kind: "direct" };

/** The query parameter that names the environment a thing is seen in. */
export const environmentParam = "miljo";

const query = (params: Record<string, string | undefined>) => {
  const search = new URLSearchParams(
    Object.entries(params).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  ).toString();

  return search ? `?${search}` : "";
};

const originQuery = (origin?: ObjectOrigin) =>
  query({
    [environmentParam]:
      origin?.kind === "environment" ? origin.environmentId : undefined,
  });

/** A thing: its owners' view, or another user's through `origin`. */
export const objectHref = (id: string, origin?: ObjectOrigin) =>
  `/ting/${id}${originQuery(origin)}`;

/** Register a thing, from an environment when one is given (UX-JRN-003). */
export const newObjectHref = (environmentId?: string) =>
  `/ting/ny${query({ [environmentParam]: environmentId })}`;

export const editObjectHref = (id: string) => `/ting/${id}/rediger`;

/** Ask to borrow a thing through `origin` (UX-JRN-004). */
export const requestObjectHref = (id: string, origin: ObjectOrigin) =>
  `/ting/${id}/lan${originQuery(origin)}`;

/** The loan's own page (WP-64). */
export const loanHref = (id: string) => `/lan/${id}`;

export const loanRequestHref = (id: string) => `/lan/foresporsel/${id}`;

export const environmentHref = (id: string) => `/miljoer/${id}`;

export const environmentAdminHref = (id: string) =>
  `${environmentHref(id)}/administrer`;

export const newEnvironmentHref = "/miljoer/ny";

export const personHref = (id: string) => `/personer/${id}`;

export const caseHref = (id: string) => `/saker/${id}`;

/** Own cases and, for those who handle cases, their queues. */
export const casesHref = "/saker";
