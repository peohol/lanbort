import { newAccountsOpen } from "@lanbort/auth";
import { serverEnv } from "./env";

/** How old an answer the sign-in page accepts: it only chooses words. */
export const signInPageMaxAgeMs = 5 * 60 * 1000;

let cached: { open: boolean; at: number } | undefined;

/**
 * Whether new addresses get an account, or only invited ones can sign in
 * (a closed pilot, PS-NFR-015). Read from the auth provider, which enforces
 * it; the caller says how old an answer it accepts. It chooses the words on
 * the sign-in page and keeps pilot chat closed when Lånbort opens
 * (`chatEnabled`), so a provider that cannot say counts as open, the default.
 */
export async function newAccountsAreOpen(maxAgeMs: number): Promise<boolean> {
  if (cached && cached.at + maxAgeMs > Date.now()) {
    return cached.open;
  }

  try {
    const env = serverEnv();
    const open = await newAccountsOpen({
      url: env.SUPABASE_URL,
      publishableKey: env.SUPABASE_PUBLISHABLE_KEY,
    });
    cached = { open, at: Date.now() };
    return open;
  } catch {
    return true;
  }
}
