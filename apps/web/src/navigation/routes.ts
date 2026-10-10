/**
 * The addresses of Lånbort's pages (WP-80), in one place, so pages link to
 * each other by name and an address changes in one line. The five areas,
 * the account and the notification layer are in `areas.ts`; chat in
 * `chat.ts`. Some pages here are built by later packages (UI plan); until
 * a page exists, nothing leads to it (`targets.ts`).
 */

import { accountHref } from "./areas";

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

/** The element id of a thing's questions and answers on its page. */
export const questionsAnchor = "sporsmal";

/**
 * Where a question about a thing is read and answered (PS-OBJ-015): the
 * thing in the environment it was asked in, at its questions. An owner
 * sees their own view there, with the questions from every environment.
 */
export const objectQuestionsHref = (objectId: string, environmentId: string) =>
  `${objectHref(objectId, { kind: "environment", environmentId })}#${questionsAnchor}`;

/** One question, for a notification that names only the question. */
export const objectQuestionHref = (questionId: string) =>
  `/ting/sporsmal/${questionId}`;

/** Ask to borrow a thing through `origin` (UX-JRN-004). */
export const requestObjectHref = (id: string, origin: ObjectOrigin) =>
  `/ting/${id}/lan${originQuery(origin)}`;

/** The loan's own page (WP-64). */
export const loanHref = (id: string) => `/lan/${id}`;

export const loanRequestHref = (id: string) => `/lan/foresporsel/${id}`;

export const environmentHref = (id: string) => `/miljoer/${id}`;

export const environmentAdminHref = (id: string) =>
  `${environmentHref(id)}/administrer`;

/** «Om miljøet og medlemmer»: what it is, who is in it, your membership. */
export const environmentAboutHref = (id: string) => `${environmentHref(id)}/om`;

/** Joining, applying or answering requirements, as a bounded task. */
export const environmentJoinHref = (id: string) =>
  `${environmentHref(id)}/bli-med`;

/** The query parameter that marks the first visit after joining. */
export const welcomeParam = "velkommen";

/** The environment right after joining it, where the member is welcomed. */
export const environmentWelcomeHref = (id: string) =>
  `${environmentHref(id)}?${welcomeParam}`;

export const newEnvironmentHref = "/miljoer/ny";

/**
 * The role a person has where their page is opened from, which their trust
 * profile shows first (UX-PRIV-012), and its value in the address.
 */
export type PersonRole = "borrower" | "lender";
export const personRoleParam = "rolle";
export const personRoleValues: Record<PersonRole, string> = {
  borrower: "laantaker",
  lender: "utlaaner",
};

/** A person, from a loan, a request or a thing in the `role` they have there. */
export const personHref = (id: string, role?: PersonRole) =>
  `/personer/${id}${query({ [personRoleParam]: role && personRoleValues[role] })}`;

/** The last part of the address of a person's page for one role. */
export const personRoleSegment = (role: PersonRole) =>
  `som-${personRoleValues[role]}`;

/** What others said about a person in one role, with the reviews (WP-86). */
export const personRoleHref = (id: string, role: PersonRole) =>
  `/personer/${id}/${personRoleSegment(role)}`;

export const caseHref = (id: string) => `/saker/${id}`;

/** Own cases and, for those who handle cases, their queues. */
export const casesHref = "/saker";

/** The account's own pages (UX-IA-020), each a step in its stack. */
export const friendsHref = `${accountHref}/venner`;
export const blockedHref = `${accountHref}/blokkerte`;
export const notificationChoicesHref = `${accountHref}/varslingsvalg`;
export const accountStateHref = `${accountHref}/kontoen`;
export const profilePictureHref = `${accountHref}/profilbilde`;

/**
 * Pages that open inside the account when they are reached from it, so
 * they join its stack (UX-IA-020): people, and the user's own cases with
 * a case from them. Each has a page of the same name under the account.
 */
const withinAccount = [
  /^\/personer\/[^/?#]+$/,
  /^\/saker$/,
  /^\/saker\/(?!ny$)[^/?#]+$/,
];

/** Where `href` leads when it is followed from inside the account. */
export function accountLayerHref(href: string): string | null {
  const path = href.split(/[?#]/, 1)[0]!;

  return withinAccount.some((pattern) => pattern.test(path))
    ? `${accountHref}${href}`
    : null;
}

/** The query parameter of the link in a notification's e-mail (WP-41). */
export const notificationParam = "varsel";

/** The query parameter that says where to go once signed in. */
export const returnParam = "neste";

/**
 * A place to return to after signing in, if it stays within Lånbort: a path
 * of our own, never another site (`//host`, `/\host`) or a control
 * character a browser would drop to make one.
 */
export function returnPath(value: unknown): string | undefined {
  return typeof value === "string" &&
    /^\/(?![/\\])[^\\\u0000-\u001f]*$/.test(value)
    ? value
    : undefined;
}

export const signInHref = (next?: string) =>
  `/logg-inn${query({ [returnParam]: returnPath(next) })}`;

export const registrationHref = (next?: string) =>
  `/registrering${query({ [returnParam]: returnPath(next) })}`;

/** Where a notification's e-mail link leads: Home, which forwards it. */
export const notificationLinkHref = (id: string) =>
  `/${query({ [notificationParam]: id })}`;
