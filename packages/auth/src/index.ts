import { createServerClient } from "@supabase/ssr";
import {
  createClient,
  isAuthApiError,
  isAuthError,
} from "@supabase/supabase-js";
import { AuthProviderError } from "./errors";
import { toIdentity, type VerifiedIdentity } from "./identity";

export * from "./errors";
export type { AuthenticationMethod, VerifiedIdentity } from "./identity";

/**
 * Lånbort's only adapter to the auth provider (ADR-0007). Everything vendor
 * specific stays in this package: callers get a provider-neutral identity and a
 * small set of error codes. The adapter is server-only; the browser never
 * talks to the provider and never sees a token (sessions are HttpOnly
 * cookies).
 */

export interface CookieOptions {
  domain?: string;
  expires?: Date;
  httpOnly?: boolean;
  maxAge?: number;
  path?: string;
  sameSite?: boolean | "lax" | "strict" | "none";
  secure?: boolean;
}

export interface CookieToSet {
  name: string;
  value: string;
  options: CookieOptions;
}

/** The request's cookies and a way to set cookies on the response. */
export interface CookieStore {
  getAll(): { name: string; value: string }[];
  /**
   * Writes refreshed or cleared session cookies. `headers` must be set on the
   * same response (they keep CDNs from caching it). Read-only contexts such as
   * server-rendered pages may ignore the call.
   */
  setAll(cookies: CookieToSet[], headers: Record<string, string>): void;
}

export interface AuthConfig {
  url: string;
  publishableKey: string;
  /** Secure cookies everywhere except plain-http local development. */
  secureCookies: boolean;
}

function providerError(error: unknown, invalidCodeOnClientError = false) {
  if (isAuthError(error) && error.status === 429) {
    return new AuthProviderError("rate_limited");
  }

  if (isAuthApiError(error)) {
    if (invalidCodeOnClientError && error.status >= 400 && error.status < 500) {
      return new AuthProviderError("invalid_code");
    }
  }

  return new AuthProviderError("unavailable");
}

/**
 * The provider rejected the session (missing, expired or revoked). Throttling
 * (429) is not a verdict on the session and is reported as `rate_limited`.
 */
function isClientError(error: unknown) {
  return (
    isAuthError(error) &&
    error.status !== undefined &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 429
  );
}

export interface AuthGateway {
  /**
   * Sends a one-time code. Unknown addresses get an account created on
   * verification, or, while new accounts are closed, no code; either way
   * the response never reveals whether an address is registered.
   */
  requestEmailCode(email: string): Promise<void>;
  /** Verifies the code and starts a session (cookies are set). */
  verifyEmailCode(email: string, code: string): Promise<VerifiedIdentity>;
  /**
   * The verified identity of the current session, or null when signed out
   * or the session was revoked. Refreshes an expired access token.
   */
  currentIdentity(): Promise<VerifiedIdentity | null>;
  /**
   * Refreshes an expired access token and writes the new cookies, without
   * asking the provider about the user. For request middleware only; it does
   * not authenticate anybody.
   */
  refreshSession(): Promise<void>;
  /** Revokes the current session at the provider and clears the cookies. */
  signOut(): Promise<void>;
}

export function createAuthGateway(
  config: AuthConfig,
  cookies: CookieStore,
): AuthGateway {
  // One client per request, as @supabase/ssr requires.
  const client = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll: () => cookies.getAll(),
      setAll: (toSet, headers) => cookies.setAll(toSet, headers),
    },
    cookieOptions: {
      httpOnly: true,
      secure: config.secureCookies,
      sameSite: "lax",
      path: "/",
    },
  });
  const auth = client.auth;

  return {
    async requestEmailCode(email) {
      const { error } = await auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true },
      });

      // New accounts are closed (a closed pilot) and the address has none:
      // no code is sent, and the answer is the same as when one is.
      if (
        isAuthApiError(error) &&
        newAccountsClosedCodes.has(error.code ?? "")
      ) {
        return;
      }

      if (error) {
        throw providerError(error);
      }
    },

    async verifyEmailCode(email, code) {
      const { data, error } = await auth.verifyOtp({
        email,
        token: code,
        type: "email",
      });

      if (error || !data.user || !data.session) {
        throw providerError(error, true);
      }

      return toIdentity(data.user, data.session.access_token);
    },

    async currentIdentity() {
      const { data: sessionData } = await auth.getSession();
      const session = sessionData.session;

      if (!session) {
        return null;
      }

      // getSession only reads the cookie; getUser asks the provider, which
      // verifies the token and that the session has not been revoked.
      const { data, error } = await auth.getUser(session.access_token);

      if (error) {
        if (isClientError(error)) {
          return null;
        }
        throw providerError(error);
      }

      return toIdentity(data.user, session.access_token);
    },

    async refreshSession() {
      await auth.getSession();
    },

    async signOut() {
      const { error } = await auth.signOut({ scope: "local" });

      // A session the provider no longer knows is already signed out.
      if (error && !isClientError(error)) {
        throw providerError(error);
      }
    },
  };
}

/** What the provider answers when it creates no new accounts. */
const newAccountsClosedCodes = new Set(["signup_disabled", "otp_disabled"]);

/**
 * Whether the provider creates accounts for new addresses, or only lets in
 * those that already have one (a closed pilot, PS-NFR-015). The provider's
 * own setting is the only source; it is also what enforces it.
 */
export async function newAccountsOpen(
  config: Pick<AuthConfig, "url" | "publishableKey">,
): Promise<boolean> {
  const response = await fetch(`${config.url}/auth/v1/settings`, {
    headers: { apikey: config.publishableKey },
  });

  if (!response.ok) {
    throw new AuthProviderError("unavailable");
  }

  return !((await response.json()) as { disable_signup?: boolean })
    .disable_signup;
}

export interface AuthAdminConfig {
  url: string;
  /** The provider's server-only secret key. */
  secretKey: string;
}

/** Server-only administration of identities at the provider. */
export interface AuthAdmin {
  /**
   * Deletes the identity and its sessions (PS-ADM-006). An identity the
   * provider no longer has counts as deleted, so a retry is harmless.
   */
  deleteUser(subject: string): Promise<void>;
}

export function createAuthAdmin(config: AuthAdminConfig): AuthAdmin {
  const admin = createClient(config.url, config.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).auth.admin;

  return {
    async deleteUser(subject) {
      const { error } = await admin.deleteUser(subject);

      if (error && !(isAuthApiError(error) && error.status === 404)) {
        throw providerError(error);
      }
    },
  };
}
