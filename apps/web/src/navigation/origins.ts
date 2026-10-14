/** The stable Vercel hostname kept for ordinary app access. */
export const stableVercelHost = "lanbort.vercel.app";

/**
 * Pages that can start or depend on the platform steward's WebAuthn
 * ceremonies. The stable Vercel alias deliberately does not serve these:
 * its registrable domain cannot share either passkeys or session cookies
 * with the canonical Lånbort origin.
 */
export function requiresCanonicalStewardOrigin(pathname: string): boolean {
  return (
    pathname === "/forvaltning" ||
    pathname.startsWith("/forvaltning/") ||
    /^\/saker\/[^/]+\/inngrep(?:\/|$)/.test(pathname)
  );
}
