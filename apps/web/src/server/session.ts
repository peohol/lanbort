import type { OwnAccount } from "@lanbort/contracts";
import { executeQuery, getOwnAccount, resolveUserActor } from "@lanbort/domain";
import { cookies } from "next/headers";
import { runtime } from "./runtime";

/**
 * The signed-in user's account for rendering pages, or null. Pages cannot set
 * cookies, so a token refresh here is not persisted; the proxy refreshes
 * sessions before pages render. This only decides what to show: every action
 * is authorized again by the API.
 */
export async function getPageAccount(): Promise<OwnAccount | null> {
  const store = await cookies();
  const auth = runtime.auth(
    { getAll: () => store.getAll(), setAll: () => {} },
    { secureCookies: false },
  );
  const identity = await auth.currentIdentity();

  if (!identity) {
    return null;
  }

  const domain = runtime.domain();
  const actor = await resolveUserActor(domain, identity);

  return actor
    ? executeQuery(domain, getOwnAccount, { actor, input: {} })
    : null;
}
