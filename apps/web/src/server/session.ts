import type { OwnAccount } from "@lanbort/contracts";
import {
  executeQuery,
  getOwnAccount,
  isDomainError,
  type QueryDefinition,
  resolveUserActor,
  type UserActor,
} from "@lanbort/domain";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { registrationHref, signInHref } from "@/navigation/routes";
import { pagePathHeader } from "./page-path";
import { runtime } from "./runtime";

/**
 * The signed-in actor for rendering pages, or null; resolved once per
 * request however many parts of the page ask. Pages cannot set cookies, so
 * a token refresh here is not persisted; the proxy refreshes sessions
 * before pages render. This only decides what to show: every action is
 * authorized again by the API.
 */
const getPageActor = cache(async (): Promise<UserActor | null> => {
  const store = await cookies();
  const auth = runtime.auth(
    { getAll: () => store.getAll(), setAll: () => {} },
    { secureCookies: false },
  );
  const identity = await auth.currentIdentity();

  return identity ? resolveUserActor(runtime.domain(), identity) : null;
});

/** The address of the page being shown, to come back to after signing in. */
async function pagePath(): Promise<string | undefined> {
  return (await headers()).get(pagePathHeader) ?? undefined;
}

/** To sign in, and then back to this page. */
async function toSignIn(): Promise<never> {
  redirect(signInHref(await pagePath()));
}

/**
 * A query for a page as the signed-in user, through the same policy as the
 * API; null when nobody is signed in.
 */
export async function pageQuery<I, R, C, O>(
  query: QueryDefinition<I, R, C, O>,
  input: I,
): Promise<O | null> {
  const actor = await getPageActor();

  return actor ? executeQuery(runtime.domain(), query, { actor, input }) : null;
}

/**
 * A page's query for one thing, for a signed-in user. Something the caller
 * may not see shows the same «not found» page as something that does not
 * exist, and so does an address that names nothing (PS-NFR-002).
 */
export async function pageQueryOrNotFound<I, R, C, O>(
  query: QueryDefinition<I, R, C, O>,
  input: I,
): Promise<O> {
  try {
    const output = await pageQuery(query, input);

    if (output === null) {
      return await toSignIn();
    }

    return output;
  } catch (error) {
    if (
      isDomainError(error) &&
      ["not_found", "forbidden", "invalid_input"].includes(error.code)
    ) {
      notFound();
    }

    throw error;
  }
}

/**
 * A page's query for a part it shows only to those who may see it: null
 * when the caller may not, rather than the whole page failing.
 */
export async function pageQueryIfAllowed<I, R, C, O>(
  query: QueryDefinition<I, R, C, O>,
  input: I,
): Promise<O | null> {
  try {
    return await pageQuery(query, input);
  } catch (error) {
    if (
      isDomainError(error) &&
      ["not_found", "forbidden"].includes(error.code)
    ) {
      return null;
    }

    throw error;
  }
}

/** The signed-in user's account for rendering pages, or null. */
export const getPageAccount = cache((): Promise<OwnAccount | null> =>
  pageQuery(getOwnAccount, {}),
);

/**
 * The account of a page that needs a signed-in, registered user; anyone
 * else is sent where they can become one. An account that is not active is
 * let in too: it keeps what it is already bound by (PS-ADM-002), and each
 * page shows what it may still do. Data on the page still comes through the
 * queries' own policies.
 */
export async function requirePageAccount(): Promise<OwnAccount> {
  const account = await getPageAccount();

  if (!account) {
    return toSignIn();
  }

  if (account.status === "pending_registration") {
    redirect(registrationHref(await pagePath()));
  }

  return account;
}
