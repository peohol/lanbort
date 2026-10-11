import { newAccountsOpen } from "@lanbort/auth";
import { serverEnv } from "./env";

const cacheMs = 5 * 60 * 1000;
let cached: { open: boolean; until: number } | undefined;

/**
 * Whether new addresses get an account, or only invited ones can sign in
 * (a closed pilot, PS-NFR-015). Read from the auth provider, which enforces
 * it, at most every five minutes. It chooses the words on the sign-in page
 * and keeps pilot chat closed when Lånbort opens (`chatEnabled`), so a
 * provider that cannot say counts as open, the default.
 */
export async function newAccountsAreOpen(): Promise<boolean> {
  if (cached && cached.until > Date.now()) {
    return cached.open;
  }

  try {
    const env = serverEnv();
    const open = await newAccountsOpen({
      url: env.SUPABASE_URL,
      publishableKey: env.SUPABASE_PUBLISHABLE_KEY,
    });
    cached = { open, until: Date.now() + cacheMs };
    return open;
  } catch {
    return true;
  }
}
