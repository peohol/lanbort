import type { OwnAccount } from "@lanbort/contracts";
import {
  executeQuery,
  getOwnAccount,
  type QueryDefinition,
  resolveUserActor,
  type UserActor,
} from "@lanbort/domain";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
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

/** The signed-in user's account for rendering pages, or null. */
export const getPageAccount = cache((): Promise<OwnAccount | null> =>
  pageQuery(getOwnAccount, {}),
);

/**
 * The account of a page that needs a signed-in, registered user; anyone
 * else is sent where they can become one. Data on the page still comes
 * through the queries' own policies.
 */
export async function requirePageAccount(): Promise<OwnAccount> {
  const account = await getPageAccount();

  if (!account) {
    redirect("/logg-inn");
  }

  if (account.status !== "active") {
    redirect("/registrering");
  }

  return account;
}
