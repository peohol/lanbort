import { createServerClient } from "@supabase/ssr";
import { isAuthApiError, isAuthError } from "@supabase/supabase-js";
import { AuthProviderError } from "./errors";
import { toIdentity, type VerifiedIdentity } from "./identity";

export * from "./errors";
export type { AuthenticationMethod, VerifiedIdentity } from "./identity";

export type TotpStatus = "none" | "pending" | "verified";

/** What the user needs to add Lånbort to an authenticator app. */
export interface TotpEnrollment {
  /** SVG QR code as a data URL. */
  qrCode: string;
  /** Shared secret for manual entry. */
  secret: string;
}

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
   * verification, so the response never reveals whether an address is
   * registered.
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
  /** The state of the signed-in user's authenticator app (TOTP) factor. */
  totpStatus(): Promise<TotpStatus>;
  /**
   * Starts adding an authenticator app. An unconfirmed earlier attempt is
   * replaced. Must not be called when a confirmed app exists.
   */
  enrollTotp(): Promise<TotpEnrollment>;
  /**
   * Verifies a code from the authenticator app: confirms a pending app, or
   * raises the session to `aal2` with a confirmed one. Returns the session's
   * new identity (cookies are set).
   */
  verifyTotp(code: string): Promise<VerifiedIdentity>;
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

  async function totpFactors() {
    const { data, error } = await auth.mfa.listFactors();

    if (error) {
      throw providerError(error);
    }

    const totp = data.all.filter((factor) => factor.factor_type === "totp");

    return {
      verified: totp.find((factor) => factor.status === "verified"),
      pending: totp.filter((factor) => factor.status === "unverified"),
    };
  }

  return {
    async requestEmailCode(email) {
      const { error } = await auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true },
      });

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

    async totpStatus() {
      const factors = await totpFactors();

      if (factors.verified) {
        return "verified";
      }

      return factors.pending.length > 0 ? "pending" : "none";
    },

    async enrollTotp() {
      const factors = await totpFactors();

      if (factors.verified) {
        throw new AuthProviderError("unavailable");
      }

      // The provider allows one unconfirmed factor per name; start over.
      for (const factor of factors.pending) {
        const { error } = await auth.mfa.unenroll({ factorId: factor.id });

        if (error) {
          throw providerError(error);
        }
      }

      const { data, error } = await auth.mfa.enroll({
        factorType: "totp",
        issuer: "Lånbort",
      });

      if (error) {
        throw providerError(error);
      }

      return { qrCode: data.totp.qr_code, secret: data.totp.secret };
    },

    async verifyTotp(code) {
      const factors = await totpFactors();
      const factor = factors.verified ?? factors.pending[0];

      if (!factor) {
        throw new AuthProviderError("invalid_code");
      }

      const { data, error } = await auth.mfa.challengeAndVerify({
        factorId: factor.id,
        code,
      });

      if (error) {
        throw providerError(error, true);
      }

      return toIdentity(data.user, data.access_token);
    },
  };
}
